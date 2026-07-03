import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import {
  Alert,
  FlatList,
  Linking,
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
import { useActivity } from "@/context/ActivityContext";
import { useAuth } from "@/context/AuthContext";
import { useData, type Document } from "@/context/DataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterChips from "@/components/FilterChips";

const CATS = [
  { key: "all", label: "Tous" },
  { key: "statuts", label: "Statuts" },
  { key: "reglements", label: "Règlements" },
  { key: "pv", label: "PV" },
  { key: "juridique", label: "Juridique" },
  { key: "finances", label: "Finances" },
  { key: "attestation", label: "Attestations" },
];

const CAT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  statuts: "book-open",
  reglements: "book",
  pv: "clipboard",
  juridique: "shield",
  finances: "dollar-sign",
  attestation: "award",
};

const CAT_COLORS: Record<string, string> = {
  statuts: "#7c3aed",
  reglements: "#3b82f6",
  pv: "#10b981",
  juridique: "#ef4444",
  finances: "#f59e0b",
  attestation: "#8b5cf6",
};

const DOC_TEMPLATES = [
  { id: "t1", name: "Attestation d'adhésion", icon: "award" as const, color: "#8b5cf6", desc: "Certifie l'appartenance d'un membre au syndicat" },
  { id: "t2", name: "Mise en demeure", icon: "alert-circle" as const, color: "#ef4444", desc: "Document de mise en demeure officielle" },
  { id: "t3", name: "Convocation réunion", icon: "calendar" as const, color: "#3b82f6", desc: "Convocation officielle pour une réunion" },
  { id: "t4", name: "PV de réunion", icon: "clipboard" as const, color: "#10b981", desc: "Procès-verbal de réunion du bureau" },
  { id: "t5", name: "Circulaire interne", icon: "mail" as const, color: "#f59e0b", desc: "Communication officielle aux membres" },
  { id: "t6", name: "Rapport d'activité", icon: "bar-chart-2" as const, color: "#06b6d4", desc: "Rapport mensuel ou annuel d'activité" },
];

