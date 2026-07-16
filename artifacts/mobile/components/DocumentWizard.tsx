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
  { key: "attestation", label: "Attestations",   icon: "award"     as const, color: "#8b5cf6", desc: "Certifications et attestations officielles" },
  { key: "pv",          label: "PV & Comptes-rendus", icon: "clipboard" as const, color: "#10b981", desc: "Procès-verbaux de réunions" },
  { key: "reglements",  label: "Règlements",      icon: "book"      as const, color: "#3b82f6", desc: "Règlements et circulaires" },
  { key: "juridique",   label: "Juridique",        icon: "shield"    as const, color: "#ef4444", desc: "Documents légaux et contractuels" },
  { key: "finances",    label: "Finances",         icon: "dollar-sign" as const, color: "#f59e0b", desc: "Rapports et documents financiers" },
  { key: "statuts",     label: "Statuts",          icon: "book-open" as const, color: "#7c3aed", desc: "Statuts et certifications officielles" },
];

// ─── Source color helper ──────────────────────────────────────────────────────
function sourceColor(source: string): string {
  if (source.includes("syndicatesTable"))  return "#7c3aed";
  if (source.includes("buildingsTable") || source.includes("lotsTable")) return "#0891b2";
  if (source.includes("usersTable") || source.includes("conseilSyndical")) return "#10b981";
  if (source.includes("documentSequences")) return "#f59e0b";
  if (source.includes("généré"))           return "#6366f1";
  return "#64748b";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DocumentWizard({ visible, onClose, onComplete }: Props) {
  const colors = useColors();
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
      setError("Impossible de charger les modèles. Vérifiez la connexion.");
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
    goToStep(2);
  };

  // ── Step 2 → 3: select template + load autofill ──────────────────────────────
  const handleSelectTemplate = async (tpl: TemplateCatalog) => {
    setSelectedTpl(tpl);
    setFields({});
    goToStep(3);
    // Load DB-resolved values in background so step 3 shows real data
    setAutofillLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.autofill();
      setAutofillData(res.data);
    } catch {
      setAutofillData(null); // non-fatal — step 3 still works without it
    } finally {
      setAutofillLoading(false);
    }
  };

  // ── Step 3 → 4: load preview from API ────────────────────────────────────────
  const handleGoToPreview = async () => {
    if (!selectedTpl) return;
    // Validate required inputs
    for (const req of selectedTpl.requiredInputs) {
      if (!fields[req]?.trim()) {
        setError(`Le champ "${getFieldLabel(req, selectedTpl)}" est requis.`);
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
      setError("Impossible de charger l'aperçu. Les données du syndicat sont peut-être incomplètes.");
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
      };
      const res = await docsApi.generateFull(body);
      const doc = (res as any).data as { id: string; title: string } | undefined;
      setGeneratedDocId(doc?.id ?? null);
      setGeneratedDocTitle(doc?.title ?? selectedTpl.name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message?.includes("HTTP") ? "Impossible de générer le document. Vérifiez la connexion." : (err?.message ?? "Erreur de génération."));
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
      setError(err?.message?.includes("409") ? "Vous avez déjà signé ce document." : "Impossible d'enregistrer la signature.");
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
        { name: "meetingDate",         label: "Date de réunion",     source: "input utilisateur", placeholder: "15/07/2026" },
        { name: "lieu",                label: "Lieu",                source: "input utilisateur", placeholder: "Salle de réunion, Résidence..." },
        { name: "heure",               label: "Heure",               source: "input utilisateur", placeholder: "10h00" },
        { name: "agendaText",          label: "Ordre du jour",       source: "input utilisateur", multiline: true, placeholder: "1. Approbation du budget\n2. Travaux..." },
        { name: "deliberationsText",   label: "Délibérations",       source: "input utilisateur", multiline: true, placeholder: "Résumé des discussions..." },
        { name: "resolutionsText",     label: "Résolutions adoptées",source: "input utilisateur", multiline: true, placeholder: "Résolution 1: ..." },
      ],
      convocation: [
        ...common,
        { name: "memberName",  label: "Destinataire",  source: "input / usersTable",  placeholder: "Tous les membres" },
        { name: "meetingDate", label: "Date",          source: "input utilisateur",   placeholder: "15/07/2026" },
        { name: "lieu",        label: "Lieu",          source: "input utilisateur",   placeholder: "Résidence Al Fath, Salle..." },
        { name: "heure",       label: "Heure",         source: "input utilisateur",   placeholder: "10h00" },
        { name: "objet",       label: "Objet",         source: "input utilisateur",   placeholder: "Assemblée Générale Ordinaire" },
      ],
      contrat: [
        ...common,
        { name: "partieB",  label: "Partie 2 (Tiers)", source: "input utilisateur", placeholder: "Société XYZ SARL" },
        { name: "objet",    label: "Objet du contrat", source: "input utilisateur", placeholder: "Prestation de gardiennage..." },
        { name: "content",  label: "Clauses du contrat", source: "input utilisateur", multiline: true, placeholder: "Article 1 : ..." },
      ],
      circulaire: [
        ...common,
        { name: "objet",    label: "Objet", source: "input utilisateur", placeholder: "Information importante..." },
        { name: "content",  label: "Corps du message", source: "input utilisateur", multiline: true, placeholder: "Chers copropriétaires..." },
        { name: "modeEnvoi",label: "Mode d'envoi", source: "input utilisateur", placeholder: "Email + Affichage" },
      ],
      rapport_activite: [
        ...common,
        { name: "periode",      label: "Période couverte",  source: "input utilisateur", placeholder: "Janvier – Juin 2026" },
        { name: "activites",    label: "Activités réalisées", source: "input utilisateur", multiline: true, placeholder: "1. Réfection des parties communes\n2. ..." },
        { name: "indicateurs",  label: "Indicateurs",       source: "input utilisateur", multiline: true, placeholder: "Taux d'occupation: 97%\n..." },
        { name: "perspectives", label: "Perspectives",      source: "input utilisateur", multiline: true },
        { name: "synthese",     label: "Synthèse",          source: "input utilisateur", multiline: true },
      ],
      decision: [
        ...common,
        { name: "organe",   label: "Organe décisionnel", source: "input utilisateur", placeholder: "Bureau syndical" },
        { name: "objet",    label: "Objet de la décision", source: "input utilisateur", placeholder: "Approbation du budget..." },
        { name: "content",  label: "Corps de la décision", source: "input utilisateur", multiline: true },
      ],
      certificat: [
        ...common,
        { name: "memberName", label: "Bénéficiaire",        source: "input / usersTable", placeholder: "Mohammed Alaoui" },
        { name: "content",    label: "Objet du certificat", source: "input utilisateur",  multiline: true },
      ],
      mise_en_demeure: [
        ...common,
        { name: "memberName",   label: "Mis en demeure",  source: "input utilisateur", placeholder: "M. / Mme Alaoui" },
        { name: "objet",        label: "Objet",           source: "input utilisateur", placeholder: "Impayés de charges — 3 mois" },
        { name: "delai",        label: "Délai imparti",   source: "input utilisateur", placeholder: "15 jours à compter de la réception" },
        { name: "consequences", label: "Conséquences",    source: "input utilisateur", multiline: true },
        { name: "preamble",     label: "Préambule",       source: "input utilisateur", multiline: true },
      ],
      reglement: [
        ...common,
        { name: "content", label: "Clauses additionnelles", source: "input utilisateur", multiline: true, placeholder: "Article supplémentaire..." },
      ],
      demande_administrative: [
        ...common,
        { name: "memberName",   label: "Demandeur",         source: "input utilisateur" },
        { name: "objet",        label: "Objet de la demande", source: "input utilisateur" },
        { name: "expose",       label: "Exposé des motifs",  source: "input utilisateur", multiline: true },
        { name: "justificatifs",label: "Justificatifs",      source: "input utilisateur", multiline: true },
      ],
      autorisation: [
        ...common,
        { name: "memberName",        label: "Bénéficiaire",         source: "input utilisateur" },
        { name: "texteAutorisation", label: "Texte d'autorisation", source: "input utilisateur", multiline: true },
        { name: "conditions",        label: "Conditions",           source: "input utilisateur", multiline: true },
        { name: "dateDebut",         label: "Date de début",        source: "input utilisateur", placeholder: "01/07/2026" },
        { name: "dateFin",           label: "Date de fin",          source: "input utilisateur", placeholder: "31/12/2026" },
      ],
      ordre_de_mission: [
        ...common,
        { name: "memberName",  label: "Agent",               source: "input utilisateur" },
        { name: "poste",       label: "Poste",               source: "input utilisateur" },
        { name: "destination", label: "Destination",         source: "input utilisateur" },
        { name: "dateDepart",  label: "Date de départ",      source: "input utilisateur" },
        { name: "dateRetour",  label: "Date de retour",      source: "input utilisateur" },
        { name: "objetMission",label: "Objet de la mission", source: "input utilisateur", multiline: true },
        { name: "frais",       label: "Frais pris en charge",source: "input utilisateur" },
      ],
      lettre_officielle: [
        ...common,
        { name: "memberName", label: "Destinataire",         source: "input utilisateur" },
        { name: "objet",      label: "Objet",                source: "input utilisateur" },
        { name: "corps",      label: "Corps de la lettre",   source: "input utilisateur", multiline: true },
      ],
      note_interne: [
        ...common,
        { name: "memberName",  label: "À (destinataire)",  source: "input utilisateur" },
        { name: "de",          label: "De (émetteur)",     source: "input utilisateur" },
        { name: "objet",       label: "Objet",             source: "input utilisateur" },
        { name: "priorite",    label: "Priorité",          source: "input utilisateur", placeholder: "Normale / Urgente" },
        { name: "corps",       label: "Corps de la note",  source: "input utilisateur", multiline: true },
        { name: "actionRequise",label: "Action requise",   source: "input utilisateur" },
      ],
      rapport_financier: [
        ...common,
        { name: "exercice",     label: "Exercice comptable", source: "input utilisateur", placeholder: "2026" },
        { name: "totalPrevu",   label: "Budget prévu",       source: "input utilisateur", placeholder: "250 000 MAD" },
        { name: "totalRealise", label: "Réalisé",            source: "input utilisateur", placeholder: "240 000 MAD" },
        { name: "observations", label: "Observations",       source: "input utilisateur", multiline: true },
        { name: "etabliPar",    label: "Établi par",         source: "input utilisateur" },
        { name: "approuvePar",  label: "Approuvé par",       source: "input utilisateur" },
      ],
      rapport_audit: [
        ...common,
        { name: "auditeurs",       label: "Auditeurs",         source: "input utilisateur" },
        { name: "perimetre",       label: "Périmètre",         source: "input utilisateur" },
        { name: "periodeAuditee",  label: "Période auditée",   source: "input utilisateur", placeholder: "01/01/2026 — 30/06/2026" },
        { name: "opinion",         label: "Opinion d'audit",   source: "input utilisateur" },
        { name: "constats",        label: "Constats",          source: "input utilisateur", multiline: true },
        { name: "recommandations", label: "Recommandations",   source: "input utilisateur", multiline: true },
        { name: "conclusion",      label: "Conclusion",        source: "input utilisateur", multiline: true },
      ],
      convention_partenariat: [
        ...common,
        { name: "partieB",   label: "Partie B (Partenaire)", source: "input utilisateur" },
        { name: "preambule", label: "Préambule",             source: "input utilisateur", multiline: true },
        { name: "article1",  label: "Article 1 — Objet",    source: "input utilisateur", multiline: true },
        { name: "article2",  label: "Article 2 — Engagements", source: "input utilisateur", multiline: true },
        { name: "article3",  label: "Article 3 — Durée",    source: "input utilisateur", multiline: true },
        { name: "duree",     label: "Durée totale",         source: "input utilisateur", placeholder: "1 an renouvelable" },
      ],
      accord_collectif: [
        ...common,
        { name: "employeur",      label: "Employeur / Partie B", source: "input utilisateur" },
        { name: "champApplication", label: "Champ d'application", source: "input utilisateur", multiline: true },
        { name: "dispositions",   label: "Dispositions",         source: "input utilisateur", multiline: true },
        { name: "entreeVigueur",  label: "Entrée en vigueur",    source: "input utilisateur" },
      ],
      compte_rendu: [
        ...common,
        { name: "dateMeeting",     label: "Date",               source: "input utilisateur" },
        { name: "lieu",            label: "Lieu",               source: "input utilisateur" },
        { name: "presidentSeance", label: "Président de séance",source: "input utilisateur" },
        { name: "participants",    label: "Participants",        source: "input utilisateur", multiline: true },
        { name: "ordreJour",       label: "Ordre du jour",      source: "input utilisateur", multiline: true },
        { name: "deroulement",     label: "Déroulement",        source: "input utilisateur", multiline: true },
        { name: "decisions",       label: "Décisions prises",   source: "input utilisateur", multiline: true },
        { name: "prochaineReunion",label: "Prochaine réunion",  source: "input utilisateur" },
      ],
    };
    return maps[tplId] ?? common;
  }

  // ─── Step labels ──────────────────────────────────────────────────────────────
  const STEPS = [
    { num: 1, label: "Type" },
    { num: 2, label: "Modèle" },
    { num: 3, label: "Variables" },
    { num: 4, label: "Aperçu" },
    { num: 5, label: "Génération" },
    { num: 6, label: "Signature" },
    { num: 7, label: "Publication" },
  ];

  // ─── Render each step ─────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: Choose Category ──────────────────────────────────────────────
      case 1:
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}>
            <Text style={[s.stepTitle, { color: colors.foreground }]}>Choisir le type de document</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              Sélectionnez la catégorie qui correspond au document à créer.
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
                  <Text style={[s.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[s.catDesc, { color: colors.mutedForeground }]}>{cat.desc}</Text>
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
            <Text style={[s.stepTitle, { color: colors.foreground }]}>Choisir un modèle</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              Chaque modèle a une structure prédéfinie avec des sections et des variables automatiques.
            </Text>
            {templatesLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground, marginTop: 12 }]}>Chargement des modèles…</Text>
              </View>
            ) : templates.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                <Feather name="inbox" size={36} color={colors.mutedForeground} />
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>Aucun modèle disponible</Text>
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
                        +{tpl.sections.length - 4} autres sections
                      </Text>
                    ) : null}
                  </View>
                  {/* Variables count */}
                  <View style={[s.varBadge, { backgroundColor: tpl.color + "12" }]}>
                    <Feather name="code" size={11} color={tpl.color} />
                    <Text style={[s.varBadgeText, { color: tpl.color }]}>
                      {tpl.variables.length} variable{tpl.variables.length > 1 ? "s" : ""}  ·  {tpl.requiredInputs.length} champ{tpl.requiredInputs.length !== 1 ? "s" : ""} requis
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

            {/* Document structure */}
            <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.boxTitle, { color: colors.foreground }]}>Structure du document</Text>
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
                <Text style={[s.boxTitle, { color: colors.foreground }]}>Données automatiques</Text>
                {autofillLoading && <ActivityIndicator size="small" color={selectedTpl.color} />}
                {!autofillLoading && autofillData && (
                  <View style={[s.autoChip, { backgroundColor: "#10b98115" }]}>
                    <Feather name="check-circle" size={10} color="#10b981" />
                    <Text style={[s.autoChipText, { color: "#10b981" }]}>Résolu</Text>
                  </View>
                )}
              </View>
              <Text style={[s.stepSubtitle, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Ces informations sont récupérées automatiquement depuis votre profil et syndicat.
              </Text>
              {autofillLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>Récupération des données…</Text>
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
                add("Syndicat", si.syndicate_name, "#7c3aed");
                add("Adresse", si.syndicate_address ? `${si.syndicate_address}, ${si.syndicate_city ?? ""}`.trim().replace(/,$/, "") : null, "#7c3aed");
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
                    Aucune donnée syndicat trouvée. Complétez le profil de votre syndicat.
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
                            <Text style={[s.autoChipText, { color: row.color }]}>Auto</Text>
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
                      <Text style={[s.autoChipText, { color: sourceColor(v.source) }]}>Auto</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* User input fields */}
            <Text style={[s.boxTitle, { color: colors.foreground }]}>Informations à saisir</Text>
            {tplFields.map((f) => (
              <View key={f.name} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>{f.label}</Text>
                  <View style={[s.srcBadge, { backgroundColor: sourceColor(f.source) + "12" }]}>
                    <Text style={[s.srcBadgeText, { color: sourceColor(f.source) }]}>
                      {f.source.includes("input") ? "Saisie" : f.source}
                    </Text>
                  </View>
                  {selectedTpl.requiredInputs.includes(f.name) ? (
                    <Text style={{ color: "#ef4444", fontSize: 11 }}>requis</Text>
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
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>Langue du document</Text>
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
            <Text style={[s.stepTitle, { color: colors.foreground }]}>Aperçu avant génération</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              Vérifiez les données qui seront utilisées dans votre document avant de générer le PDF.
            </Text>

            {previewLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                <ActivityIndicator color={selectedTpl.color} size="large" />
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>Résolution des variables…</Text>
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
                      Réf. {previewData?.resolvedVariables?.documentNumber ?? `[${selectedTpl.id.toUpperCase()}-${new Date().getFullYear()}-XXXX]`}
                    </Text>
                  </View>
                </View>

                {/* Sections breakdown */}
                <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.boxTitle, { color: colors.foreground }]}>Composition du document</Text>
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
                    <Text style={[s.boxTitle, { color: colors.foreground }]}>Variables résolues</Text>
                    <Text style={[s.stepSubtitle, { color: colors.mutedForeground, marginBottom: 4 }]}>
                      Valeurs récupérées depuis votre base de données au {new Date(previewData.resolvedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
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
                                <Text style={[s.autoChipText, { color: "#10b981" }]}>Base de données</Text>
                              </View>
                            ) : userVal ? (
                              <View style={[s.autoChip, { backgroundColor: "#3b82f615" }]}>
                                <Feather name="user" size={9} color="#3b82f6" />
                                <Text style={[s.autoChipText, { color: "#3b82f6" }]}>Saisi</Text>
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
                <Text style={[s.stepTitle, { color: colors.foreground, textAlign: "center" }]}>Génération en cours…</Text>
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
                  Le moteur PDF compile votre document avec les données du syndicat, le QR de vérification et la mise en page officielle.
                </Text>
              </>
            ) : generatedDocId ? (
              <>
                <View style={[s.genSpinner, { backgroundColor: "#10b98118" }]}>
                  <Feather name="check-circle" size={48} color="#10b981" />
                </View>
                <Text style={[s.stepTitle, { color: colors.foreground, textAlign: "center" }]}>Document généré !</Text>
                <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
                  "{generatedDocTitle}" a été généré avec succès et est disponible dans la liste des documents.
                </Text>
                <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
                  {[
                    { icon: "file-text"  as const, label: "Modèle",    value: selectedTpl?.name ?? "" },
                    { icon: "globe"      as const, label: "Langue",    value: { fr: "Français", ar: "Arabe", en: "Anglais", es: "Espagnol" }[language] },
                    { icon: "shield"     as const, label: "QR inclus", value: "Vérification authentifiée" },
                    { icon: "clock"      as const, label: "Statut",    value: "Généré — en attente de signature" },
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
                <Text style={[s.stepTitle, { color: "#ef4444", textAlign: "center" }]}>Échec de la génération</Text>
                {error ? <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>{error}</Text> : null}
              </>
            )}
          </ScrollView>
        );

      // ── Step 6: Sign ──────────────────────────────────────────────────────────
      case 6:
        return (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
            <Text style={[s.stepTitle, { color: colors.foreground }]}>Signer le document</Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
              Apposez votre signature manuscrite électronique. Elle sera intégrée au PDF et horodatée de façon irréversible.
            </Text>

            <View style={[s.sigInfoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { icon: "shield"  as const, text: "Signature cryptographiquement liée au document" },
                { icon: "clock"   as const, text: "Horodatage automatique à la seconde" },
                { icon: "user"    as const, text: "Rôle et identité enregistrés" },
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
                <Text style={[s.secBtnText, { color: colors.foreground }]}>Effacer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 2, backgroundColor: sigEmpty ? colors.mutedForeground : "#8b5cf6", opacity: signing ? 0.7 : 1 }]}
                disabled={sigEmpty || signing}
                onPress={handleSign}
              >
                {signing ? <ActivityIndicator color="#fff" /> : <Feather name="edit-3" size={18} color="#fff" />}
                <Text style={s.primaryBtnText}>{signing ? "Envoi…" : "Signer le document"}</Text>
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
              Prêt à publier
            </Text>
            <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
              Publier rendra le document visible à tous les membres de votre syndicat. Cette action peut être annulée en archivant le document.
            </Text>
            <View style={[s.sectionBox, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
              {[
                { label: "Document",  value: generatedDocTitle },
                { label: "Catégorie", value: CATEGORIES.find((c) => c.key === selectedCat)?.label ?? selectedCat },
                { label: "Modèle",    value: selectedTpl?.name ?? "" },
                { label: "Langue",    value: { fr: "Français", ar: "Arabe", en: "Anglais", es: "Espagnol" }[language] },
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
                <Text style={s.primaryBtnText}>{publishing ? "Publication…" : "Publier maintenant"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secBtn, { borderColor: colors.border, backgroundColor: colors.card, justifyContent: "center" }]}
                onPress={() => onComplete(generatedDocId ?? undefined)}
              >
                <Feather name="check" size={16} color={colors.foreground} />
                <Text style={[s.secBtnText, { color: colors.foreground }]}>Terminer sans publier</Text>
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
      2: "Continuer",
      3: "Voir l'aperçu",
      4: "Générer le PDF",
      5: generating ? "…" : (generatedDocId ? "Signer" : "Réessayer"),
      6: "Passer",
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
              <Text style={[s.secBtnText, { color: colors.foreground }]}>Retour</Text>
            </TouchableOpacity>
          ) : null}
          {showNext ? (
            <TouchableOpacity
              style={[s.primaryBtn, { flex: canGoBack ? 2 : 1, backgroundColor: selectedTpl?.color ?? colors.primary }]}
              onPress={handleNext}
            >
              <Text style={s.primaryBtnText}>{nextLabel[step] ?? "Continuer"}</Text>
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
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Créer un document</Text>
            <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
              Étape {step} / 7 — {STEPS[step - 1]?.label}
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
});

const st = StyleSheet.create({
  stepDot:    { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  stepDotNum: { fontSize: 9, fontFamily: "Inter_700Bold" },
  stepLabel:  { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  stepLine:   { flex: 1, height: 1.5, borderRadius: 1 },
});
