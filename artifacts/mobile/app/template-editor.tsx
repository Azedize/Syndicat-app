/**
 * template-editor.tsx — Template Editor & Version Manager
 *
 * Create/edit a template definition. Tabs: Info | Variables | Sections | Languages | Versions | Permissions
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { apiRequest as libApiRequest } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface I18NField { fr: string; ar: string; en: string; es: string; }
const LANGS = ["fr", "ar", "en", "es"] as const;
const LANG_LABELS: Record<string, string> = { fr: "Français 🇫🇷", ar: "العربية 🇲🇦", en: "English 🇬🇧", es: "Español 🇪🇸" };

type VariableSource = "db_syndicate" | "db_property" | "db_office_holders" | "db_member" | "user_input" | "generated";
type VariableType   = "text" | "date" | "number" | "boolean" | "list";
type SectionType    = "text" | "table" | "signature" | "stamp" | "qr" | "image" | "chart" | "page_break";

interface VariableDef {
  name: string;
  label: I18NField;
  source: VariableSource;
  type: VariableType;
  required: boolean;
  example: string;
}

interface SectionDef {
  id: string;
  title: I18NField;
  content: I18NField;
  type: SectionType;
  required: boolean;
  order: number;
}

interface TemplateForm {
  slug: string;
  category: string;
  name: I18NField;
  description: I18NField;
  variables: VariableDef[];
  sections: SectionDef[];
  languages: string[];
  layoutConfig: {
    accentColor: string;
    headerStyle: "branded" | "minimal" | "none";
    footerStyle: "full" | "minimal" | "none";
    watermark: boolean;
    showQr: boolean;
    showStamp: boolean;
  };
}

interface VersionEntry {
  id: string;
  version: number;
  changeDescription: string | null;
  authorName: string | null;
  createdAt: string;
}

interface PermissionEntry {
  id: string;
  role: string;
  canUse: boolean;
  canEdit: boolean;
  canPublish: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "meeting_minutes", label: "Procès-verbaux"      },
  { key: "financial",       label: "Finance"              },
  { key: "legal",           label: "Juridique"            },
  { key: "elections",       label: "Élections"            },
  { key: "contracts",       label: "Contrats"             },
  { key: "certificates",    label: "Certificats"          },
  { key: "regulations",     label: "Règlements"           },
  { key: "administrative",  label: "Administratif"        },
  { key: "maintenance",     label: "Maintenance"          },
  { key: "insurance",       label: "Assurance"            },
];

const VARIABLE_SOURCES: { key: VariableSource; label: string; color: string }[] = [
  { key: "db_syndicate",      label: "Syndicat (DB)",      color: "#2563EB" },
  { key: "db_property",       label: "Résidence (DB)",     color: "#3b82f6" },
  { key: "db_office_holders", label: "Élus (DB)",          color: "#10b981" },
  { key: "db_member",         label: "Membre (DB)",        color: "#f59e0b" },
  { key: "user_input",        label: "Saisie utilisateur", color: "#0891b2" },
  { key: "generated",         label: "Généré auto",        color: "#6b7280" },
];

const SECTION_TYPES: { key: SectionType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "text",       label: "Texte",         icon: "type"      },
  { key: "table",      label: "Tableau",       icon: "grid"      },
  { key: "signature",  label: "Signature",     icon: "pen-tool"  },
  { key: "stamp",      label: "Cachet",        icon: "circle"    },
  { key: "qr",         label: "QR Code",       icon: "grid"      },
  { key: "image",      label: "Image",         icon: "image"     },
  { key: "chart",      label: "Graphique",     icon: "bar-chart-2" },
  { key: "page_break", label: "Saut de page",  icon: "minus"     },
];

const ROLES = [
  { key: "super_admin",     label: "Super Admin"          },
  { key: "syndicate_admin", label: "Admin Syndicat"       },
  { key: "member",          label: "Membre"               },
  { key: "tenant",          label: "Locataire"            },
  { key: "all",             label: "Tous les rôles"       },
];

const PRESET_VARIABLES: VariableDef[] = [
  { name: "syndicate_name",    label: { fr: "Nom du syndicat",      ar: "اسم النقابة",          en: "Syndicate name",      es: "Nombre del sindicato"    }, source: "db_syndicate",      type: "text", required: true,  example: "Résidence Les Roses" },
  { name: "syndicate_address", label: { fr: "Adresse du syndicat",  ar: "عنوان النقابة",         en: "Syndicate address",   es: "Dirección del sindicato" }, source: "db_syndicate",      type: "text", required: false, example: "123 Rue Mohammed V, Casablanca" },
  { name: "president_name",    label: { fr: "Nom du président",     ar: "اسم الرئيس",            en: "President name",      es: "Nombre del presidente"   }, source: "db_office_holders", type: "text", required: false, example: "M. Ahmed Benali" },
  { name: "treasurer_name",    label: { fr: "Nom du trésorier",     ar: "اسم أمين المال",         en: "Treasurer name",      es: "Nombre del tesorero"     }, source: "db_office_holders", type: "text", required: false, example: "Mme. Fatima Zahra" },
  { name: "member_name",       label: { fr: "Nom du membre",        ar: "اسم العضو",             en: "Member name",         es: "Nombre del miembro"      }, source: "db_member",         type: "text", required: false, example: "M. Khalid Alaoui" },
  { name: "building_name",     label: { fr: "Nom de la résidence",  ar: "اسم العقار",            en: "Building name",       es: "Nombre del edificio"     }, source: "db_property",       type: "text", required: false, example: "Résidence Al Fath" },
  { name: "lot_number",        label: { fr: "Numéro de lot",        ar: "رقم الوحدة",            en: "Lot number",          es: "Número de unidad"        }, source: "db_property",       type: "text", required: false, example: "A-12" },
  { name: "document_number",   label: { fr: "Numéro de document",   ar: "رقم الوثيقة",           en: "Document number",     es: "Número de documento"     }, source: "generated",         type: "text", required: true,  example: "ATT-2026-0001" },
  { name: "issue_date",        label: { fr: "Date d'émission",      ar: "تاريخ الإصدار",          en: "Issue date",          es: "Fecha de emisión"        }, source: "generated",         type: "date", required: true,  example: "16 juillet 2026" },
];

const emptyI18N = (): I18NField => ({ fr: "", ar: "", en: "", es: "" });

const defaultForm = (): TemplateForm => ({
  slug: "",
  category: "administrative",
  name: emptyI18N(),
  description: emptyI18N(),
  variables: [],
  sections: [
    { id: crypto.randomUUID?.() ?? String(Date.now()), title: { fr: "Contenu", ar: "المحتوى", en: "Content", es: "Contenido" }, content: emptyI18N(), type: "text", required: true, order: 0 },
  ],
  languages: ["fr"],
  layoutConfig: { accentColor: "#2563EB", headerStyle: "branded", footerStyle: "full", watermark: false, showQr: true, showStamp: true },
});

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiReq(path: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: object) {
  // Strip leading /api prefix — libApiRequest already prepends /api internally
  return libApiRequest(path.replace(/^\/api/, ""), method, body);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}{required && <Text style={{ color: "#ef4444" }}> *</Text>}</Text>
      {children}
    </View>
  );
}

function TInput({ value, onChangeText, placeholder, multiline, mono }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean; mono?: boolean;
}) {
  return (
    <TextInput
      style={[s.input, multiline && s.inputMulti, mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#475569"
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      textAlignVertical={multiline ? "top" : "center"}
    />
  );
}

function I18NEditor({ value, onChange, label, multiline }: {
  value: I18NField; onChange: (v: I18NField) => void; label: string; multiline?: boolean;
}) {
  const [activeLang, setActiveLang] = useState<"fr" | "ar" | "en" | "es">("fr");
  return (
    <View style={s.i18nWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.i18nTabs}>
        {LANGS.map((l) => (
          <TouchableOpacity key={l} style={[s.i18nTab, activeLang === l && s.i18nTabActive]}
            onPress={() => setActiveLang(l)}>
            <Text style={[s.i18nTabText, activeLang === l && s.i18nTabTextActive]}>{l.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={[s.input, multiline && s.inputMulti, activeLang === "ar" && { textAlign: "right" }]}
        value={value[activeLang]}
        onChangeText={(t) => onChange({ ...value, [activeLang]: t })}
        placeholder={`${label} en ${LANG_LABELS[activeLang]?.split(" ")[0] ?? activeLang}`}
        placeholderTextColor="#475569"
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

// ─── Variable Editor ──────────────────────────────────────────────────────────

function VariableEditor({ variables, onChange }: { variables: VariableDef[]; onChange: (v: VariableDef[]) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<VariableDef | null>(null);

  const openEdit = (idx: number) => { setEditingIdx(idx); setDraft({ ...variables[idx] }); };
  const openNew  = () => { setEditingIdx(-1); setDraft({ name: "", label: emptyI18N(), source: "user_input", type: "text", required: false, example: "" }); };
  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) { Alert.alert("Erreur", "Le nom de la variable est requis"); return; }
    const updated = [...variables];
    if (editingIdx === -1) updated.push(draft);
    else updated[editingIdx!] = draft;
    onChange(updated);
    setEditingIdx(null);
    setDraft(null);
  };
  const remove = (idx: number) => Alert.alert("Supprimer", "Supprimer cette variable ?", [
    { text: "Annuler", style: "cancel" },
    { text: "Supprimer", style: "destructive", onPress: () => onChange(variables.filter((_, i) => i !== idx)) },
  ]);

  return (
    <View>
      <SectionHeader title="Variables" subtitle="Données dynamiques injectées dans le template" />

      {/* Preset quick-add */}
      <Text style={s.sectionSub2}>Variables prédéfinies disponibles</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
          {PRESET_VARIABLES.filter((p) => !variables.find((v) => v.name === p.name)).map((preset) => {
            const src = VARIABLE_SOURCES.find((s2) => s2.key === preset.source);
            return (
              <TouchableOpacity key={preset.name}
                style={[s.presetChip, { borderColor: src?.color + "44" }]}
                onPress={() => onChange([...variables, preset])}
              >
                <Text style={[s.presetChipText, { color: src?.color }]}>{"{{" + preset.name + "}}"}</Text>
                <Feather name="plus" size={11} color={src?.color} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Variable list */}
      {variables.map((v, idx) => {
        const src = VARIABLE_SOURCES.find((s2) => s2.key === v.source);
        return (
          <View key={v.name} style={s.varCard}>
            <View style={[s.varSourceDot, { backgroundColor: src?.color ?? "#6b7280" }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.varName}>{"{{" + v.name + "}}"}</Text>
              <Text style={s.varLabel}>{v.label.fr || "—"}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <View style={[s.varTag, { backgroundColor: (src?.color ?? "#6b7280") + "22" }]}>
                  <Text style={[s.varTagText, { color: src?.color ?? "#6b7280" }]}>{src?.label ?? v.source}</Text>
                </View>
                <View style={[s.varTag, { backgroundColor: "#33415522" }]}>
                  <Text style={[s.varTagText, { color: "#64748b" }]}>{v.type}</Text>
                </View>
                {v.required && (
                  <View style={[s.varTag, { backgroundColor: "#ef444422" }]}>
                    <Text style={[s.varTagText, { color: "#ef4444" }]}>requis</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <TouchableOpacity onPress={() => openEdit(idx)} style={s.varAction}>
                <Feather name="edit-2" size={14} color="#94a3b8" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(idx)} style={s.varAction}>
                <Feather name="trash-2" size={14} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={s.addBtn} onPress={openNew}>
        <Feather name="plus" size={16} color="#2563EB" />
        <Text style={s.addBtnText}>Ajouter une variable personnalisée</Text>
      </TouchableOpacity>

      {/* Edit Modal */}
      <Modal visible={editingIdx !== null} transparent animationType="slide" onRequestClose={() => setEditingIdx(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{editingIdx === -1 ? "Nouvelle variable" : "Modifier la variable"}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {draft && (
                <>
                  <Field label="Nom (identifiant)" required>
                    <TInput value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t.toLowerCase().replace(/\s/g, "_") })} placeholder="ex: syndicate_name" mono />
                  </Field>
                  <I18NEditor value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} label="Libellé" />
                  <Field label="Source">
                    <View style={s.pickerWrap}>
                      {VARIABLE_SOURCES.map((src) => (
                        <TouchableOpacity key={src.key} style={[s.pickerChip, draft.source === src.key && { backgroundColor: src.color + "22", borderColor: src.color }]}
                          onPress={() => setDraft({ ...draft, source: src.key })}>
                          <Text style={[s.pickerChipText, draft.source === src.key && { color: src.color }]}>{src.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                  <Field label="Type">
                    <View style={s.pickerWrap}>
                      {(["text", "date", "number", "boolean", "list"] as VariableType[]).map((type) => (
                        <TouchableOpacity key={type} style={[s.pickerChip, draft.type === type && s.pickerChipActive]}
                          onPress={() => setDraft({ ...draft, type })}>
                          <Text style={[s.pickerChipText, draft.type === type && s.pickerChipTextActive]}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                  <Field label="Valeur d'exemple (prévisualisation)">
                    <TInput value={draft.example} onChangeText={(t) => setDraft({ ...draft, example: t })} placeholder="ex: M. Ahmed Benali" />
                  </Field>
                  <View style={s.switchRow}>
                    <Text style={s.fieldLabel}>Requis</Text>
                    <Switch value={draft.required} onValueChange={(v) => setDraft({ ...draft, required: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
                  </View>
                </>
              )}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setEditingIdx(null)}>
                <Text style={s.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={save}>
                <Text style={s.modalSaveText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Section Editor ───────────────────────────────────────────────────────────

function SectionEditor({ sections, onChange }: { sections: SectionDef[]; onChange: (s: SectionDef[]) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<SectionDef | null>(null);

  const openEdit = (idx: number) => { setEditingIdx(idx); setDraft({ ...sections[idx] }); };
  const openNew  = () => {
    setEditingIdx(-1);
    setDraft({ id: String(Date.now()), title: emptyI18N(), content: emptyI18N(), type: "text", required: false, order: sections.length });
  };
  const save = () => {
    if (!draft) return;
    if (!draft.title.fr.trim()) { Alert.alert("Erreur", "Le titre de la section (FR) est requis"); return; }
    const updated = [...sections];
    if (editingIdx === -1) updated.push(draft);
    else updated[editingIdx!] = draft;
    onChange(updated);
    setEditingIdx(null); setDraft(null);
  };
  const remove = (idx: number) => Alert.alert("Supprimer", "Supprimer cette section ?", [
    { text: "Annuler", style: "cancel" },
    { text: "Supprimer", style: "destructive", onPress: () => onChange(sections.filter((_, i) => i !== idx)) },
  ]);
  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= sections.length) return;
    const arr = [...sections];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    arr.forEach((s, i) => s.order = i);
    onChange(arr);
  };

  return (
    <View>
      <SectionHeader title="Sections" subtitle="Blocs de contenu composant le document" />
      {sections.map((sec, idx) => {
        const typeInfo = SECTION_TYPES.find((t) => t.key === sec.type);
        return (
          <View key={sec.id} style={s.secCard}>
            <View style={s.secOrderBtns}>
              <TouchableOpacity onPress={() => move(idx, -1)} disabled={idx === 0} style={[s.secOrderBtn, idx === 0 && { opacity: 0.3 }]}>
                <Feather name="chevron-up" size={14} color="#94a3b8" />
              </TouchableOpacity>
              <Text style={s.secOrder}>{idx + 1}</Text>
              <TouchableOpacity onPress={() => move(idx, 1)} disabled={idx === sections.length - 1} style={[s.secOrderBtn, idx === sections.length - 1 && { opacity: 0.3 }]}>
                <Feather name="chevron-down" size={14} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Feather name={typeInfo?.icon ?? "file"} size={13} color="#2563EB" />
                <Text style={s.secTitle}>{sec.title.fr || "Section sans titre"}</Text>
              </View>
              {sec.content?.fr ? (
                <Text style={s.secContent} numberOfLines={2}>{sec.content.fr}</Text>
              ) : (
                <Text style={s.secContentEmpty}>Contenu vide — à remplir dans l'éditeur</Text>
              )}
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <View style={s.varTag}>
                  <Text style={s.varTagText}>{typeInfo?.label ?? sec.type}</Text>
                </View>
                {sec.required && <View style={[s.varTag, { backgroundColor: "#ef444422" }]}><Text style={[s.varTagText, { color: "#ef4444" }]}>requis</Text></View>}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => openEdit(idx)} style={s.varAction}><Feather name="edit-2" size={14} color="#94a3b8" /></TouchableOpacity>
              <TouchableOpacity onPress={() => remove(idx)} style={s.varAction}><Feather name="trash-2" size={14} color="#ef4444" /></TouchableOpacity>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={s.addBtn} onPress={openNew}>
        <Feather name="plus" size={16} color="#2563EB" />
        <Text style={s.addBtnText}>Ajouter une section</Text>
      </TouchableOpacity>

      <Modal visible={editingIdx !== null} transparent animationType="slide" onRequestClose={() => setEditingIdx(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{editingIdx === -1 ? "Nouvelle section" : "Modifier la section"}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {draft && (
                <>
                  <I18NEditor value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} label="Titre de section" />
                  <I18NEditor value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} label="Contenu par défaut" multiline />
                  <Field label="Type de bloc">
                    <View style={s.pickerWrap}>
                      {SECTION_TYPES.map((t) => (
                        <TouchableOpacity key={t.key} style={[s.pickerChip, draft.type === t.key && s.pickerChipActive]}
                          onPress={() => setDraft({ ...draft, type: t.key })}>
                          <Feather name={t.icon} size={12} color={draft.type === t.key ? "#2563EB" : "#64748b"} />
                          <Text style={[s.pickerChipText, draft.type === t.key && s.pickerChipTextActive]}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                  <View style={s.switchRow}>
                    <Text style={s.fieldLabel}>Section obligatoire</Text>
                    <Switch value={draft.required} onValueChange={(v) => setDraft({ ...draft, required: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
                  </View>
                </>
              )}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setEditingIdx(null)}><Text style={s.modalCancelText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={save}><Text style={s.modalSaveText}>Enregistrer</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Versions Tab ─────────────────────────────────────────────────────────────

function VersionsTab({ templateId }: { templateId: string }) {
  const { showToast } = useToast();
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiReq(`/api/template-studio/templates/${templateId}/versions`)
      .then((r) => setVersions(r.data ?? []))
      .catch(() => showToast({ type: "error", message: "Erreur chargement versions" }))
      .finally(() => setLoading(false));
  }, [templateId]);

  const restore = (ver: VersionEntry) => {
    Alert.alert(
      "Restaurer la version",
      `Restaurer v${ver.version} "${ver.changeDescription ?? ""}" ? Cela créera une nouvelle version.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Restaurer", onPress: async () => {
            try {
              await apiReq(`/api/template-studio/templates/${templateId}/versions/${ver.id}/restore`, "POST");
              showToast({ type: "success", message: "Version restaurée" });
              const r = await apiReq(`/api/template-studio/templates/${templateId}/versions`);
              setVersions(r.data ?? []);
            } catch { showToast({ type: "error", message: "Erreur" }); }
          },
        },
      ],
    );
  };

  if (loading) return <ActivityIndicator color="#2563EB" style={{ marginTop: 40 }} />;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <SectionHeader title="Historique des versions" subtitle={`${versions.length} version${versions.length !== 1 ? "s" : ""} enregistrée${versions.length !== 1 ? "s" : ""}`} />
      {versions.map((ver, idx) => (
        <View key={ver.id} style={s.verCard}>
          <View style={[s.verDot, idx === 0 && { backgroundColor: "#2563EB" }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[s.verVersion, idx === 0 && { color: "#a78bfa" }]}>Version {ver.version}</Text>
              {idx === 0 && <View style={s.verCurrentBadge}><Text style={s.verCurrentText}>Actuelle</Text></View>}
            </View>
            <Text style={s.verDesc}>{ver.changeDescription ?? "Mise à jour"}</Text>
            <Text style={s.verMeta}>{ver.authorName ?? "—"} · {new Date(ver.createdAt).toLocaleDateString("fr-MA", { dateStyle: "medium" })}</Text>
          </View>
          {idx > 0 && (
            <TouchableOpacity onPress={() => restore(ver)} style={s.verRestoreBtn}>
              <Feather name="refresh-cw" size={14} color="#2563EB" />
              <Text style={s.verRestoreText}>Restaurer</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab({ templateId }: { templateId: string }) {
  const { showToast } = useToast();
  const [perms, setPerms] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiReq(`/api/template-studio/templates/${templateId}/permissions`)
      .then((r) => {
        const existing = r.data ?? [];
        // Fill missing roles with defaults
        const merged = ROLES.map((role) => {
          const found = existing.find((p: PermissionEntry) => p.role === role.key);
          return found ?? { id: "", role: role.key, canUse: role.key === "super_admin", canEdit: role.key === "super_admin", canPublish: role.key === "super_admin" };
        });
        setPerms(merged);
      })
      .catch(() => showToast({ type: "error", message: "Erreur chargement permissions" }))
      .finally(() => setLoading(false));
  }, [templateId]);

  const toggle = (idx: number, field: "canUse" | "canEdit" | "canPublish") => {
    const updated = [...perms];
    updated[idx] = { ...updated[idx], [field]: !updated[idx][field] };
    setPerms(updated);
  };

  const save = async () => {
    try {
      setSaving(true);
      await apiReq(`/api/template-studio/templates/${templateId}/permissions`, "PUT", { permissions: perms });
      showToast({ type: "success", message: "Permissions mises à jour" });
    } catch { showToast({ type: "error", message: "Erreur" }); }
    finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator color="#2563EB" style={{ marginTop: 40 }} />;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <SectionHeader title="Permissions" subtitle="Contrôle d'accès par rôle" />
      <View style={s.permHeader}>
        <Text style={[s.permLabel, { flex: 1 }]}>Rôle</Text>
        <Text style={s.permCol}>Utiliser</Text>
        <Text style={s.permCol}>Modifier</Text>
        <Text style={s.permCol}>Publier</Text>
      </View>
      {perms.map((perm, idx) => {
        const role = ROLES.find((r) => r.key === perm.role);
        const isSuperAdmin = perm.role === "super_admin";
        return (
          <View key={perm.role} style={s.permRow}>
            <Text style={[s.permLabel, { flex: 1 }]}>{role?.label ?? perm.role}</Text>
            {(["canUse", "canEdit", "canPublish"] as const).map((field) => (
              <View key={field} style={s.permColView}>
                <Switch
                  value={perm[field]}
                  onValueChange={() => { if (!isSuperAdmin) toggle(idx, field); }}
                  disabled={isSuperAdmin}
                  trackColor={{ false: "#334155", true: "#2563EB" }}
                  thumbColor={perm[field] ? "#a78bfa" : "#64748b"}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>
            ))}
          </View>
        );
      })}
      <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="save" size={16} color="#fff" /><Text style={s.saveBtnText}>Enregistrer les permissions</Text></>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Layout Tab ───────────────────────────────────────────────────────────────

function LayoutTab({ config, onChange }: { config: TemplateForm["layoutConfig"]; onChange: (c: TemplateForm["layoutConfig"]) => void }) {
  const ACCENT_PRESETS = ["#2563EB", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#0891b2", "#ec4899", "#1e293b"];
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <SectionHeader title="Mise en page" subtitle="Apparence et structure du document" />
      <Field label="Couleur d'accentuation">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
          {ACCENT_PRESETS.map((c) => (
            <TouchableOpacity key={c} style={[s.colorSwatch, { backgroundColor: c }, config.accentColor === c && s.colorSwatchActive]}
              onPress={() => onChange({ ...config, accentColor: c })} />
          ))}
        </View>
        <TInput value={config.accentColor} onChangeText={(t) => onChange({ ...config, accentColor: t })} placeholder="#2563EB" mono />
      </Field>
      <Field label="Style d'en-tête">
        <View style={s.pickerWrap}>
          {([["branded", "Avec marque"], ["minimal", "Minimal"], ["none", "Aucun"]] as const).map(([k, l]) => (
            <TouchableOpacity key={k} style={[s.pickerChip, config.headerStyle === k && s.pickerChipActive]}
              onPress={() => onChange({ ...config, headerStyle: k })}>
              <Text style={[s.pickerChipText, config.headerStyle === k && s.pickerChipTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <Field label="Style de pied de page">
        <View style={s.pickerWrap}>
          {([["full", "Complet"], ["minimal", "Minimal"], ["none", "Aucun"]] as const).map(([k, l]) => (
            <TouchableOpacity key={k} style={[s.pickerChip, config.footerStyle === k && s.pickerChipActive]}
              onPress={() => onChange({ ...config, footerStyle: k })}>
              <Text style={[s.pickerChipText, config.footerStyle === k && s.pickerChipTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <View style={s.switchRow}>
        <View><Text style={s.fieldLabel}>Filigrane (brouillon)</Text><Text style={s.fieldSub}>Affiche "BROUILLON" en arrière-plan</Text></View>
        <Switch value={config.watermark} onValueChange={(v) => onChange({ ...config, watermark: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
      </View>
      <View style={s.switchRow}>
        <View><Text style={s.fieldLabel}>QR Code de vérification</Text><Text style={s.fieldSub}>Intègre un QR dans l'en-tête</Text></View>
        <Switch value={config.showQr} onValueChange={(v) => onChange({ ...config, showQr: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
      </View>
      <View style={s.switchRow}>
        <View><Text style={s.fieldLabel}>Bloc cachet officiel</Text><Text style={s.fieldSub}>Cercle de cachet dans la signature</Text></View>
        <Switch value={config.showStamp} onValueChange={(v) => onChange({ ...config, showStamp: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "info",        label: "Info",        icon: "info"         as const },
  { key: "variables",   label: "Variables",   icon: "code"         as const },
  { key: "sections",    label: "Sections",    icon: "layout"       as const },
  { key: "layout",      label: "Mise en page",icon: "sliders"      as const },
  { key: "versions",    label: "Versions",    icon: "clock"        as const },
  { key: "permissions", label: "Permissions", icon: "key"          as const },
];

function TemplateEditorContent() {
  const params = useLocalSearchParams<{ id?: string; mode?: string; tab?: string }>();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isNew = params.mode === "create" || !params.id;

  const [form, setForm] = useState<TemplateForm>(defaultForm());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(params.tab ?? "info");
  const [changeDesc, setChangeDesc] = useState("");
  const [showChangeModal, setShowChangeModal] = useState(false);

  // Load existing template
  useEffect(() => {
    if (isNew || !params.id) return;
    apiReq(`/api/template-studio/templates/${params.id}`)
      .then((r) => {
        const d = r.data;
        setForm({
          slug:         d.slug ?? "",
          category:     d.category ?? "administrative",
          name:         (typeof d.name === "object" ? d.name : {}) as I18NField,
          description:  (typeof d.description === "object" ? d.description : {}) as I18NField,
          variables:    Array.isArray(d.variables) ? d.variables : [],
          sections:     Array.isArray(d.sections) ? d.sections : [],
          languages:    Array.isArray(d.languages) ? d.languages : ["fr"],
          layoutConfig: typeof d.layoutConfig === "object" && d.layoutConfig
            ? { ...defaultForm().layoutConfig, ...d.layoutConfig }
            : defaultForm().layoutConfig,
        });
      })
      .catch(() => showToast({ type: "error", message: "Erreur chargement du template" }))
      .finally(() => setLoading(false));
  }, [params.id]);

  const doSave = async (desc: string) => {
    if (!form.slug.trim() || !form.name.fr.trim()) {
      showToast({ type: "error", message: "Le slug et le nom (FR) sont requis" }); return;
    }
    try {
      setSaving(true);
      const payload = { ...form, changeDescription: desc || undefined };
      if (isNew) {
        await apiReq("/api/template-studio/templates", "POST", payload);
        showToast({ type: "success", message: "Template créé avec succès" });
        router.back();
      } else {
        await apiReq(`/api/template-studio/templates/${params.id}`, "PUT", payload);
        showToast({ type: "success", message: "Template mis à jour" });
      }
    } catch (err: any) {
      showToast({ type: "error", message: err?.message?.includes("slug") ? "Ce slug existe déjà" : "Erreur lors de la sauvegarde" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!isNew) {
      setShowChangeModal(true);
    } else {
      doSave("");
    }
  };

  if (loading) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ color: "#64748b", marginTop: 12 }}>Chargement du template...</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: "#0f172a" }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{isNew ? "Nouveau template" : (form.name.fr || "Éditer le template")}</Text>
          {!isNew && <Text style={s.headerSub}>slug: {form.slug}</Text>}
        </View>
        <TouchableOpacity
          style={[s.saveBtn2, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Feather name="save" size={15} color="#fff" /><Text style={s.saveBtnText2}>{isNew ? "Créer" : "Sauver"}</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabsContent}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}>
            <Feather name={tab.icon} size={13} color={activeTab === tab.key ? "#a78bfa" : "#64748b"} />
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {activeTab === "info" && (
          <View style={{ padding: 20, gap: 4 }}>
            <SectionHeader title="Informations générales" />
            <Field label="Slug (identifiant unique)" required>
              <TInput value={form.slug} onChangeText={(t) => setForm({ ...form, slug: t.toLowerCase().replace(/\s/g, "_") })} placeholder="ex: attestation_v2" mono />
            </Field>
            <Field label="Catégorie" required>
              <View style={s.pickerWrap}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c.key} style={[s.pickerChip, form.category === c.key && s.pickerChipActive]}
                    onPress={() => setForm({ ...form, category: c.key })}>
                    <Text style={[s.pickerChipText, form.category === c.key && s.pickerChipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>
            <I18NEditor value={form.name} onChange={(v) => setForm({ ...form, name: v })} label="Nom du template" />
            <I18NEditor value={form.description} onChange={(v) => setForm({ ...form, description: v })} label="Description" multiline />
            <Field label="Langues supportées">
              <View style={s.pickerWrap}>
                {LANGS.map((l) => {
                  const active = form.languages.includes(l);
                  return (
                    <TouchableOpacity key={l} style={[s.pickerChip, active && s.pickerChipActive]}
                      onPress={() => {
                        const next = active ? form.languages.filter((x) => x !== l) : [...form.languages, l];
                        if (next.length === 0) return;
                        setForm({ ...form, languages: next });
                      }}>
                      <Text style={[s.pickerChipText, active && s.pickerChipTextActive]}>{LANG_LABELS[l]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
          </View>
        )}
        {activeTab === "variables" && (
          <View style={{ padding: 20 }}>
            <VariableEditor variables={form.variables} onChange={(v) => setForm({ ...form, variables: v })} />
          </View>
        )}
        {activeTab === "sections" && (
          <View style={{ padding: 20 }}>
            <SectionEditor sections={form.sections} onChange={(v) => setForm({ ...form, sections: v })} />
          </View>
        )}
        {activeTab === "layout" && (
          <LayoutTab config={form.layoutConfig} onChange={(v) => setForm({ ...form, layoutConfig: v })} />
        )}
        {activeTab === "versions" && !isNew && params.id && (
          <VersionsTab templateId={params.id} />
        )}
        {activeTab === "permissions" && !isNew && params.id && (
          <PermissionsTab templateId={params.id} />
        )}
        {(activeTab === "versions" || activeTab === "permissions") && isNew && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Feather name="info" size={32} color="#334155" />
            <Text style={{ color: "#64748b", marginTop: 12 }}>Sauvegardez d'abord le template</Text>
          </View>
        )}
        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* Change description modal (on update) */}
      <Modal visible={showChangeModal} transparent animationType="fade" onRequestClose={() => setShowChangeModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: 300 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Description de la modification</Text>
            <Text style={{ color: "#64748b", marginBottom: 12, fontSize: 13 }}>Cette note sera enregistrée dans l'historique des versions.</Text>
            <TextInput
              style={[s.input, { marginBottom: 20 }]}
              value={changeDesc}
              onChangeText={setChangeDesc}
              placeholder="ex: Ajout de la variable president_name"
              placeholderTextColor="#475569"
            />
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowChangeModal(false)}>
                <Text style={s.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={() => { setShowChangeModal(false); doSave(changeDesc); }}>
                <Text style={s.modalSaveText}>Sauvegarder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function TemplateEditor() {
  return (
    <RoleGuard allow={["super_admin"]}>
      <TemplateEditorContent />
    </RoleGuard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: "#0f172a" },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
                      borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 12 },
  backBtn:          { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" },
  headerTitle:      { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  headerSub:        { fontSize: 11, color: "#475569", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  saveBtn2:         { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563EB",
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  saveBtnText2:     { color: "#fff", fontWeight: "700", fontSize: 13 },

  tabsScroll:       { borderBottomWidth: 1, borderBottomColor: "#1e293b", maxHeight: 50 },
  tabsContent:      { paddingHorizontal: 12, gap: 4, flexDirection: "row", alignItems: "center" },
  tab:              { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12,
                      paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive:        { borderBottomColor: "#2563EB" },
  tabText:          { fontSize: 12, color: "#64748b", fontWeight: "500" },
  tabTextActive:    { color: "#a78bfa", fontWeight: "700" },

  sectionHeader:    { marginBottom: 16, marginTop: 8 },
  sectionTitle:     { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  sectionSub:       { fontSize: 12, color: "#64748b", marginTop: 3 },
  sectionSub2:      { fontSize: 11, color: "#475569", fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },

  field:            { marginBottom: 16 },
  fieldLabel:       { fontSize: 12, color: "#94a3b8", fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldSub:         { fontSize: 11, color: "#475569", marginTop: 2 },
  input:            { backgroundColor: "#1e293b", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                      color: "#f1f5f9", fontSize: 14, borderWidth: 1, borderColor: "#334155" },
  inputMulti:       { minHeight: 90, paddingTop: 12 },

  i18nWrap:         { marginBottom: 16 },
  i18nTabs:         { flexDirection: "row", gap: 4, marginBottom: 8 },
  i18nTab:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  i18nTabActive:    { backgroundColor: "#2563EB22", borderColor: "#2563EB" },
  i18nTabText:      { fontSize: 11, color: "#64748b", fontWeight: "600" },
  i18nTabTextActive:{ color: "#a78bfa" },

  pickerWrap:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  pickerChip:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7,
                      borderRadius: 8, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  pickerChipActive: { backgroundColor: "#2563EB22", borderColor: "#2563EB" },
  pickerChipText:   { fontSize: 12, color: "#64748b", fontWeight: "500" },
  pickerChipTextActive: { color: "#a78bfa", fontWeight: "700" },

  switchRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1e293b", marginBottom: 4 },

  // Variables
  presetChip:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10,
                      paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: "#1e293b" },
  presetChipText:   { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  varCard:          { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1e293b",
                      borderRadius: 12, padding: 12, marginBottom: 8, gap: 10,
                      borderWidth: 1, borderColor: "#334155" },
  varSourceDot:     { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  varName:          { fontSize: 12, color: "#a78bfa", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 2 },
  varLabel:         { fontSize: 13, color: "#e2e8f0", fontWeight: "500" },
  varTag:           { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#33415522" },
  varTagText:       { fontSize: 10, color: "#64748b", fontWeight: "600" },
  varAction:        { width: 28, height: 28, borderRadius: 8, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },

  addBtn:           { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14,
                      borderWidth: 1.5, borderColor: "#2563EB44", borderStyle: "dashed",
                      borderRadius: 12, justifyContent: "center", marginTop: 8 },
  addBtnText:       { color: "#a78bfa", fontWeight: "600", fontSize: 14 },

  // Sections
  secCard:          { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1e293b",
                      borderRadius: 12, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: "#334155" },
  secOrderBtns:     { alignItems: "center", gap: 4 },
  secOrderBtn:      { width: 24, height: 24, borderRadius: 6, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  secOrder:         { fontSize: 11, color: "#64748b", fontWeight: "700", minWidth: 16, textAlign: "center" },
  secTitle:         { fontSize: 13, color: "#e2e8f0", fontWeight: "700" },
  secContent:       { fontSize: 12, color: "#64748b", lineHeight: 18 },
  secContentEmpty:  { fontSize: 11, color: "#334155", fontStyle: "italic" },

  // Versions
  verCard:          { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14,
                      borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  verDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: "#334155", marginTop: 4 },
  verVersion:       { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  verCurrentBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#2563EB22" },
  verCurrentText:   { fontSize: 10, color: "#a78bfa", fontWeight: "700" },
  verDesc:          { fontSize: 13, color: "#e2e8f0", marginTop: 2 },
  verMeta:          { fontSize: 11, color: "#64748b", marginTop: 4 },
  verRestoreBtn:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10,
                      paddingVertical: 6, borderRadius: 8, backgroundColor: "#2563EB22",
                      borderWidth: 1, borderColor: "#2563EB44" },
  verRestoreText:   { fontSize: 11, color: "#a78bfa", fontWeight: "600" },

  // Permissions
  permHeader:       { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#334155", marginBottom: 4 },
  permRow:          { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  permLabel:        { fontSize: 13, color: "#94a3b8", fontWeight: "500" },
  permCol:          { width: 68, textAlign: "center", fontSize: 11, color: "#64748b", fontWeight: "600" },
  permColView:      { width: 68, alignItems: "center" },

  // Save button
  saveBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  saveBtnText:      { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Color swatches
  colorSwatch:      { width: 34, height: 34, borderRadius: 10 },
  colorSwatchActive:{ borderWidth: 2.5, borderColor: "#fff" },

  // Modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet:       { backgroundColor: "#1e293b", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                      maxHeight: "92%", paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12,
                      borderWidth: 1, borderBottomWidth: 0, borderColor: "#334155" },
  modalHandle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155", alignSelf: "center", marginBottom: 20 },
  modalTitle:       { fontSize: 17, fontWeight: "700", color: "#f1f5f9", marginBottom: 20 },
  modalFooter:      { flexDirection: "row", gap: 10, paddingTop: 12 },
  modalCancel:      { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center",
                      backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155" },
  modalCancelText:  { color: "#94a3b8", fontWeight: "600" },
  modalSave:        { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#2563EB" },
  modalSaveText:    { color: "#fff", fontWeight: "700" },
});
