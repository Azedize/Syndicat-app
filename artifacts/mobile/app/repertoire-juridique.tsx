import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

type ThemeType = "licenciement" | "conges" | "salaire" | "syndicale" | "discrimination" | "contrat" | "sante" | "retraite";

interface FicheJuridique {
  id: string;
  theme: ThemeType;
  titre: string;
  resume: string;
  contenu: string;
  articles: string[];
  jurisprudence?: string[];
  conseils: string[];
  updated: string;
  important?: boolean;
}

const THEME_CONFIG: Record<ThemeType, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  licenciement: { label: "Licenciement", icon: "user-x", color: "#ef4444" },
  conges: { label: "Congés & RTT", icon: "sun", color: "#f59e0b" },
  salaire: { label: "Salaire", icon: "dollar-sign", color: "#10b981" },
  syndicale: { label: "Liberté syndicale", icon: "shield", color: "#2563EB" },
  discrimination: { label: "Discrimination", icon: "alert-triangle", color: "#ec4899" },
  contrat: { label: "Contrat de travail", icon: "file-text", color: "#3b82f6" },
  sante: { label: "Santé & Sécurité", icon: "activity", color: "#06b6d4" },
  retraite: { label: "Retraite", icon: "clock", color: "#8b5cf6" },
};

function mapApiFiche(row: any): FicheJuridique {
  return {
    id: row.id,
    theme: row.theme,
    titre: row.titre,
    resume: row.resume,
    contenu: row.contenu,
    articles: Array.isArray(row.articles) ? row.articles : [],
    jurisprudence: Array.isArray(row.jurisprudence) && row.jurisprudence.length ? row.jurisprudence : undefined,
    conseils: Array.isArray(row.conseils) ? row.conseils : [],
    updated: row.updated ?? "",
    important: !!row.important,
  };
}