export default function DocumentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { documents } = useData();
  const { logActivity } = useActivity();
  const { toggleFavorite, isFavorite } = useFavorites();
  const FAV_ID = "screen-documents";
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Document | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof DOC_TEMPLATES[0] | null>(null);
  const [genMember, setGenMember] = useState("");
  const [genNote, setGenNote] = useState("");
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role !== "member";

  const filtered = documents.filter((d) => {
    const matchCat = category === "all" || d.category === category;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const statusConfig = (status: Document["status"]) => ({
    published: { label: "Publié", color: colors.success },
    draft: { label: "Brouillon", color: colors.mutedForeground },
    pending: { label: "En attente", color: "#f59e0b" },
  }[status]);

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    const content = [genMember && `Destinataire: ${genMember}`, genNote].filter(Boolean).join("\n");
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.generate(selectedTemplate.name, "statuts", content || undefined);
      logActivity({ action: "Document généré", target: selectedTemplate.name, route: "/documents", icon: "file-text", color: "#6366f1" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Succès", `Le document "${selectedTemplate.name}" a été généré et ajouté à votre espace documents.`);
      setShowGenerate(false);
      setSelectedTemplate(null);
      setGenMember("");
      setGenNote("");
    } catch (err: any) {
      // Show explicit failure — do not silently claim success
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Erreur de génération",
        err?.message && !err.message.startsWith("HTTP")
          ? err.message
          : "Impossible de générer le document pour l'instant. Vérifiez la connexion et réessayez.",
      );
    }
  };

  const handleDownload = (doc: Document) => {
    Alert.alert("Téléchargement", `"${doc.title}" sera téléchargé sur votre appareil.`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Documents</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {filtered.length} document(s)
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleFavorite({ id: FAV_ID, title: "Documents", icon: "file-text", color: "#6366f1", route: "/documents" })}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="star" size={20} color={isFavorite(FAV_ID) ? "#f59e0b" : colors.mutedForeground} />
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowGenerate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="file-plus" size={16} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { margin: 12, marginBottom: 0, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Rechercher un document..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      <FilterChips
        options={CATS}
        value={category}
        onChange={setCategory}
        accentColor={colors.primary}
      />

      {/* Stats row */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Publiés", count: documents.filter((d) => d.status === "published").length, color: colors.success },
          { label: "Brouillons", count: documents.filter((d) => d.status === "draft").length, color: colors.mutedForeground },
          { label: "En attente", count: documents.filter((d) => d.status === "pending").length, color: "#f59e0b" },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statCount, { color: s.color }]}>{s.count}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun document trouvé</Text>
          </View>
        }
        renderItem={({ item: d }) => {
          const sc = statusConfig(d.status);
          const catColor = CAT_COLORS[d.category] ?? colors.primary;
          return (
            <TouchableOpacity
              style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: catColor }]}
              onPress={() => setSelected(d)}
              activeOpacity={0.8}
            >
              <View style={[styles.docIcon, { backgroundColor: catColor + "15" }]}>
                <Feather name={CAT_ICONS[d.category] ?? "file-text"} size={20} color={catColor} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.docTitle, { color: colors.foreground }]} numberOfLines={2}>{d.title}</Text>
                <View style={styles.docMeta}>
                  <Text style={[styles.docDate, { color: colors.mutedForeground }]}>{d.date}</Text>
                  <Text style={[styles.docDot, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.docSize, { color: colors.mutedForeground }]}>{d.size}</Text>
                </View>
                <View style={[styles.docStatus, { backgroundColor: sc.color + "15" }]}>
                  <Text style={[styles.docStatusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: colors.primary + "15" }]}
                onPress={() => handleDownload(d)}
              >
                <Feather name="download" size={16} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      {/* Document detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {selected.title}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {/* Preview area */}
              <View style={[styles.previewArea, { backgroundColor: CAT_COLORS[selected.category] + "10", borderColor: CAT_COLORS[selected.category] + "30" }]}>
                <View style={[styles.previewIcon, { backgroundColor: CAT_COLORS[selected.category] + "20" }]}>
                  <Feather name={CAT_ICONS[selected.category] ?? "file-text"} size={40} color={CAT_COLORS[selected.category] ?? colors.primary} />
                </View>
                <Text style={[styles.previewTitle, { color: colors.foreground }]}>{selected.title}</Text>
                <Text style={[styles.previewCat, { color: CAT_COLORS[selected.category] ?? colors.primary }]}>
                  {CATS.find((c) => c.key === selected.category)?.label ?? selected.category}
                </Text>
              </View>

              {/* Meta */}
              <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Date de publication", value: selected.date },
                  { label: "Taille du fichier", value: selected.size },
                  { label: "Catégorie", value: CATS.find((c) => c.key === selected.category)?.label ?? selected.category },
                  { label: "Statut", value: statusConfig(selected.status).label },
                ].map((item, i) => (
                  <View key={item.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                  onPress={() => handleDownload(selected)}
                >
                  <Feather name="download" size={18} color="#fff" />
                  <Text style={styles.primaryActionText}>Télécharger ({selected.size})</Text>
                </TouchableOpacity>
                <View style={styles.secondaryActions}>
                  <TouchableOpacity
                    style={[styles.secBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      shareContent(`${selected.title}\n\nDocument disponible sur SYNDYCAT`, selected.title);
                    }}
                  >
                    <Feather name="share-2" size={16} color={colors.foreground} />
                    <Text style={[styles.secBtnText, { color: colors.foreground }]}>Partager</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      Alert.alert("Aperçu du document", `Ouverture de "${selected.title}".\n\nFonctionnalité bientôt disponible — le visualiseur PDF intégré sera activé dans la prochaine version.`);
                    }}
                  >
                    <Feather name="eye" size={16} color={colors.foreground} />
                    <Text style={[styles.secBtnText, { color: colors.foreground }]}>Aperçu</Text>
                  </TouchableOpacity>
                  {isAdmin ? (
                    <TouchableOpacity
                      style={[styles.secBtn, { borderColor: colors.primary + "50", backgroundColor: colors.primary + "08" }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Alert.alert("Modifier le document", `Ouvrir l'éditeur pour "${selected.title}"?`, [
                          { text: "Annuler", style: "cancel" },
                          { text: "Modifier", onPress: () => Alert.alert("Éditeur", "Fonctionnalité bientôt disponible — l'éditeur de documents sera activé dans la prochaine version.") },
                        ]);
                      }}
                    >
                      <Feather name="edit-2" size={16} color={colors.primary} />
                      <Text style={[styles.secBtnText, { color: colors.primary }]}>Modifier</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Generate document modal */}
      <Modal visible={showGenerate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Générer un document</Text>
            <TouchableOpacity onPress={() => { setShowGenerate(false); setSelectedTemplate(null); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <Text style={[styles.genSectionLabel, { color: colors.mutedForeground }]}>CHOISIR UN MODÈLE</Text>
            <View style={styles.templatesGrid}>
              {DOC_TEMPLATES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.templateCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selectedTemplate?.id === t.id ? t.color : colors.border,
                      borderWidth: selectedTemplate?.id === t.id ? 2 : 1,
                    },
                  ]}
                  onPress={() => setSelectedTemplate(t)}
                >
                  <View style={[styles.templateIcon, { backgroundColor: t.color + "15" }]}>
                    <Feather name={t.icon} size={22} color={t.color} />
                  </View>
                  <Text style={[styles.templateName, { color: colors.foreground }]}>{t.name}</Text>
                  <Text style={[styles.templateDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{t.desc}</Text>
                  {selectedTemplate?.id === t.id ? (
                    <View style={[styles.selectedCheck, { backgroundColor: t.color }]}>
                      <Feather name="check" size={12} color="#fff" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>

            {selectedTemplate ? (
              <View style={{ gap: 14 }}>
                <View style={[styles.genPreviewBanner, { backgroundColor: selectedTemplate.color + "10", borderColor: selectedTemplate.color + "30" }]}>
                  <Feather name={selectedTemplate.icon} size={16} color={selectedTemplate.color} />
                  <Text style={[styles.genPreviewText, { color: selectedTemplate.color }]}>
                    Modèle sélectionné: {selectedTemplate.name}
                  </Text>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nom du membre / Destinataire</Text>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    value={genMember}
                    onChangeText={setGenMember}
                    placeholder="Mohammed Alaoui"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Notes / Objet spécifique</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    value={genNote}
                    onChangeText={setGenNote}
                    placeholder="Détails additionnels pour ce document..."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryAction, { backgroundColor: selectedTemplate.color }]}
                  onPress={handleGenerate}
                >
                  <Feather name="file-plus" size={18} color="#fff" />
                  <Text style={styles.primaryActionText}>Générer le document</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.genHint, { backgroundColor: colors.muted, borderRadius: 14 }]}>
                <Feather name="arrow-up" size={16} color={colors.mutedForeground} />
                <Text style={[styles.genHintText, { color: colors.mutedForeground }]}>
                  Sélectionnez un modèle ci-dessus pour continuer
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  generateBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statCount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  docCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, gap: 12 },
  docIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  docMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  docDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docDot: { fontSize: 10 },
  docSize: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docStatus: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  docStatusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  downloadBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1, gap: 4 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  previewArea: { borderRadius: 20, borderWidth: 1, padding: 30, alignItems: "center", gap: 10 },
  previewIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  previewTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  previewCat: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  metaCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sep: { height: 1, marginHorizontal: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  metaLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  primaryAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  primaryActionText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  secondaryActions: { flexDirection: "row", gap: 10 },
  secBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  genSectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  templatesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  templateCard: { width: "47%", borderRadius: 16, padding: 14, gap: 8, position: "relative" },
  templateIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  templateName: { fontSize: 13, fontFamily: "Inter_700Bold" },
  templateDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  selectedCheck: { position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  genPreviewBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  genPreviewText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea: { minHeight: 80, textAlignVertical: "top" },
  genHint: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  genHintText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
});
