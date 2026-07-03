import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type TabType = "vue_ensemble" | "recettes" | "depenses" | "comparatif";

interface LigneBudget {
  id: string;
  categorie: string;
  libelle: string;
  prevu: number;
  realise: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const ANNEE = "2026";

const RECETTES: LigneBudget[] = [
  { id: "r1", categorie: "Cotisations", libelle: "Cotisations membres ordinaires", prevu: 450000, realise: 312000, icon: "users", color: "#3b82f6" },
  { id: "r2", categorie: "Cotisations", libelle: "Cotisations membres associés", prevu: 48000, realise: 36000, icon: "user-plus", color: "#3b82f6" },
  { id: "r3", categorie: "Subventions", libelle: "Subvention patronale formation", prevu: 126000, realise: 126000, icon: "briefcase", color: "#10b981" },
  { id: "r4", categorie: "Subventions", libelle: "Subvention ASC (Œuvres sociales)", prevu: 84000, realise: 84000, icon: "gift", color: "#10b981" },
  { id: "r5", categorie: "Marketplace", libelle: "Commissions marketplace", prevu: 36000, realise: 22400, icon: "shopping-bag", color: "#f59e0b" },
  { id: "r6", categorie: "Divers", libelle: "Dons et legs", prevu: 12000, realise: 5000, icon: "heart", color: "#ec4899" },
  { id: "r7", categorie: "Divers", libelle: "Produits financiers", prevu: 8400, realise: 4100, icon: "trending-up", color: "#6366f1" },
];

const DEPENSES: LigneBudget[] = [
  { id: "d1", categorie: "Salaires", libelle: "Rémunération permanents syndicaux", prevu: 192000, realise: 128000, icon: "users", color: "#7c3aed" },
  { id: "d2", categorie: "Salaires", libelle: "Charges sociales", prevu: 64000, realise: 42000, icon: "percent", color: "#7c3aed" },
  { id: "d3", categorie: "Formation", libelle: "Formation des délégués", prevu: 48000, realise: 29000, icon: "book-open", color: "#8b5cf6" },
  { id: "d4", categorie: "Formation", libelle: "Séminaires et congrès", prevu: 36000, realise: 24000, icon: "award", color: "#8b5cf6" },
  { id: "d5", categorie: "Communication", libelle: "Publications et bulletins", prevu: 24000, realise: 14200, icon: "file-text", color: "#3b82f6" },
  { id: "d6", categorie: "Communication", libelle: "Site web et outils numériques", prevu: 18000, realise: 9000, icon: "globe", color: "#3b82f6" },
  { id: "d7", categorie: "Social", libelle: "Fonds de solidarité membres", prevu: 60000, realise: 38000, icon: "heart", color: "#ec4899" },
  { id: "d8", categorie: "Social", libelle: "Aide scolaire enfants membres", prevu: 36000, realise: 24000, icon: "book", color: "#ec4899" },
  { id: "d9", categorie: "Fonctionnement", libelle: "Loyer siège social", prevu: 60000, realise: 45000, icon: "home", color: "#6b7280" },
  { id: "d10", categorie: "Fonctionnement", libelle: "Frais de déplacement", prevu: 24000, realise: 15800, icon: "map-pin", color: "#6b7280" },
  { id: "d11", categorie: "Fonctionnement", libelle: "Honoraires juridiques", prevu: 30000, realise: 18000, icon: "shield", color: "#6b7280" },
  { id: "d12", categorie: "Juridique", libelle: "Frais de procédure", prevu: 12000, realise: 6400, icon: "alert-circle", color: "#ef4444" },
];

const fmt = (n: number) => new Intl.NumberFormat("fr-MA", { style: "decimal", maximumFractionDigits: 0 }).format(n) + " MAD";
const pct = (realise: number, prevu: number) => Math.min(100, Math.round((realise / prevu) * 100));

export default function BudgetPrevisionnelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("vue_ensemble");
  const [selected, setSelected] = useState<LigneBudget | null>(null);