export default function RepertoireJuridiqueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [search, setSearch] = useState("");
  const [filterTheme, setFilterTheme] = useState<ThemeType | "all">("all");
  const [selected, setSelected] = useState<FicheJuridique | null>(null);
  const [fiches, setFiches] = useState<FicheJuridique[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFiches = () => {
    setLoading(true);
    setError(null);
    apiRequest<{ data: any[] }>("/fiches-juridiques")
      .then(({ data }) => setFiches((data ?? []).map(mapApiFiche)))
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur de chargement"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFiches(); }, []);

  const displayed = fiches.filter((f) => {
    if (filterTheme !== "all" && f.theme !== filterTheme) return false;
    if (search && !f.titre.toLowerCase().includes(search.toLowerCase()) && !f.resume.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Répertoire Juridique</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher une fiche juridique..."
            placeholderTextColor={colors.mutedForeground}
          />
          {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
        </View>
      </View>

      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: colors.primary + "10", borderBottomColor: colors.primary + "20" }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={[styles.infoBannerText, { color: colors.primary }]}>
          Fiches rédigées par nos juristes partenaires. Mis à jour selon les dernières évolutions législatives.
        </Text>
      </View>

      {/* Theme filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity style={[styles.chip, { backgroundColor: filterTheme === "all" ? colors.primary : colors.card, borderColor: filterTheme === "all" ? colors.primary : colors.border }]} onPress={() => setFilterTheme("all")}>
          <Text style={[styles.chipText, { color: filterTheme === "all" ? "#fff" : colors.foreground }]}>Tous</Text>
        </TouchableOpacity>
        {(Object.entries(THEME_CONFIG) as [ThemeType, typeof THEME_CONFIG[ThemeType]][]).map(([key, cfg]) => {
          const active = filterTheme === key;
          return (
            <TouchableOpacity key={key} style={[styles.chip, { backgroundColor: active ? cfg.color : colors.card, borderColor: active ? cfg.color : colors.border }]} onPress={() => setFilterTheme(key)}>
              <Feather name={cfg.icon} size={11} color={active ? "#fff" : cfg.color} />
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}>
        {displayed.map((fiche) => {
          const tc = THEME_CONFIG[fiche.theme];
          return (
            <TouchableOpacity
              key={fiche.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: fiche.important ? tc.color : colors.border }]}
              onPress={() => { setSelected(fiche); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.75}
            >
              {fiche.important ? (
                <View style={[styles.importantBanner, { backgroundColor: tc.color }]}>
                  <Feather name="star" size={11} color="#fff" />
                  <Text style={styles.importantText}>Fiche importante</Text>
                </View>
              ) : null}
              <View style={styles.cardTop}>
                <View style={[styles.ficheIcon, { backgroundColor: tc.color + "18" }]}>
                  <Feather name={tc.icon} size={20} color={tc.color} />
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={[styles.themeBadge, { backgroundColor: tc.color + "15" }]}>
                    <Text style={[styles.themeBadgeText, { color: tc.color }]}>{tc.label}</Text>
                  </View>
                  <Text style={[styles.ficheTitre, { color: colors.foreground }]}>{fiche.titre}</Text>
                </View>
              </View>
              <Text style={[styles.ficheResume, { color: colors.mutedForeground }]} numberOfLines={2}>{fiche.resume}</Text>
              <View style={styles.cardFooter}>
                <View style={styles.articlesRow}>
                  <Feather name="book" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.articlesText, { color: colors.mutedForeground }]}>{fiche.articles.length} référence{fiche.articles.length > 1 ? "s" : ""}</Text>
                </View>
                {fiche.jurisprudence ? (
                  <View style={styles.articlesRow}>
                    <Feather name="archive" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.articlesText, { color: colors.mutedForeground }]}>{fiche.jurisprudence.length} arrêt{fiche.jurisprudence.length > 1 ? "s" : ""}</Text>
                  </View>
                ) : null}
                <Text style={[styles.updatedText, { color: colors.mutedForeground }]}>MàJ {fiche.updated}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Fiche Juridique</Text>
              <View style={{ width: 24 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {(() => {
                const tc = THEME_CONFIG[selected.theme];
                return (
                  <>
                    <View style={[styles.themeHeaderBox, { backgroundColor: tc.color + "10", borderColor: tc.color + "30" }]}>
                      <Feather name={tc.icon} size={18} color={tc.color} />
                      <Text style={[styles.themeHeaderText, { color: tc.color }]}>{tc.label}</Text>
                      <Text style={[styles.updatedBadge, { color: tc.color }]}>MàJ {selected.updated}</Text>
                    </View>
                    <Text style={[styles.detailTitre, { color: colors.foreground }]}>{selected.titre}</Text>
                    <View style={[styles.resumeBox, { backgroundColor: tc.color + "10", borderColor: tc.color + "30", borderLeftColor: tc.color, borderLeftWidth: 4 }]}>
                      <Text style={[styles.resumeText, { color: colors.foreground }]}>{selected.resume}</Text>
                    </View>
                    <View style={[styles.contenuBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.contenuLabel, { color: colors.mutedForeground }]}>DÉTAIL</Text>
                      <Text style={[styles.contenuText, { color: colors.foreground }]}>{selected.contenu}</Text>
                    </View>
                    <View style={[styles.refsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.refsHeader}>
                        <Feather name="book" size={15} color={tc.color} />
                        <Text style={[styles.refsTitle, { color: colors.foreground }]}>Références légales</Text>
                      </View>
                      {selected.articles.map((art, i) => (
                        <View key={i} style={[styles.refItem, { backgroundColor: tc.color + "10" }]}>
                          <Feather name="chevron-right" size={12} color={tc.color} />
                          <Text style={[styles.refText, { color: tc.color }]}>{art}</Text>
                        </View>
                      ))}
                    </View>
                    {selected.jurisprudence && selected.jurisprudence.length > 0 ? (
                      <View style={[styles.refsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.refsHeader}>
                          <Feather name="archive" size={15} color="#6366f1" />
                          <Text style={[styles.refsTitle, { color: colors.foreground }]}>Jurisprudence</Text>
                        </View>
                        {selected.jurisprudence.map((j, i) => (
                          <View key={i} style={[styles.refItem, { backgroundColor: "#6366f110" }]}>
                            <Feather name="chevron-right" size={12} color="#6366f1" />
                            <Text style={[styles.refText, { color: "#6366f1" }]}>{j}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={[styles.conseilsCard, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
                      <View style={styles.refsHeader}>
                        <Feather name="alert-circle" size={15} color="#10b981" />
                        <Text style={[styles.refsTitle, { color: colors.foreground }]}>Conseils pratiques</Text>
                      </View>
                      {selected.conseils.map((c, i) => (
                        <View key={i} style={styles.conseilItem}>
                          <View style={[styles.conseilDot, { backgroundColor: "#10b981" }]} />
                          <Text style={[styles.conseilText, { color: colors.foreground }]}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  infoBanner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  infoBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", gap: 0 },
  importantBanner: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 5 },
  importantText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  cardTop: { flexDirection: "row", gap: 12, padding: 14, paddingBottom: 8 },
  ficheIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  themeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" as const },
  themeBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  ficheTitre: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 19 },
  ficheResume: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, paddingHorizontal: 14, paddingBottom: 8 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 12 },
  articlesRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  articlesText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  updatedText: { marginLeft: "auto", fontSize: 10, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: Platform.OS === "web" ? 20 : 56, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  themeHeaderBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  themeHeaderText: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold" },
  updatedBadge: { fontSize: 11, fontFamily: "Inter_400Regular" },
  detailTitre: { fontSize: 19, fontFamily: "Inter_700Bold", lineHeight: 27 },
  resumeBox: { borderRadius: 12, borderWidth: 1, padding: 14 },
  resumeText: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 22, fontStyle: "italic" },
  contenuBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  contenuLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  contenuText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
  refsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  refsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  refsTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  refItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  refText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  conseilsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  conseilItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  conseilDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 7 },
  conseilText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
