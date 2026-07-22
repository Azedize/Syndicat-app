/**
 * DocumentBundleModal — One-click document bundle generator for admins.
 *
 * Three bundle types:
 *   recovery → 5-step debt recovery chain (relance amiable → dossier juridique)
 *   sale     → 4 notary documents for apartment sale
 *   ag       → Convocation + PV + Décisions for Assemblée Générale
 *
 * Each bundle auto-fills all DB data — no manual entry required.
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type BundleType = "recovery" | "sale" | "ag";

interface Props {
  visible: boolean;
  bundleType: BundleType;
  onClose: () => void;
  onComplete: (docs: Array<{ title: string; documentNumber: string }>) => void;
}

// ─── Bundle config ────────────────────────────────────────────────────────────

const BUNDLE_CONFIG: Record<BundleType, {
  title: string; subtitle: string; icon: keyof typeof Feather.glyphMap; color: string;
  steps: string[]; hint: string;
}> = {
  recovery: {
    title: "Dossier de recouvrement",
    subtitle: "Génère automatiquement 5 documents d'escalade",
    icon: "alert-triangle",
    color: "#dc2626",
    steps: ["Relance amiable", "Relance officielle", "Mise en demeure", "Rapport de dette", "Dossier juridique"],
    hint: "Sélectionnez le membre débiteur. L'historique des impayés est calculé automatiquement.",
  },
  sale: {
    title: "Dossier de vente",
    subtitle: "4 documents requis par le notaire",
    icon: "package",
    color: "#7c3aed",
    steps: ["Attestation de propriété", "Attestation de paiement", "Rapport financier", "Décision syndicale"],
    hint: "Sélectionnez le lot concerné. Toutes les données sont injectées automatiquement.",
  },
  ag: {
    title: "Dossier Assemblée Générale",
    subtitle: "Documents AG générés en une seule opération",
    icon: "users",
    color: "#3b82f6",
    steps: ["Convocation officielle", "Procès-verbal de réunion", "Décisions de l'AG"],
    hint: "Renseignez la date et le lieu. Le bureau syndical est injecté automatiquement.",
  },
};

// ─── Entity picker item ───────────────────────────────────────────────────────

interface EntityItem { id: string; label: string; sublabel: string }

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentBundleModal({ visible, bundleType, onClose, onComplete }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const cfg = BUNDLE_CONFIG[bundleType];

  // Entity selection (member for recovery, lot for sale)
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);
  const [entitySearch, setEntitySearch] = useState("");

  // AG fields
  const [meetingDate, setMeetingDate] = useState("");
  const [lieu, setLieu] = useState("");
  const [heure, setHeure] = useState("");
  const [agendaText, setAgendaText] = useState("");

  // Generation state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Array<{ title: string; documentNumber: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setSelectedEntity(null);
      setEntitySearch("");
      setMeetingDate("");
      setLieu("");
      setHeure("");
      setAgendaText("");
      setStep(1);
      setGenerating(false);
      setResult(null);
      setError(null);
      if (bundleType !== "ag") loadEntities();
    }
  }, [visible, bundleType]);

  const loadEntities = async () => {
    setEntitiesLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const type = bundleType === "recovery" ? "members" : "lots";
      const res = await docsApi.entities(type);
      setEntities((res.data as EntityItem[]) ?? []);
    } catch {
      setEntities([]);
    } finally {
      setEntitiesLoading(false);
    }
  };

  const filteredEntities = entities.filter((e) =>
    !entitySearch || e.label.toLowerCase().includes(entitySearch.toLowerCase()) || e.sublabel.toLowerCase().includes(entitySearch.toLowerCase())
  );

  const canGenerate = bundleType === "ag"
    ? (meetingDate.trim().length > 0)
    : (selectedEntity !== null);

  const handleGenerate = async () => {
    if (!canGenerate || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      let docs: Array<{ title: string; documentNumber: string }> = [];

      if (bundleType === "recovery") {
        const res = await docsApi.recoveryPackage({ memberId: selectedEntity!.id });
        docs = res.data.documents.map((d) => ({ title: d.title, documentNumber: d.documentNumber }));
      } else if (bundleType === "sale") {
        const res = await docsApi.saleBundle({ lotId: selectedEntity!.id });
        docs = res.data.documents.map((d) => ({ title: d.title, documentNumber: d.documentNumber }));
      } else {
        const res = await docsApi.agBundle({
          meetingDate: meetingDate.trim() || undefined,
          lieu: lieu.trim() || undefined,
          heure: heure.trim() || undefined,
          agendaText: agendaText.trim() || undefined,
        });
        docs = res.data.documents.map((d) => ({ title: d.title, documentNumber: d.documentNumber }));
      }

      setResult(docs);
      setStep(3);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message ?? "Impossible de générer le dossier. Vérifiez la connexion et réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  const s = styles(colors);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { paddingTop: topPad }]}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{cfg.title}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Hero band ── */}
        <View style={[s.heroBand, { backgroundColor: cfg.color }]}>
          <Feather name={cfg.icon} size={28} color="#fff" />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.heroTitle}>{cfg.title}</Text>
            <Text style={s.heroSub}>{cfg.subtitle}</Text>
          </View>
        </View>

        {/* ── Steps preview ── */}
        <View style={[s.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {cfg.steps.map((stepLabel, i) => (
            <View key={i} style={[s.stepRow, i < cfg.steps.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <View style={[s.stepBadge, { backgroundColor: cfg.color + "18" }]}>
                <Text style={[s.stepBadgeText, { color: cfg.color }]}>{i + 1}</Text>
              </View>
              <Text style={[s.stepRowLabel, { color: colors.foreground }]}>{stepLabel}</Text>
              <Feather name="check" size={13} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
            </View>
          ))}
        </View>

        {/* ── Hint banner ── */}
        <View style={[s.hintBanner, { backgroundColor: cfg.color + "10", borderColor: cfg.color + "30" }]}>
          <Feather name="zap" size={13} color={cfg.color} />
          <Text style={[s.hintText, { color: cfg.color }]}>{cfg.hint}</Text>
        </View>

        {step !== 3 ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>

            {/* ── Entity picker (recovery / sale) ── */}
            {bundleType !== "ag" && (
              <>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>
                  {bundleType === "recovery" ? "Sélectionnez le membre débiteur" : "Sélectionnez le lot concerné"}
                </Text>

                {/* Search */}
                <View style={[s.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={[s.searchInput, { color: colors.foreground }]}
                    placeholder="Rechercher…"
                    placeholderTextColor={colors.mutedForeground}
                    value={entitySearch}
                    onChangeText={setEntitySearch}
                  />
                </View>

                {entitiesLoading ? (
                  <ActivityIndicator color={cfg.color} style={{ marginTop: 12 }} />
                ) : (
                  <View style={[s.entityList, { borderColor: colors.border }]}>
                    {filteredEntities.length === 0 ? (
                      <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Aucun résultat</Text>
                    ) : (
                      filteredEntities.map((e) => (
                        <TouchableOpacity
                          key={e.id}
                          style={[s.entityItem, { borderBottomColor: colors.border },
                            selectedEntity?.id === e.id && { backgroundColor: cfg.color + "10" }]}
                          onPress={() => { setSelectedEntity(e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          activeOpacity={0.75}
                        >
                          <View style={[s.entityRadio, { borderColor: selectedEntity?.id === e.id ? cfg.color : colors.border },
                            selectedEntity?.id === e.id && { backgroundColor: cfg.color }]}>
                            {selectedEntity?.id === e.id && <Feather name="check" size={10} color="#fff" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.entityLabel, { color: colors.foreground }]}>{e.label}</Text>
                            {e.sublabel ? <Text style={[s.entitySub, { color: colors.mutedForeground }]}>{e.sublabel}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── AG fields ── */}
            {bundleType === "ag" && (
              <>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Informations de la réunion</Text>

                <View>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>Date de l'AG <Text style={{ color: "#ef4444" }}>*</Text></Text>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Ex: 2026-07-25 ou 25/07/2026"
                    placeholderTextColor={colors.mutedForeground}
                    value={meetingDate}
                    onChangeText={setMeetingDate}
                  />
                </View>

                <View>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>Lieu <Text style={{ color: colors.mutedForeground }}>(optionnel)</Text></Text>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Ex: Salle de réunion, Résidence Al Amal"
                    placeholderTextColor={colors.mutedForeground}
                    value={lieu}
                    onChangeText={setLieu}
                  />
                </View>

                <View>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>Heure <Text style={{ color: colors.mutedForeground }}>(optionnel)</Text></Text>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Ex: 10:00"
                    placeholderTextColor={colors.mutedForeground}
                    value={heure}
                    onChangeText={setHeure}
                  />
                </View>

                <View>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>Ordre du jour <Text style={{ color: colors.mutedForeground }}>(optionnel)</Text></Text>
                  <TextInput
                    style={[s.input, s.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Points à l'ordre du jour…"
                    placeholderTextColor={colors.mutedForeground}
                    value={agendaText}
                    onChangeText={setAgendaText}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              </>
            )}

            {error ? (
              <View style={[s.hintBanner, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
                <Feather name="alert-circle" size={13} color="#ef4444" />
                <Text style={[s.hintText, { color: "#ef4444" }]}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          /* ── Success screen ── */
          <ScrollView contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 80 }}>
            <View style={{ alignItems: "center", gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#10b98120", alignItems: "center", justifyContent: "center" }}>
                <Feather name="check-circle" size={40} color="#10b981" />
              </View>
              <Text style={[s.successTitle, { color: colors.foreground }]}>Dossier généré !</Text>
              <Text style={[s.successSub, { color: colors.mutedForeground }]}>
                {result?.length ?? 0} documents ont été créés et sont disponibles dans vos documents.
              </Text>
            </View>

            <View style={[s.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {result?.map((doc, i) => (
                <View key={i} style={[s.stepRow, i < result.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={[s.stepBadge, { backgroundColor: "#10b98120" }]}>
                    <Feather name="file-text" size={12} color="#10b981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.stepRowLabel, { color: colors.foreground }]}>{doc.title}</Text>
                    <Text style={[s.entitySub, { color: colors.mutedForeground }]}>{doc.documentNumber}</Text>
                  </View>
                  <Feather name="check" size={14} color="#10b981" />
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: colors.primary }]}
              onPress={() => onComplete(result ?? [])}
              activeOpacity={0.85}
            >
              <Feather name="list" size={16} color="#fff" />
              <Text style={s.submitBtnText}>Voir les documents</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── Bottom action bar ── */}
        {step !== 3 && (
          <View style={[s.bottomBar, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[s.submitBtn, { flex: 1, backgroundColor: (canGenerate && !generating) ? cfg.color : colors.border }]}
              onPress={handleGenerate}
              disabled={!canGenerate || generating}
              activeOpacity={0.85}
            >
              {generating ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={s.submitBtnText}>Génération en cours…</Text>
                </>
              ) : (
                <>
                  <Feather name={cfg.icon} size={16} color="#fff" />
                  <Text style={s.submitBtnText}>Générer le dossier complet</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: colors.background },
    header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle:   { fontSize: 17, fontWeight: "700" },
    closeBtn:      { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.muted },
    heroBand:      { flexDirection: "row", alignItems: "center", padding: 18, margin: 16, borderRadius: 16 },
    heroTitle:     { fontSize: 16, fontWeight: "800", color: "#fff", marginBottom: 2 },
    heroSub:       { fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 17 },
    stepsCard:     { marginHorizontal: 16, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
    stepRow:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
    stepBadge:     { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    stepBadgeText: { fontSize: 12, fontWeight: "800" },
    stepRowLabel:  { fontSize: 13, fontWeight: "600", flex: 1 },
    hintBanner:    { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginHorizontal: 16, marginTop: 10 },
    hintText:      { fontSize: 12, lineHeight: 17, flex: 1, fontWeight: "500" },
    sectionTitle:  { fontSize: 14, fontWeight: "700", marginBottom: 4 },
    searchWrap:    { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    searchInput:   { flex: 1, fontSize: 14, paddingVertical: 0 },
    entityList:    { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
    entityItem:    { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1 },
    entityRadio:   { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    entityLabel:   { fontSize: 14, fontWeight: "600" },
    entitySub:     { fontSize: 11, marginTop: 1 },
    emptyText:     { textAlign: "center", padding: 20, fontSize: 13 },
    fieldLabel:    { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    input:         { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
    textarea:      { minHeight: 90 },
    successTitle:  { fontSize: 20, fontWeight: "800" },
    successSub:    { fontSize: 13, textAlign: "center", lineHeight: 20 },
    bottomBar:     { padding: 16, borderTopWidth: 1 },
    submitBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14 },
    submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  });
}