  const totalRecettesPrevu = RECETTES.reduce((s, r) => s + r.prevu, 0);
  const totalRecettesRealise = RECETTES.reduce((s, r) => s + r.realise, 0);
  const totalDepensesPrevu = DEPENSES.reduce((s, r) => s + r.prevu, 0);
  const totalDepensesRealise = DEPENSES.reduce((s, r) => s + r.realise, 0);
  const soldePrevu = totalRecettesPrevu - totalDepensesPrevu;
  const soldeRealise = totalRecettesRealise - totalDepensesRealise;

  const categories = (list: LigneBudget[]) => [...new Set(list.map((l) => l.categorie))];

  const BarChart = ({ prevu, realise, color }: { prevu: number; realise: number; color: string }) => {
    const p = pct(realise, prevu);
    return (
      <View style={styles.barWrap}>
        <View style={[styles.barBg, { backgroundColor: colors.border }]}>
          <View style={[styles.barFill, { width: `${p}%` as any, backgroundColor: p >= 90 ? "#10b981" : p >= 60 ? color : "#f59e0b" }]} />
        </View>
        <Text style={[styles.barPct, { color: colors.mutedForeground }]}>{p}%</Text>
      </View>
    );
  };

  const renderLigne = (ligne: LigneBudget) => (
    <TouchableOpacity
      key={ligne.id}
      style={[styles.ligneCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => { setSelected(ligne); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      activeOpacity={0.75}
    >
      <View style={[styles.ligneIcon, { backgroundColor: ligne.color + "18" }]}>
        <Feather name={ligne.icon} size={16} color={ligne.color} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[styles.ligneLibelle, { color: colors.foreground }]}>{ligne.libelle}</Text>
        <View style={styles.ligneAmounts}>
          <Text style={[styles.ligneRealise, { color: colors.foreground }]}>{fmt(ligne.realise)}</Text>
          <Text style={[styles.ligneSep, { color: colors.mutedForeground }]}>/</Text>
          <Text style={[styles.lignePrevu, { color: colors.mutedForeground }]}>{fmt(ligne.prevu)}</Text>
        </View>
        <BarChart prevu={ligne.prevu} realise={ligne.realise} color={ligne.color} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Budget Prévisionnel</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Exercice {ANNEE} — Exécution au 31/05/2026</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Export budget", "Export PDF ou Excel disponible pour le trésorier."); }}
        >
          <Feather name="download" size={15} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* KPI strip */}
      <View style={[styles.kpiStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Recettes réalisées</Text>
          <Text style={[styles.kpiVal, { color: "#10b981" }]}>{fmt(totalRecettesRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>/ {fmt(totalRecettesPrevu)}</Text>
        </View>
        <View style={[styles.kpiDiv, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Dépenses réalisées</Text>
          <Text style={[styles.kpiVal, { color: "#ef4444" }]}>{fmt(totalDepensesRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>/ {fmt(totalDepensesPrevu)}</Text>
        </View>
        <View style={[styles.kpiDiv, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Solde actuel</Text>
          <Text style={[styles.kpiVal, { color: soldeRealise >= 0 ? "#10b981" : "#ef4444" }]}>{fmt(soldeRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>prévu {fmt(soldePrevu)}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow} style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {([
          { key: "vue_ensemble" as const, label: "Vue ensemble", icon: "pie-chart" as const },
          { key: "recettes" as const, label: "Recettes", icon: "trending-up" as const },
          { key: "depenses" as const, label: "Dépenses", icon: "trending-down" as const },
          { key: "comparatif" as const, label: "Comparatif", icon: "bar-chart-2" as const },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
              onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
            >
              <Feather name={t.icon} size={14} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>

        {tab === "vue_ensemble" && (
          <>
            {/* Execution global */}
            <View style={[styles.execCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.execTitle, { color: colors.foreground }]}>Taux d'exécution global</Text>
              <View style={styles.execBars}>
                <View style={styles.execBarRow}>
                  <View style={[styles.execLabel2, {}]}>
                    <View style={[styles.dot, { backgroundColor: "#10b981" }]} />
                    <Text style={[styles.execText, { color: colors.foreground }]}>Recettes</Text>
                  </View>
                  <View style={[styles.execBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.execBarFill, { width: `${pct(totalRecettesRealise, totalRecettesPrevu)}%` as any, backgroundColor: "#10b981" }]} />
                  </View>
                  <Text style={[styles.execPct, { color: "#10b981" }]}>{pct(totalRecettesRealise, totalRecettesPrevu)}%</Text>
                </View>
                <View style={styles.execBarRow}>
                  <View style={styles.execLabel2}>
                    <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
                    <Text style={[styles.execText, { color: colors.foreground }]}>Dépenses</Text>
                  </View>
                  <View style={[styles.execBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.execBarFill, { width: `${pct(totalDepensesRealise, totalDepensesPrevu)}%` as any, backgroundColor: "#ef4444" }]} />
                  </View>
                  <Text style={[styles.execPct, { color: "#ef4444" }]}>{pct(totalDepensesRealise, totalDepensesPrevu)}%</Text>
                </View>
              </View>
              <Text style={[styles.execNote, { color: colors.mutedForeground }]}>Exécution sur 5 mois (janv–mai {ANNEE})</Text>
            </View>

            {/* Category summary */}
            {[
              { titre: "Principales recettes", items: RECETTES.slice(0, 3), color: "#10b981" },
              { titre: "Principales dépenses", items: DEPENSES.slice(0, 4), color: "#ef4444" },
            ].map((section) => (
              <View key={section.titre} style={[styles.summarySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.summarySectionTitle, { color: colors.foreground }]}>{section.titre}</Text>
                {section.items.map((ligne) => (
                  <View key={ligne.id} style={styles.summaryRow}>
                    <View style={[styles.summaryDot, { backgroundColor: ligne.color }]} />
                    <Text style={[styles.summaryLibelle, { color: colors.foreground }]} numberOfLines={1}>{ligne.libelle}</Text>
                    <Text style={[styles.summaryVal, { color: section.color }]}>{fmt(ligne.realise)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {tab === "recettes" && (
          <>
            <View style={[styles.totalBanner, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
              <Feather name="trending-up" size={16} color="#10b981" />
              <Text style={[styles.totalBannerText, { color: "#10b981" }]}>Total encaissé : {fmt(totalRecettesRealise)} / {fmt(totalRecettesPrevu)} ({pct(totalRecettesRealise, totalRecettesPrevu)}%)</Text>
            </View>
            {categories(RECETTES).map((cat) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={[styles.catTitle, { color: colors.mutedForeground }]}>{cat.toUpperCase()}</Text>
                {RECETTES.filter((r) => r.categorie === cat).map(renderLigne)}
              </View>
            ))}
          </>
        )}

        {tab === "depenses" && (
          <>
            <View style={[styles.totalBanner, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
              <Feather name="trending-down" size={16} color="#ef4444" />
              <Text style={[styles.totalBannerText, { color: "#ef4444" }]}>Total décaissé : {fmt(totalDepensesRealise)} / {fmt(totalDepensesPrevu)} ({pct(totalDepensesRealise, totalDepensesPrevu)}%)</Text>
            </View>
            {categories(DEPENSES).map((cat) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={[styles.catTitle, { color: colors.mutedForeground }]}>{cat.toUpperCase()}</Text>
                {DEPENSES.filter((d) => d.categorie === cat).map(renderLigne)}
              </View>
            ))}
          </>
        )}

        {tab === "comparatif" && (
          <>
            {[
              { label: "Recettes", prevu: totalRecettesPrevu, realise: totalRecettesRealise, color: "#10b981" },
              { label: "Dépenses", prevu: totalDepensesPrevu, realise: totalDepensesRealise, color: "#ef4444" },
              { label: "Solde", prevu: soldePrevu, realise: soldeRealise, color: soldeRealise >= 0 ? "#10b981" : "#ef4444" },
            ].map((row) => (
              <View key={row.label} style={[styles.comparatifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.comparatifLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <View style={styles.comparatifBars}>
                  <View style={styles.comparatifBarRow}>
                    <Text style={[styles.comparatifBarLabel, { color: colors.mutedForeground }]}>Prévu</Text>
                    <View style={[styles.comparatifBarBg, { backgroundColor: colors.border }]}>
                      <View style={[styles.comparatifBarFill, { width: "100%", backgroundColor: colors.border }]} />
                    </View>
                    <Text style={[styles.comparatifBarVal, { color: colors.foreground }]}>{fmt(row.prevu)}</Text>
                  </View>
                  <View style={styles.comparatifBarRow}>
                    <Text style={[styles.comparatifBarLabel, { color: colors.mutedForeground }]}>Réalisé</Text>
                    <View style={[styles.comparatifBarBg, { backgroundColor: colors.border }]}>
                      <View style={[styles.comparatifBarFill, { width: `${Math.min(100, Math.abs(pct(row.realise, row.prevu)))}%` as any, backgroundColor: row.color }]} />
                    </View>
                    <Text style={[styles.comparatifBarVal, { color: row.color }]}>{fmt(row.realise)}</Text>
                  </View>
                </View>
                <Text style={[styles.comparatifEcart, { color: row.realise >= row.prevu ? "#10b981" : "#f59e0b" }]}>
                  Écart : {fmt(Math.abs(row.realise - row.prevu))} ({row.realise < row.prevu ? "-" : "+"}{Math.abs(pct(row.realise, row.prevu) - 100)}%)
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Ligne detail modal */}
      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalSheetHeader}>
              <View style={[styles.modalIcon, { backgroundColor: (selected?.color ?? "#000") + "18" }]}>
                <Feather name={selected?.icon ?? "file-text"} size={20} color={selected?.color ?? "#000"} />
              </View>
              <Text style={[styles.modalSheetTitle, { color: colors.foreground }]}>{selected?.libelle}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalSep, { backgroundColor: colors.border }]} />
            {[
              { label: "Catégorie", value: selected?.categorie },
              { label: "Montant prévu", value: fmt(selected?.prevu ?? 0) },
              { label: "Réalisé à ce jour", value: fmt(selected?.realise ?? 0) },
              { label: "Taux d'exécution", value: `${pct(selected?.realise ?? 0, selected?.prevu ?? 1)}%` },
              { label: "Solde restant", value: fmt(Math.max(0, (selected?.prevu ?? 0) - (selected?.realise ?? 0))) },
            ].map((row, i) => (
              <View key={i} style={styles.modalRow}>
                <Text style={[styles.modalRowLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <Text style={[styles.modalRowVal, { color: colors.foreground }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  exportBtn: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  kpiStrip: { flexDirection: "row", borderBottomWidth: 1 },
  kpiItem: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 2 },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  kpiVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  kpiSub: { fontSize: 9, fontFamily: "Inter_400Regular" },
  kpiDiv: { width: 1, marginVertical: 8 },
  tabsRow: { paddingHorizontal: 8, gap: 0 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  execCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  execTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  execBars: { gap: 12 },
  execBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  execLabel2: { flexDirection: "row", alignItems: "center", gap: 6, width: 80 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  execText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  execBar: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  execBarFill: { height: 10, borderRadius: 5 },
  execPct: { fontSize: 12, fontFamily: "Inter_700Bold", width: 40, textAlign: "right" },
  execNote: { fontSize: 11, fontFamily: "Inter_400Regular" },
  summarySection: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  summarySectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 2 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryLibelle: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 12, fontFamily: "Inter_700Bold" },
  totalBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  totalBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  catTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginLeft: 2 },
  ligneCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  ligneIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 2 },
  ligneLibelle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  ligneAmounts: { flexDirection: "row", alignItems: "center", gap: 4 },
  ligneRealise: { fontSize: 13, fontFamily: "Inter_700Bold" },
  ligneSep: { fontSize: 12 },
  lignePrevu: { fontSize: 12, fontFamily: "Inter_400Regular" },
  barWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  barBg: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  barPct: { fontSize: 10, fontFamily: "Inter_600SemiBold", width: 32, textAlign: "right" },
  comparatifCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  comparatifLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  comparatifBars: { gap: 8 },
  comparatifBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  comparatifBarLabel: { fontSize: 11, fontFamily: "Inter_400Regular", width: 52 },
  comparatifBarBg: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  comparatifBarFill: { height: 10, borderRadius: 5 },
  comparatifBarVal: { fontSize: 11, fontFamily: "Inter_700Bold", width: 100, textAlign: "right" },
  comparatifEcart: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalSheet: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  modalSheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalSheetTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalSep: { height: 1 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalRowVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
