/**
 * DocumentWizard — 7-step transparent document creation wizard.
 *
 * Step 1 : Choose Document Type (category)
 * Step 2 : Choose Template (with full metadata: description, sections, version)
 * Step 3 : Fill Variables (form fields with data-source hints)
 * Step 4 : Document Preview (live preview with DB-resolved variable values)
 * Step 5 : Generate PDF (calls API, shows spinner)
 * Step 6 : Sign Document (optional — signature pad)
 * Step 7 : Publish (confirm, closes wizard)
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { useLanguage } from "@/context/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateSection {
  title: string;
  description: string;
  source: string;
}

interface TemplateVariable {
  name: string;
  label: string;
  source: string;
  required: boolean;
}

interface TemplateCatalog {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  version: string;
  author: string;
  updatedAt: string;
  sections: TemplateSection[];
  variables: TemplateVariable[];
  requiredInputs: string[];
}

interface PreviewData {
  templateId: string;
  syndicateInfo: Record<string, string | null>;
  propertyInfo: Record<string, unknown> | null;
  officeHolders: Record<string, unknown> | null;
  resolvedVariables: Record<string, string | null>;
  resolvedAt: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (docId?: string) => void;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "attestation", labelKey: "wizardCategoryAttestations", descKey: "wizardCategoryAttestationsDesc", icon: "award"       as const, color: "#8b5cf6" },
  { key: "pv",          labelKey: "wizardCategoryGovernance", descKey: "wizardCategoryGovernanceDesc", icon: "clipboard"   as const, color: "#10b981" },
  { key: "finances",    labelKey: "wizardCategoryFinance", descKey: "wizardCategoryFinanceDesc", icon: "dollar-sign" as const, color: "#f59e0b" },
  { key: "juridique",   labelKey: "wizardCategoryLegal", descKey: "wizardCategoryLegalDesc", icon: "shield"      as const, color: "#ef4444" },
];

// ─── Entity type → document template mapping ─────────────────────────────────
// Each entry tells the wizard which DB entity to load for a given template ID
// so the user picks from a list instead of typing data that already exists.
const ENTITY_TYPE_MAP: Record<string, {
  type: string;
  idField: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  hint: string;
}> = {
  // ── PV & Décisions — Meeting entity ─────────────────────────────────────────
  pv:                    { type: "meetings",  idField: "meetingId",      label: "Réunion AG",          icon: "users",       hint: "Les données de réunion (date, lieu, ordre du jour, résolutions) seront chargées automatiquement." },
  convocation:           { type: "meetings",  idField: "meetingId",      label: "Réunion à convoquer", icon: "calendar",    hint: "Sélectionnez la réunion — date, lieu et heure seront pré-remplis." },
  decision:              { type: "meetings",  idField: "meetingId",      label: "Réunion liée (optionnel)", icon: "calendar", hint: "Optionnel — liez cette décision à une réunion pour pré-remplir la date et le contexte." },
  // ── Attestations — Lot entity ────────────────────────────────────────────────
  attestation_residence: { type: "lots",      idField: "lotId",          label: "Lot / Appartement",   icon: "home",        hint: "Le nom du résident, l'adresse et le numéro de lot seront chargés depuis la base." },
  attestation_propriete: { type: "lots",      idField: "lotId",          label: "Lot / Appartement",   icon: "home",        hint: "Le titre foncier, les tantièmes et les données du propriétaire seront chargés automatiquement." },
  attestation_paiement:  { type: "lots",      idField: "lotId",          label: "Lot / Appartement",   icon: "home",        hint: "Le total des charges payées sera calculé automatiquement depuis les appels de fonds." },
  // ── Attestation d'adhésion — Member entity ──────────────────────────────────
  attestation:           { type: "members",   idField: "memberId",       label: "Copropriétaire / Membre", icon: "user",    hint: "Le nom, le lot et les coordonnées du membre seront chargés automatiquement depuis la base de données." },
  mise_en_demeure:       { type: "members",   idField: "memberId",       label: "Membre mis en demeure",   icon: "user-x",  hint: "Le nom, le lot et les coordonnées seront chargés — précisez seulement l'objet et le délai." },
  // ── Finances — Financial entity ──────────────────────────────────────────────
  appel_de_fonds:        { type: "appels",    idField: "appelDeFondsId", label: "Appel de fonds",      icon: "file-text",   hint: "Toutes les données financières (montant, échéance, lot, copropriétaire) seront chargées." },
  facture:               { type: "invoices",  idField: "invoiceId",      label: "Facture",             icon: "file-minus",  hint: "Les lignes de facture, le montant et le destinataire seront importés depuis la comptabilité." },
  rapport_financier:     { type: "budgets",   idField: "budgetId",       label: "Budget (optionnel)",  icon: "trending-up", hint: "Sélectionnez un budget pour pré-remplir les indicateurs financiers." },
};

// ─── Source color helper ──────────────────────────────────────────────────────
function sourceColor(source: string): string {
  if (source.includes("syndicatesTable"))  return "#2563EB";
  if (source.includes("buildingsTable") || source.includes("lotsTable")) return "#0891b2";
  if (source.includes("usersTable") || source.includes("conseilSyndical")) return "#10b981";
  if (source.includes("documentSequences")) return "#f59e0b";
  if (source.includes("généré"))           return "#1F5EFF";
  return "#64748b";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DocumentWizard({ visible, onClose, onComplete }: Props) {
  const colors = useColors();
  const { t, lang: uiLang } = useLanguage();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Wizard state
  const [step,            setStep]            = useState(1);
  const [selectedCat,     setSelectedCat]     = useState<string>("");
  const [templates,       setTemplates]       = useState<TemplateCatalog[]>([]);
  const [templatesLoading,setTemplatesLoading]= useState(false);
  const [selectedTpl,     setSelectedTpl]     = useState<TemplateCatalog | null>(null);
  const [fields,          setFields]          = useState<Record<string, string>>({});
  const [language,        setLanguage]        = useState<"fr" | "ar" | "en" | "es">("fr");
  const [previewData,     setPreviewData]     = useState<PreviewData | null>(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [generating,      setGenerating]      = useState(false);
  const [generatedDocId,  setGeneratedDocId]  = useState<string | null>(null);
  const [generatedDocTitle, setGeneratedDocTitle] = useState<string>("");
  const [publishing,      setPublishing]      = useState(false);
  const [sigEmpty,        setSigEmpty]        = useState(true);
  const [signing,         setSigning]         = useState(false);
  const sigPadRef  = useRef<SignaturePadHandle>(null);
  const sigSvgRef  = useRef<string>("");
  const stepAnim   = useRef(new Animated.Value(1)).current;
  const [error,   setError]   = useState<string | null>(null);
  const [autofillData, setAutofillData] = useState<{
    syndicateInfo: Record<string, string | null>;
    propertyInfo: Record<string, string | null> | null;
    officeHolders: Record<string, string | null> | null;
    memberInfo: Record<string, string | null>;
    generated: Record<string, string | null>;
  } | null>(null);
  const [autofillLoading, setAutofillLoading] = useState(false);

  // Entity picker state
  const [entityItems,       setEntityItems]      = useState<Array<{ id: string; label: string; sublabel: string }>>([]);
  const [entityLoading,     setEntityLoading]    = useState(false);
  const [selectedEntityId,  setSelectedEntityId] = useState<string | null>(null);
  const [entityExpanded,    setEntityExpanded]   = useState(false);

  // Reset when wizard opens
  useEffect(() => {
    if (visible) {
      setStep(1);
      setSelectedCat("");
      setSelectedTpl(null);
      setFields({});
      setLanguage("fr");
      setPreviewData(null);
      setGeneratedDocId(null);
      setGeneratedDocTitle("");
      setError(null);
      setSigEmpty(true);
      sigSvgRef.current = "";
      setAutofillData(null);
      setAutofillLoading(false);
      setEntityItems([]);
      setEntityLoading(false);
      setSelectedEntityId(null);
      setEntityExpanded(false);
    }
  }, [visible]);

  // Animate step transition
  const animateStep = useCallback(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [stepAnim]);

  const goToStep = (n: number) => {
    setStep(n);
    animateStep();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Step 1 → 2: load templates when category selected ────────────────────────
  const handleSelectCategory = async (catKey: string) => {
    setSelectedCat(catKey);
    setTemplatesLoading(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.templates();
      const filtered = res.data.filter((t) => t.category === catKey);
      setTemplates(filtered);
    } catch (err: any) {
      setError(t("wizardTemplatesLoadError"));
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
    goToStep(2);
  };

  // ── Step 2 → 3: select template + load autofill + load entity list ───────────
  const handleSelectTemplate = async (tpl: TemplateCatalog) => {
    setSelectedTpl(tpl);
    setFields({});
    // Reset entity selection for new template
    setEntityItems([]);
    setSelectedEntityId(null);
    setEntityExpanded(false);
    goToStep(3);

    // Load autofill + entity list in parallel (both non-blocking)
    const entityConfig = ENTITY_TYPE_MAP[tpl.id];

    const [, entityRes] = await Promise.allSettled([
      // 1. Autofill (syndicate/property/office holders)
      (async () => {
        setAutofillLoading(true);
        try {
          const { documents: docsApi } = await import("@/services/api");
          const res = await docsApi.autofill();
          setAutofillData(res.data);
          const mi = res.data.memberInfo;
          const oh = res.data.officeHolders;
          setFields((prev) => {
            const prefilled: Record<string, string> = {};
            if (mi.member_name)      prefilled.memberName  = mi.member_name;
            if (oh?.president_name)  prefilled.president   = oh.president_name;
            if (oh?.secretary_name)  prefilled.secretaire  = oh.secretary_name;
            return { ...prefilled, ...prev };
          });
        } catch {
          setAutofillData(null);
        } finally {
          setAutofillLoading(false);
        }
      })(),
      // 2. Entity list (meeting/lot/invoice/etc.) — only if template needs it
      entityConfig
        ? (async () => {
            setEntityLoading(true);
            try {
              const { documents: docsApi } = await import("@/services/api");
              const res = await docsApi.entities(entityConfig.type);
              setEntityItems(res.data);
            } catch {
              setEntityItems([]);
            } finally {
              setEntityLoading(false);
            }
          })()
        : Promise.resolve(),
    ]);
    void entityRes; // result not needed directly — state already updated
  };

  // ── Step 3 → 4: load preview from API ────────────────────────────────────────
  const handleGoToPreview = async () => {
    if (!selectedTpl) return;
    // Validate required inputs
    for (const req of selectedTpl.requiredInputs) {
      if (!fields[req]?.trim()) {
        setError(`${t("wizardRequiredField")} "${getFieldLabel(req, selectedTpl)}".`);
        return;
      }
    }
    setError(null);
    setPreviewLoading(true);
    goToStep(4);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.preview({
        templateId: selectedTpl.id,
        memberName: fields["memberName"] || undefined,
        language,
      });
      setPreviewData(res.data);
    } catch (err: any) {
      setError(t("wizardPreviewLoadError"));
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Step 4 → 5: generate PDF ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedTpl || generating) return;
    setGenerating(true);
    setError(null);
    goToStep(5);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const body: Record<string, unknown> = {
        title:      fields["title"]     || selectedTpl.name,
        category:   selectedCat,
        templateId: selectedTpl.id,
        language,
        memberName: fields["memberName"] || undefined,
        content:    fields["content"]   || undefined,
        meetingDate:    fields["meetingDate"]    || undefined,
        lieu:           fields["lieu"]           || undefined,
        heure:          fields["heure"]          || undefined,
        objet:          fields["objet"]          || undefined,
        agendaText:     fields["agendaText"]     || undefined,
        deliberationsText: fields["deliberationsText"] || undefined,
        resolutionsText: fields["resolutionsText"] || undefined,
        periode:        fields["periode"]        || undefined,
        organe:         fields["organe"]         || undefined,
        delai:          fields["delai"]          || undefined,
        priorite:       fields["priorite"]       || undefined,
        modeEnvoi:      fields["modeEnvoi"]      || undefined,
        preamble:       fields["preamble"]       || undefined,
        consequences:   fields["consequences"]   || undefined,
        activites:      fields["activites"]      || undefined,
        indicateurs:    fields["indicateurs"]    || undefined,
        perspectives:   fields["perspectives"]   || undefined,
        synthese:       fields["synthese"]       || undefined,
        president:      fields["president"]      || undefined,
        secretaire:     fields["secretaire"]     || undefined,
        expose:         fields["expose"]         || undefined,
        justificatifs:  fields["justificatifs"]  || undefined,
        piecesJointes:  fields["piecesJointes"]  || undefined,
        texteAutorisation: fields["texteAutorisation"] || undefined,
        conditions:     fields["conditions"]     || undefined,
        dateDebut:      fields["dateDebut"]      || undefined,
        dateFin:        fields["dateFin"]        || undefined,
        poste:          fields["poste"]          || undefined,
        destination:    fields["destination"]    || undefined,
        dateDepart:     fields["dateDepart"]     || undefined,
        dateRetour:     fields["dateRetour"]     || undefined,
        objetMission:   fields["objetMission"]   || undefined,
        frais:          fields["frais"]          || undefined,
        corps:          fields["corps"]          || undefined,
        de:             fields["de"]             || undefined,
        actionRequise:  fields["actionRequise"]  || undefined,
        etabliPar:      fields["etabliPar"]      || undefined,
        approuvePar:    fields["approuvePar"]    || undefined,
        exercice:       fields["exercice"]       || undefined,
        observations:   fields["observations"]   || undefined,
        totalPrevu:     fields["totalPrevu"]     || undefined,
        totalRealise:   fields["totalRealise"]   || undefined,
        auditeurs:      fields["auditeurs"]      || undefined,
        perimetre:      fields["perimetre"]      || undefined,
        periodeAuditee: fields["periodeAuditee"] || undefined,
        opinion:        fields["opinion"]        || undefined,
        contexte:       fields["contexte"]       || undefined,
        constats:       fields["constats"]       || undefined,
        recommandations:fields["recommandations"]|| undefined,
        conclusion:     fields["conclusion"]     || undefined,
        partieB:        fields["partieB"]        || undefined,
        duree:          fields["duree"]          || undefined,
        preambule:      fields["preambule"]      || undefined,
        article1:       fields["article1"]       || undefined,
        article2:       fields["article2"]       || undefined,
        article3:       fields["article3"]       || undefined,
        employeur:      fields["employeur"]      || undefined,
        dispositions:   fields["dispositions"]   || undefined,
        champApplication: fields["champApplication"] || undefined,
        entreeVigueur:  fields["entreeVigueur"]  || undefined,
        dateApplication:fields["dateApplication"]|| undefined,
        dateMeeting:    fields["dateMeeting"]    || undefined,
        presidentSeance:fields["presidentSeance"]|| undefined,
        participants:   fields["participants"]   || undefined,
        ordreJour:      fields["ordreJour"]      || undefined,
        deroulement:    fields["deroulement"]    || undefined,
        decisions:      fields["decisions"]      || undefined,
        prochaineReunion: fields["prochaineReunion"] || undefined,
        // ── Entity IDs — the server uses these to auto-populate all DB-backed data,
        //    replacing manual field entry entirely for entity-backed templates.
        meetingId:      fields["meetingId"]      || undefined,
        lotId:          fields["lotId"]          || undefined,
        memberId:       fields["memberId"]       || undefined,
        appelDeFondsId: fields["appelDeFondsId"] || undefined,
        budgetId:       fields["budgetId"]       || undefined,
        electionId:     fields["electionId"]     || undefined,
        invoiceId:      fields["invoiceId"]      || undefined,
        tenantId:       fields["tenantId"]       || undefined,
        sinistreId:     fields["sinistreId"]     || undefined,
        travauxId:      fields["travauxId"]      || undefined,
      };
      const res = await docsApi.generateFull(body);
      const doc = (res as any).data as { id: string; title: string } | undefined;
      setGeneratedDocId(doc?.id ?? null);
      setGeneratedDocTitle(doc?.title ?? selectedTpl.name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message?.includes("HTTP") ? t("wizardGenerateError") : t("wizardGenerateError"));
    } finally {
      setGenerating(false);
    }
  };

  // ── Step 6: sign ──────────────────────────────────────────────────────────────
  const handleSign = async () => {
    if (!generatedDocId || signing || sigEmpty) return;
    setSigning(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.sign(generatedDocId, sigSvgRef.current || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goToStep(7);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message?.includes("409") ? t("wizardAlreadySigned") : t("wizardSignError"));
    } finally {
      setSigning(false);
    }
  };

  // ── Step 7: publish ───────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!generatedDocId || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(generatedDocId, { status: "published" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete(generatedDocId);
    } catch (err: any) {
      // Transition may not be allowed yet (e.g. needs signing first) — skip and just complete
      onComplete(generatedDocId);
    } finally {
      setPublishing(false);
    }
  };

  const handleSkipSign = () => goToStep(7);

  // ── Entity selection ──────────────────────────────────────────────────────────
  const handleSelectEntity = (id: string) => {
    if (!selectedTpl) return;
    const cfg = ENTITY_TYPE_MAP[selectedTpl.id];
    if (!cfg) return;
    setSelectedEntityId(id);
    setEntityExpanded(false);
    // Store the entity ID under its API field name so it travels to the server
    setFields((prev) => ({ ...prev, [cfg.idField]: id }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────────
  function getFieldLabel(name: string, tpl: TemplateCatalog): string {
    return tpl.variables.find((v) => v.name === name)?.label ?? name;
  }

  // ── Field schema per template ──────────────────────────────────────────────────
  // Each template shows a tailored subset of input fields with source hints.
  type FieldDef = { name: string; label: string; source: string; multiline?: boolean; placeholder?: string };
  function getTemplateFields(tplId: string): FieldDef[] {
    const common: FieldDef[] = [
      { name: "title", label: "Titre du document", source: "input utilisateur", placeholder: "Ex: PV Réunion Octobre 2026" },
    ];
    const maps: Record<string, FieldDef[]> = {
      attestation: [
        ...common,
        { name: "memberName",  label: "Nom du membre",         source: "input utilisateur",         placeholder: "Mohammed Alaoui" },
      ],
      pv: [
        ...common,
        // meetingsTable fields — auto-populated when meetingId is provided; keep for manual override
        { name: "meetingDate",         label: "Date de réunion",     source: "meetingsTable",     placeholder: "15/07/2026 — auto si réunion sélectionnée" },
        { name: "lieu",                label: "Lieu",                source: "meetingsTable",     placeholder: "Salle de réunion, Résidence… — auto si réunion sélectionnée" },
        { name: "heure",               label: "Heure",               source: "meetingsTable",     placeholder: "10h00 — auto si réunion sélectionnée" },
        { name: "agendaText",          label: "Ordre du jour",       source: "meetingsTable",     multiline: true, placeholder: "1. Approbation du budget\n2. Travaux…" },
        { name: "deliberationsText",   label: "Délibérations",       source: "input utilisateur", multiline: true, placeholder: "Résumé des discussions…" },
        { name: "resolutionsText",     label: "Résolutions adoptées",source: "meetingsTable",     multiline: true, placeholder: "Résolution 1: …" },
      ],
      convocation: [
        ...common,
        { name: "memberName",  label: "Destinataire",  source: "input / usersTable",  placeholder: "Tous les membres" },
        // auto-populated from meeting when meetingId is provided
        { name: "meetingDate", label: "Date",          source: "meetingsTable",       placeholder: "15/07/2026 — auto si réunion sélectionnée" },
        { name: "lieu",        label: "Lieu",          source: "meetingsTable",       placeholder: "Résidence Al Fath, Salle… — auto si réunion sélectionnée" },
        { name: "heure",       label: "Heure",         source: "meetingsTable",       placeholder: "10h00 — auto si réunion sélectionnée" },
        { name: "objet",       label: "Objet",         source: "input utilisateur",   placeholder: "Assemblée Générale Ordinaire" },
      ],
      contrat: [
        ...common,
        { name: "partieB",  label: "Partie 2 (Tiers)", source: "input utilisateur", placeholder: "Société XYZ SARL" },
        { name: "objet",    label: "Objet du contrat", source: "input utilisateur", placeholder: "Prestation de gardiennage..." },
        { name: "content",  label: "Clauses du contrat", source: "input utilisateur", multiline: true, placeholder: "Article 1 : ..." },
      ],
      decision: [
        ...common,
        { name: "organe",   label: "Organe décisionnel", source: "input utilisateur", placeholder: "Bureau syndical" },
        { name: "objet",    label: "Objet de la décision", source: "input utilisateur", placeholder: "Approbation du budget..." },
        { name: "content",  label: "Corps de la décision", source: "input utilisateur", multiline: true },
      ],
      mise_en_demeure: [
        ...common,
        { name: "memberName",   label: "Mis en demeure",  source: "membersTable",      placeholder: "Auto — sélectionnez un membre" },
        { name: "objet",        label: "Objet",           source: "input utilisateur", placeholder: "Impayés de charges — 3 mois" },
        { name: "delai",        label: "Délai imparti",   source: "input utilisateur", placeholder: "15 jours à compter de la réception" },
        { name: "consequences", label: "Conséquences",    source: "input utilisateur", multiline: true },
        { name: "preamble",     label: "Préambule",       source: "input utilisateur", multiline: true },
      ],
      rapport_financier: [
        ...common,
        { name: "exercice",     label: "Exercice comptable", source: "budgetsTable",      placeholder: "Auto si budget sélectionné" },
        { name: "totalPrevu",   label: "Budget prévu (MAD)", source: "budgetsTable",      placeholder: "Auto si budget sélectionné" },
        { name: "totalRealise", label: "Réalisé (MAD)",      source: "budgetsTable",      placeholder: "Auto si budget sélectionné" },
        { name: "observations", label: "Observations",       source: "input utilisateur", multiline: true },
        { name: "etabliPar",    label: "Établi par",         source: "conseilSyndical",   placeholder: "Auto — Trésorier" },
        { name: "approuvePar",  label: "Approuvé par",       source: "conseilSyndical",   placeholder: "Auto — Président" },
      ],
      // ── Attestations — DB data auto-populated when lotId is provided ──────────
      attestation_residence: [
        ...common,
        { name: "memberName", label: "Nom du résident",    source: "lotsTable / membersTable", placeholder: "Auto si lot sélectionné" },
        { name: "periode",    label: "Période",            source: "input utilisateur",        placeholder: "Du 01/01/2026 au 31/12/2026" },
      ],
      attestation_propriete: [
        ...common,
        { name: "memberName",    label: "Nom du propriétaire", source: "lotsTable / membersTable", placeholder: "Auto si lot sélectionné" },
        { name: "titreFoncier",  label: "Titre foncier",       source: "lotsTable",                placeholder: "Auto si lot sélectionné" },
        { name: "tantiemes",     label: "Tantièmes",           source: "lotsTable",                placeholder: "Auto si lot sélectionné (/ 10 000)" },
      ],
      attestation_paiement: [
        ...common,
        { name: "memberName", label: "Nom du copropriétaire", source: "lotsTable / membersTable", placeholder: "Auto si lot sélectionné" },
        { name: "periode",    label: "Période couverte",      source: "input utilisateur",        placeholder: "Exercice 2026" },
        { name: "montant",    label: "Montant total réglé",   source: "appelsDeFondsTable",       placeholder: "Auto calculé si lot sélectionné (MAD)" },
      ],
      // ── Financial templates — DB data auto-populated from entity loader ────────
      appel_de_fonds: [
        ...common,
        { name: "memberName", label: "Copropriétaire",  source: "appelsDeFondsTable", placeholder: "Auto si appel sélectionné" },
        { name: "montant",    label: "Montant",         source: "appelsDeFondsTable", placeholder: "Auto si appel sélectionné" },
        { name: "periode",    label: "Période",         source: "appelsDeFondsTable", placeholder: "Auto si appel sélectionné" },
        { name: "objet",      label: "Objet spécifique",source: "input utilisateur",  placeholder: "Charges communes trimestrielles…" },
      ],
      facture: [
        ...common,
        { name: "memberName", label: "Destinataire",      source: "invoicesTable", placeholder: "Auto si facture sélectionnée" },
        { name: "montant",    label: "Montant total",     source: "invoicesTable", placeholder: "Auto si facture sélectionnée" },
        { name: "objet",      label: "Objet additionnel", source: "input utilisateur", placeholder: "Précisions…" },
      ],
    };
    return maps[tplId] ?? common;
  }

  // ─── Step labels ──────────────────────────────────────────────────────────────
  const STEPS = [
    { num: 1, label: t("wizardStepType") },
    { num: 2, label: t("wizardStepTemplate") },
    { num: 3, label: t("wizardStepVariables") },
    { num: 4, label: t("wizardStepPreview") },
    { num: 5, label: t("wizardStepGeneration") },
    { num: 6, label: t("wizardStepSignature") },
    { num: 7, label: t("wizardStepPublish") },
  ];

  // ─── Render each step ─────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: Choose Category ──────────────────────────────────────────────
      case 1:
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}>
            <Text style={[s.stepTitle, { color: colors.foreground }]}>{t("wizardChooseType")}</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              {t("wizardChooseTypeDescription")}
            </Text>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[s.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleSelectCategory(cat.key)}
                activeOpacity={0.75}
              >
                <View style={[s.catIcon, { backgroundColor: cat.color + "18" }]}>
                  <Feather name={cat.icon} size={24} color={cat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.catLabel, { color: colors.foreground }]}>{t(cat.labelKey)}</Text>
                  <Text style={[s.catDesc, { color: colors.mutedForeground }]}>{t(cat.descKey)}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        );

      // ── Step 2: Choose Template ───────────────────────────────────────────────
      case 2:
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
            <Text style={[s.stepTitle, { color: colors.foreground }]}>{t("wizardChooseTemplate")}</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              {t("wizardChooseTemplateDescription")}
            </Text>
            {templatesLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground, marginTop: 12 }]}>{t("wizardLoadingTemplates")}</Text>
              </View>
            ) : templates.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                <Feather name="inbox" size={36} color={colors.mutedForeground} />
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>{t("wizardNoTemplates")}</Text>
              </View>
            ) : (
              templates.map((tpl) => (
                <TouchableOpacity
                  key={tpl.id}
                  style={[s.tplCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleSelectTemplate(tpl)}
                  activeOpacity={0.78}
                >
                  {/* Header */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <View style={[s.tplIcon, { backgroundColor: tpl.color + "18" }]}>
                      <Feather name={tpl.icon as any} size={22} color={tpl.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.tplName, { color: colors.foreground }]}>{tpl.name}</Text>
                      <Text style={[s.tplMeta, { color: colors.mutedForeground }]}>
                        v{tpl.version}  ·  {tpl.author}  ·  {tpl.updatedAt}
                      </Text>
                    </View>
                    <Feather name="arrow-right" size={16} color={tpl.color} />
                  </View>
                  {/* Description */}
                  <Text style={[s.tplDesc, { color: colors.mutedForeground }]}>{tpl.description}</Text>
                  {/* Sections preview */}
                  <View style={[s.sectionsList, { borderTopColor: colors.border }]}>
                    {tpl.sections.slice(0, 4).map((sec, i) => (
                      <View key={i} style={s.sectionItem}>
                        <View style={[s.sectionDot, { backgroundColor: tpl.color }]} />
                        <Text style={[s.sectionText, { color: colors.mutedForeground }]}>{sec.title}</Text>
                      </View>
                    ))}
                    {tpl.sections.length > 4 ? (
                      <Text style={[s.sectionText, { color: colors.mutedForeground, marginLeft: 14 }]}>
                        +{tpl.sections.length - 4} {t("wizardOtherSections")}
                      </Text>
                    ) : null}
                  </View>
                  {/* Variables count */}
                  <View style={[s.varBadge, { backgroundColor: tpl.color + "12" }]}>
                    <Feather name="code" size={11} color={tpl.color} />
                    <Text style={[s.varBadgeText, { color: tpl.color }]}>
                      {tpl.variables.length} {t("wizardVariables")}  ·  {tpl.requiredInputs.length} {t("wizardRequiredFields")}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        );

      // ── Step 3: Fill Variables ────────────────────────────────────────────────
      case 3:
        if (!selectedTpl) return null;
        const tplFields = getTemplateFields(selectedTpl.id);
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
            {/* Template info banner */}
            <View style={[s.infoBanner, { backgroundColor: selectedTpl.color + "12", borderColor: selectedTpl.color + "30" }]}>
              <View style={[s.tplIcon, { backgroundColor: selectedTpl.color + "18" }]}>
                <Feather name={selectedTpl.icon as any} size={18} color={selectedTpl.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.tplName, { color: selectedTpl.color }]}>{selectedTpl.name}</Text>
                <Text style={[s.tplMeta, { color: colors.mutedForeground }]}>{selectedTpl.description}</Text>
              </View>
            </View>

            {/* ── Entity Picker — shown when template has a DB entity backing ─ */}
            {(() => {
              const entityCfg = ENTITY_TYPE_MAP[selectedTpl.id];
              if (!entityCfg) return null;
              const selectedItem = entityItems.find((e) => e.id === selectedEntityId);
              const displayItems = entityExpanded ? entityItems : entityItems.slice(0, 5);
              return (
                <View style={[s.sectionBox, { borderColor: selectedEntityId ? selectedTpl.color + "60" : colors.border, backgroundColor: colors.card }]}>
                  {/* Header */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 10 }}>
                    <View style={[s.catIcon, { width: 36, height: 36, borderRadius: 10, backgroundColor: selectedTpl.color + "18" }]}>
                      <Feather name={entityCfg.icon} size={18} color={selectedTpl.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.boxTitle, { color: colors.foreground, padding: 0 }]}>
                        {entityCfg.label}
                      </Text>
                      <Text style={[s.varSource, { color: colors.mutedForeground, marginTop: 1 }]}>
                        {entityCfg.hint}
                      </Text>
                    </View>
                    {entityLoading && <ActivityIndicator size="small" color={selectedTpl.color} />}
                    {selectedEntityId && !entityLoading && (
                      <View style={[s.autoChip, { backgroundColor: "#10b98115" }]}>
                        <Feather name="check" size={10} color="#10b981" />
                          <Text style={[s.autoChipText, { color: "#10b981" }]}>{t("wizardSelected")}</Text>
                      </View>
                    )}
                  </View>

                  {/* Selected entity summary pill */}
                  {selectedItem && (
                    <View style={{ marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: selectedTpl.color + "10", flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather name="check-circle" size={14} color={selectedTpl.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.varLabel, { color: selectedTpl.color }]} numberOfLines={1}>{selectedItem.label}</Text>
                        {selectedItem.sublabel ? <Text style={[s.varSource, { color: colors.mutedForeground }]} numberOfLines={1}>{selectedItem.sublabel}</Text> : null}
                      </View>
                      <TouchableOpacity onPress={() => { setSelectedEntityId(null); setFields((p) => { const n = { ...p }; delete n[entityCfg.idField]; return n; }); }}>
                        <Feather name="x" size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Entity list */}
                  {entityLoading ? (
                    <View style={{ alignItems: "center", paddingVertical: 16, paddingBottom: 14 }}>
                      <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>{t("wizardLoading")}</Text>
                    </View>
                  ) : entityItems.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 14, paddingBottom: 16, gap: 6 }}>
                      <Feather name="inbox" size={22} color={colors.mutedForeground} />
                      <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>{t("wizardNoEntityData")}</Text>
                    </View>
                  ) : (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6 }}>
                      {displayItems.map((item) => {
                        const isSelected = selectedEntityId === item.id;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[s.entityCard, {
                              borderColor: isSelected ? selectedTpl.color : colors.border,
                              backgroundColor: isSelected ? selectedTpl.color + "0f" : colors.background,
                            }]}
                            onPress={() => handleSelectEntity(item.id)}
                            activeOpacity={0.75}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[s.varLabel, { color: isSelected ? selectedTpl.color : colors.foreground }]} numberOfLines={1}>
                                {item.label}
                              </Text>
                              {item.sublabel ? (
                                <Text style={[s.varSource, { color: colors.mutedForeground }]} numberOfLines={1}>
                                  {item.sublabel}
                                </Text>
                              ) : null}
                            </View>
                            <Feather
                              name={isSelected ? "check-circle" : "circle"}
                              size={18}
                              color={isSelected ? selectedTpl.color : colors.border}
                            />
                          </TouchableOpacity>
                        );
                      })}
                      {!entityExpanded && entityItems.length > 5 && (
                        <TouchableOpacity
                          style={{ alignItems: "center", paddingVertical: 8 }}
                          onPress={() => setEntityExpanded(true)}
                        >
                          <Text style={{ color: selectedTpl.color, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                             {t("wizardSeeMore")} {entityItems.length - 5}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Document structure */}
            <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.boxTitle, { color: colors.foreground }]}>{t("wizardDocumentStructure")}</Text>
              {selectedTpl.sections.map((sec, i) => (
                <View key={i} style={[s.structureRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                  <View style={[s.structureNum, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={[s.structureNumText, { color: colors.primary }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.structureTitle, { color: colors.foreground }]}>{sec.title}</Text>
                    <Text style={[s.structureDesc, { color: colors.mutedForeground }]}>{sec.description}</Text>
                  </View>
                  <View style={[s.srcBadge, { backgroundColor: sourceColor(sec.source) + "15" }]}>
                    <Text style={[s.srcBadgeText, { color: sourceColor(sec.source) }]} numberOfLines={1}>
                      {sec.source.split(".")[0]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Auto-resolved DB variables — real values from autofill */}
            <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Text style={[s.boxTitle, { color: colors.foreground }]}>{t("wizardAutomaticData")}</Text>
                {autofillLoading && <ActivityIndicator size="small" color={selectedTpl.color} />}
                {!autofillLoading && autofillData && (
                  <View style={[s.autoChip, { backgroundColor: "#10b98115" }]}>
                    <Feather name="check-circle" size={10} color="#10b981" />
                    <Text style={[s.autoChipText, { color: "#10b981" }]}>{t("wizardResolved")}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.stepSubtitle, { color: colors.mutedForeground, marginBottom: 10 }]}>
                 {t("wizardAutomaticDataDescription")}
              </Text>
              {autofillLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                   <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>{t("wizardFetchingData")}</Text>
                </View>
              ) : autofillData ? (() => {
                // Flatten all resolved values into display rows
                const rows: { label: string; value: string; color: string }[] = [];
                const add = (label: string, value: string | null | undefined, color: string) => {
                  if (value) rows.push({ label, value, color });
                };
                const si = autofillData.syndicateInfo;
                const pi = autofillData.propertyInfo;
                const oh = autofillData.officeHolders;
                const mi = autofillData.memberInfo;
                add("Syndicat", si.syndicate_name, "#2563EB");
                add("Adresse", si.syndicate_address ? `${si.syndicate_address}, ${si.syndicate_city ?? ""}`.trim().replace(/,$/, "") : null, "#2563EB");
                add("Immeuble", pi?.building_name, "#3b82f6");
                add("Lots", pi?.total_lots ? `${pi.total_lots} lots` : null, "#3b82f6");
                add("Président", oh?.president_name, "#f59e0b");
                add("Vice-Président", oh?.vice_president_name, "#f59e0b");
                add("Trésorier", oh?.treasurer_name, "#10b981");
                add("Secrétaire", oh?.secretary_name, "#10b981");
                add("Gestionnaire", oh?.manager_name, "#0891b2");
                add("Membre", mi.member_name, "#ec4899");
                add("Lot", mi.lot_number ? `Lot ${mi.lot_number}` : null, "#ec4899");
                return rows.length === 0 ? (
                  <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
                     {t("wizardNoSyndicateData")}
                  </Text>
                ) : (
                  <View style={{ gap: 0 }}>
                    {rows.map((row, i) => (
                      <View key={row.label} style={[s.varRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                        <Text style={[s.varLabel, { color: colors.foreground, flex: 1 }]}>{row.label}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 2, justifyContent: "flex-end" }}>
                          <Text style={[s.varSource, { color: row.color, fontSize: 12 }]} numberOfLines={1}>{row.value}</Text>
                          <View style={[s.autoChip, { backgroundColor: row.color + "12" }]}>
                            <Feather name="cpu" size={9} color={row.color} />
                             <Text style={[s.autoChipText, { color: row.color }]}>{t("wizardAuto")}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })() : (
                selectedTpl.variables.filter((v) => !v.source.includes("input utilisateur")).map((v, i) => (
                  <View key={v.name} style={[s.varRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.varLabel, { color: colors.foreground }]}>{v.label}</Text>
                      <Text style={[s.varSource, { color: sourceColor(v.source) }]}>{v.source}</Text>
                    </View>
                    <View style={[s.autoChip, { backgroundColor: sourceColor(v.source) + "12" }]}>
                      <Feather name="cpu" size={10} color={sourceColor(v.source)} />
                       <Text style={[s.autoChipText, { color: sourceColor(v.source) }]}>{t("wizardAuto")}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* User input fields */}
            <Text style={[s.boxTitle, { color: colors.foreground }]}>{t("wizardInputInformation")}</Text>
            {tplFields.map((f) => (
              <View key={f.name} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>{f.label}</Text>
                  <View style={[s.srcBadge, { backgroundColor: sourceColor(f.source) + "12" }]}>
                    <Text style={[s.srcBadgeText, { color: sourceColor(f.source) }]}>
                      {f.source.includes("input") ? t("wizardUserInput") : f.source}
                    </Text>
                  </View>
                  {selectedTpl.requiredInputs.includes(f.name) ? (
                      <Text style={{ color: "#ef4444", fontSize: 11 }}>{t("wizardRequired")}</Text>
                  ) : null}
                </View>
                <TextInput
                  style={[
                    s.input,
                    { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground },
                    f.multiline ? { minHeight: 80, textAlignVertical: "top" } : {},
                  ]}
                  value={fields[f.name] ?? ""}
                  onChangeText={(v) => setFields((prev) => ({ ...prev, [f.name]: v }))}
                  placeholder={f.placeholder ?? ""}
                  placeholderTextColor={colors.mutedForeground}
                  multiline={f.multiline}
                />
              </View>
            ))}

            {/* Language */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>{t("wizardDocumentLanguage")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { code: "fr" as const, label: "Français" },
                  { code: "ar" as const, label: "العربية" },
                  { code: "en" as const, label: "English" },
                  { code: "es" as const, label: "Español" },
                ] as const).map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    onPress={() => setLanguage(l.code)}
                    style={[
                      s.langChip,
                      {
                        borderColor: language === l.code ? selectedTpl.color : colors.border,
                        backgroundColor: language === l.code ? selectedTpl.color + "15" : colors.card,
                      },
                    ]}
                  >
                    <Text style={{ color: language === l.code ? selectedTpl.color : colors.mutedForeground, fontWeight: language === l.code ? "700" : "500", fontSize: 12 }}>
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        );

      // ── Step 4: Document Preview ──────────────────────────────────────────────
      case 4:
        if (!selectedTpl) return null;
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 120 }}>
            <Text style={[s.stepTitle, { color: colors.foreground }]}>{t("wizardPreviewTitle")}</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              {t("wizardPreviewDescription")}
            </Text>

            {previewLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                <ActivityIndicator color={selectedTpl.color} size="large" />
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>{t("wizardResolvingVariables")}</Text>
              </View>
            ) : (
              <>
                {/* Document header mockup */}
                <View style={[s.docPreview, { borderColor: selectedTpl.color + "40", backgroundColor: colors.card }]}>
                  <View style={[s.docPreviewHeader, { backgroundColor: selectedTpl.color }]}>
                    <Text style={s.docPreviewHeaderText}>
                      {previewData?.syndicateInfo?.name ?? "NOM DU SYNDICAT"}
                    </Text>
                    <Text style={s.docPreviewHeaderSub}>
                      {previewData?.syndicateInfo?.address ?? ""}{previewData?.syndicateInfo?.city ? `, ${previewData.syndicateInfo.city}` : ""}
                    </Text>
                  </View>
                  <View style={{ padding: 16, gap: 8 }}>
                    <Text style={[s.docPreviewTitle, { color: colors.foreground }]}>
                      {fields["title"] || selectedTpl.name}
                    </Text>
                    <Text style={[s.docPreviewRef, { color: colors.mutedForeground }]}>
                       {t("wizardReference")} {previewData?.resolvedVariables?.documentNumber ?? `[${selectedTpl.id.toUpperCase()}-${new Date().getFullYear()}-XXXX]`}
                    </Text>
                  </View>
                </View>

                {/* Sections breakdown */}
                <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                   <Text style={[s.boxTitle, { color: colors.foreground }]}>{t("wizardDocumentComposition")}</Text>
                  {selectedTpl.sections.map((sec, i) => (
                    <View key={i} style={[s.structureRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                      <View style={[s.structureNum, { backgroundColor: selectedTpl.color + "15" }]}>
                        <Text style={[s.structureNumText, { color: selectedTpl.color }]}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.structureTitle, { color: colors.foreground }]}>{sec.title}</Text>
                        <Text style={[s.structureDesc, { color: colors.mutedForeground }]}>{sec.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Resolved variable values */}
                {previewData ? (
                  <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                     <Text style={[s.boxTitle, { color: colors.foreground }]}>{t("wizardResolvedVariables")}</Text>
                    <Text style={[s.stepSubtitle, { color: colors.mutedForeground, marginBottom: 4 }]}>
                       {t("wizardResolvedAt")} {new Date(previewData.resolvedAt).toLocaleTimeString(({ fr: "fr-MA", en: "en-US", ar: "ar-MA", es: "es-ES" } as const)[uiLang], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {selectedTpl.variables.map((v, i) => {
                      const resolvedVal = previewData.resolvedVariables[v.name];
                      const userVal     = fields[v.name];
                      const displayVal  = userVal || resolvedVal || "—";
                      const isFromDb    = !userVal && !!resolvedVal;
                      return (
                        <View key={v.name} style={[s.resolvedRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.varLabel, { color: colors.foreground }]}>{v.label}</Text>
                            <Text style={[s.varSource, { color: sourceColor(v.source) }]}>{v.source}</Text>
                          </View>
                          <View style={{ alignItems: "flex-end", maxWidth: "45%", gap: 3 }}>
                            <Text style={[s.resolvedVal, { color: displayVal !== "—" ? colors.foreground : colors.mutedForeground }]} numberOfLines={2}>
                              {displayVal}
                            </Text>
                            {isFromDb ? (
                              <View style={[s.autoChip, { backgroundColor: "#10b98115" }]}>
                                <Feather name="database" size={9} color="#10b981" />
                                 <Text style={[s.autoChipText, { color: "#10b981" }]}>{t("wizardDatabase")}</Text>
                              </View>
                            ) : userVal ? (
                              <View style={[s.autoChip, { backgroundColor: "#3b82f615" }]}>
                                <Feather name="user" size={9} color="#3b82f6" />
                                 <Text style={[s.autoChipText, { color: "#3b82f6" }]}>{t("wizardEntered")}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {error ? (
                  <View style={[s.errorBox, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
                    <Feather name="alert-triangle" size={14} color="#ef4444" />
                    <Text style={[s.errorText, { color: "#ef4444" }]}>{error}</Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        );

      // ── Step 5: Generation ────────────────────────────────────────────────────
      case 5:
        return (
          <ScrollView contentContainerStyle={{ padding: 30, alignItems: "center", gap: 20, paddingBottom: 100 }}>
            {generating ? (
              <>
                <View style={[s.genSpinner, { backgroundColor: (selectedTpl?.color ?? colors.primary) + "18" }]}>
                  <ActivityIndicator color={selectedTpl?.color ?? colors.primary} size="large" />
                </View>
                 <Text style={[s.stepTitle, { color: colors.foreground, textAlign: "center" }]}>{t("wizardGenerating")}</Text>
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
                   {t("wizardGeneratingDescription")}
                </Text>
              </>
            ) : generatedDocId ? (
              <>
                <View style={[s.genSpinner, { backgroundColor: "#10b98118" }]}>
                  <Feather name="check-circle" size={48} color="#10b981" />
                </View>
                 <Text style={[s.stepTitle, { color: colors.foreground, textAlign: "center" }]}>{t("wizardGenerated")}</Text>
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
                   {t("wizardGeneratedDescription").replace("{title}", generatedDocTitle)}
                </Text>
                <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
                  {[
                     { icon: "file-text"  as const, label: t("wizardTemplate"),    value: selectedTpl?.name ?? "" },
                     { icon: "globe"      as const, label: t("wizardLanguage"),    value: { fr: t("languageFrench"), ar: t("languageArabic"), en: t("languageEnglish"), es: t("languageSpanish") }[language] },
                     { icon: "shield"     as const, label: t("wizardQrIncluded"), value: t("wizardAuthenticatedVerification") },
                     { icon: "clock"      as const, label: t("wizardStatus"),    value: t("wizardGeneratedPendingSignature") },
                  ].map((item, i) => (
                    <View key={item.label} style={[s.varRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                      <Feather name={item.icon} size={14} color={colors.primary} />
                      <Text style={[s.varLabel, { color: colors.mutedForeground, flex: 1 }]}>{item.label}</Text>
                      <Text style={[s.resolvedVal, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <View style={[s.genSpinner, { backgroundColor: "#ef444418" }]}>
                  <Feather name="alert-circle" size={48} color="#ef4444" />
                </View>
                 <Text style={[s.stepTitle, { color: "#ef4444", textAlign: "center" }]}>{t("wizardGenerationFailed")}</Text>
                {error ? <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>{error}</Text> : null}
              </>
            )}
          </ScrollView>
        );

      // ── Step 6: Sign ──────────────────────────────────────────────────────────
      case 6:
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
             <Text style={[s.stepTitle, { color: colors.foreground }]}>{t("wizardSignTitle")}</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              {t("wizardSignDescription")}
            </Text>

            <View style={[s.sigInfoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                 { icon: "shield"  as const, text: t("wizardSignatureLinked") },
                 { icon: "clock"   as const, text: t("wizardTimestamped") },
                 { icon: "user"    as const, text: t("wizardIdentityRecorded") },
              ].map((item) => (
                <View key={item.text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name={item.icon} size={14} color="#8b5cf6" />
                  <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>{item.text}</Text>
                </View>
              ))}
            </View>

            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignSelf: "center", overflow: "hidden" }}>
              <SignaturePad
                ref={sigPadRef}
                width={320}
                height={180}
                onChange={(svg, isEmpty) => { sigSvgRef.current = svg; setSigEmpty(isEmpty); }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[s.secBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => { sigPadRef.current?.clear(); setSigEmpty(true); }}
              >
                <Feather name="rotate-ccw" size={16} color={colors.foreground} />
                 <Text style={[s.secBtnText, { color: colors.foreground }]}>{t("wizardClear")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 2, backgroundColor: sigEmpty ? colors.mutedForeground : "#8b5cf6", opacity: signing ? 0.7 : 1 }]}
                disabled={sigEmpty || signing}
                onPress={handleSign}
              >
                {signing ? <ActivityIndicator color="#fff" /> : <Feather name="edit-3" size={18} color="#fff" />}
                 <Text style={s.primaryBtnText}>{signing ? t("wizardSending") : t("wizardSignDocument")}</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={[s.errorBox, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={[s.errorText, { color: "#ef4444" }]}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>
        );

      // ── Step 7: Publish ───────────────────────────────────────────────────────
      case 7:
        return (
          <ScrollView contentContainerStyle={{ padding: 30, alignItems: "center", gap: 20, paddingBottom: 100 }}>
            <View style={[s.genSpinner, { backgroundColor: "#10b98118" }]}>
              <Feather name="globe" size={48} color="#10b981" />
            </View>
            <Text style={[s.stepTitle, { color: colors.foreground, textAlign: "center" }]}>
               {t("wizardReadyToPublish")}
            </Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
               {t("wizardPublishDescription")}
            </Text>
            <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
              {[
                 { label: t("wizardDocument"),  value: generatedDocTitle },
                 { label: t("wizardCategory"), value: CATEGORIES.find((c) => c.key === selectedCat) ? t(CATEGORIES.find((c) => c.key === selectedCat)!.labelKey) : selectedCat },
                 { label: t("wizardTemplate"),    value: selectedTpl?.name ?? "" },
                 { label: t("wizardLanguage"),    value: { fr: t("languageFrench"), ar: t("languageArabic"), en: t("languageEnglish"), es: t("languageSpanish") }[language] },
              ].map((item, i) => (
                <View key={item.label} style={[s.varRow, { borderTopColor: i > 0 ? colors.border : "transparent" }]}>
                  <Text style={[s.varLabel, { color: colors.mutedForeground, flex: 1 }]}>{item.label}</Text>
                  <Text style={[s.resolvedVal, { color: colors.foreground }]} numberOfLines={1}>{item.value}</Text>
                </View>
              ))}
            </View>
            <View style={{ width: "100%", gap: 10 }}>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: "#10b981", opacity: publishing ? 0.7 : 1 }]}
                onPress={handlePublish}
                disabled={publishing}
              >
                {publishing ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="globe" size={18} color="#fff" />}
                 <Text style={s.primaryBtnText}>{publishing ? t("wizardPublishing") : t("wizardPublishNow")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secBtn, { borderColor: colors.border, backgroundColor: colors.card, justifyContent: "center" }]}
                onPress={() => onComplete(generatedDocId ?? undefined)}
              >
                <Feather name="check" size={16} color={colors.foreground} />
                 <Text style={[s.secBtnText, { color: colors.foreground }]}>{t("wizardFinishWithoutPublishing")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  // ── Navigation footer ─────────────────────────────────────────────────────────
  const renderFooter = () => {
    if (step === 1) return null; // Step 1 navigates itself via category taps

    const canGoBack = step > 1 && step < 5;

    const nextLabel: Record<number, string> = {
       2: t("wizardContinue"),
       3: t("wizardViewPreview"),
       4: t("wizardGeneratePdf"),
       5: generating ? "…" : (generatedDocId ? t("wizardSign") : t("wizardRetry")),
       6: t("wizardSkip"),
    };

    const handleNext = () => {
      if (step === 3) { handleGoToPreview(); return; }
      if (step === 4) { handleGenerate(); return; }
      if (step === 5 && generatedDocId) { goToStep(6); return; }
      if (step === 5 && !generatedDocId && !generating) {
        // Retry generation
        handleGenerate(); return;
      }
      if (step === 6) { handleSkipSign(); return; }
    };

    const showNext = step >= 3 && step <= 6 && !(step === 5 && generating);

    return (
      <View style={[s.footer, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
        {error && step !== 4 ? (
          <View style={[s.errorBox, { backgroundColor: "#ef444415", borderColor: "#ef444430", marginBottom: 10 }]}>
            <Feather name="alert-triangle" size={13} color="#ef4444" />
            <Text style={[s.errorText, { color: "#ef4444" }]}>{error}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {canGoBack ? (
            <TouchableOpacity
              style={[s.secBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.card, justifyContent: "center" }]}
              onPress={() => { setError(null); goToStep(step - 1); }}
            >
              <Feather name="arrow-left" size={16} color={colors.foreground} />
               <Text style={[s.secBtnText, { color: colors.foreground }]}>{t("wizardBack")}</Text>
            </TouchableOpacity>
          ) : null}
          {showNext ? (
            <TouchableOpacity
              style={[s.primaryBtn, { flex: canGoBack ? 2 : 1, backgroundColor: selectedTpl?.color ?? colors.primary }]}
              onPress={handleNext}
            >
               <Text style={s.primaryBtnText}>{nextLabel[step] ?? t("wizardContinue")}</Text>
              <Feather name="arrow-right" size={16} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  // ── Step indicator ─────────────────────────────────────────────────────────────
  const renderStepBar = () => (
    <View style={[s.stepBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
      {STEPS.map((s_, i) => {
        const isActive   = step === s_.num;
        const isDone     = step > s_.num;
        const color      = isActive
          ? (selectedTpl?.color ?? colors.primary)
          : isDone ? "#10b981" : colors.border;
        return (
          <React.Fragment key={s_.num}>
            <View style={{ alignItems: "center", gap: 3 }}>
              <View style={[
                st.stepDot,
                {
                  backgroundColor: isActive ? (selectedTpl?.color ?? colors.primary) : isDone ? "#10b981" : colors.muted,
                  borderColor: color,
                },
              ]}>
                {isDone
                  ? <Feather name="check" size={9} color="#fff" />
                  : <Text style={[st.stepDotNum, { color: isActive ? "#fff" : colors.mutedForeground }]}>{s_.num}</Text>
                }
              </View>
              {isActive ? <Text style={[st.stepLabel, { color: selectedTpl?.color ?? colors.primary }]}>{s_.label}</Text> : null}
            </View>
            {i < STEPS.length - 1 ? (
              <View style={[st.stepLine, { backgroundColor: step > s_.num ? "#10b981" : colors.border }]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );

  // ── Root render ───────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            onPress={onClose}
            style={{ padding: 6, marginRight: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
             <Text style={[s.headerTitle, { color: colors.foreground }]}>{t("wizardTitle")}</Text>
            <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
              {t("wizardStepOf").replace("{step}", String(step)).replace("{label}", STEPS[step - 1]?.label ?? "")}
            </Text>
          </View>
        </View>

        {/* Step bar */}
        {renderStepBar()}

        {/* Body */}
        <Animated.View style={[{ flex: 1 }, { opacity: stepAnim, transform: [{ translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
          {renderStep()}
        </Animated.View>

        {/* Footer nav */}
        {renderFooter()}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:            { flex: 1 },
  header:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 12, gap: 4, borderBottomWidth: 1 },
  headerTitle:     { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub:       { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  stepBar:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, gap: 4 },
  stepTitle:       { fontSize: 17, fontFamily: "Inter_700Bold" },
  stepSubtitle:    { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  catCard:         { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  catIcon:         { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  catLabel:        { fontSize: 14, fontFamily: "Inter_700Bold" },
  catDesc:         { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  tplCard:         { borderRadius: 18, borderWidth: 1, padding: 16 },
  tplIcon:         { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tplName:         { fontSize: 13, fontFamily: "Inter_700Bold" },
  tplMeta:         { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  tplDesc:         { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 2 },
  sectionsList:    { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 5 },
  sectionItem:     { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot:      { width: 5, height: 5, borderRadius: 3 },
  sectionText:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  varBadge:        { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  varBadgeText:    { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  infoBanner:      { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  sectionBox:      { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  boxTitle:        { fontSize: 13, fontFamily: "Inter_700Bold", padding: 14, paddingBottom: 10 },
  structureRow:    { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderTopWidth: 1 },
  structureNum:    { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  structureNumText:{ fontSize: 11, fontFamily: "Inter_700Bold" },
  structureTitle:  { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  structureDesc:   { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  srcBadge:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  srcBadgeText:    { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  varRow:          { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  varLabel:        { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  varSource:       { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  autoChip:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  autoChipText:    { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  fieldLabel:      { fontSize: 13, fontFamily: "Inter_500Medium" },
  input:           { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  langChip:        { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  docPreview:      { borderRadius: 18, borderWidth: 1.5, overflow: "hidden" },
  docPreviewHeader:{ padding: 16 },
  docPreviewHeaderText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  docPreviewHeaderSub:  { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", marginTop: 2 },
  docPreviewTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  docPreviewRef:   { fontSize: 11, fontFamily: "Inter_400Regular" },
  resolvedRow:     { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  resolvedVal:     { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "right" as const },
  genSpinner:      { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  sigInfoBox:      { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  footer:          { borderTopWidth: 1, paddingHorizontal: 18, paddingTop: 12 },
  primaryBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  primaryBtnText:  { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  secBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  secBtnText:      { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorBox:        { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  errorText:       { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  // Entity picker card in step 3
  entityCard:      { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});

const st = StyleSheet.create({
  stepDot:    { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  stepDotNum: { fontSize: 9, fontFamily: "Inter_700Bold" },
  stepLabel:  { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  stepLine:   { flex: 1, height: 1.5, borderRadius: 1 },
});
