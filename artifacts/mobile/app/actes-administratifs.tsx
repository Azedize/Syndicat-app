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
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type ActeType = "convocation" | "decision" | "pv" | "proces_verbal_ag" | "resolution" | "mandat" | "attestation" | "courrier_officiel";
type ActeStatut = "brouillon" | "valide" | "diffuse" | "archive";

interface ActeAdministratif {
  id: string;
  type: ActeType;
  statut: ActeStatut;
  numero: string;
  titre: string;
  objet: string;
  date: string;
  dateEcheance?: string;
  auteur: string;
  signataires: string[];
  destinataires: string[];
  resumeContenu: string;
  important: boolean;
}

const TYPE_CONFIG: Record<ActeType, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  convocation: { label: "Convocation", icon: "mail", color: "#3b82f6" },
  decision: { label: "Décision", icon: "check-square", color: "#10b981" },
  pv: { label: "Procès-verbal", icon: "file-text", color: "#7c3aed" },
  proces_verbal_ag: { label: "PV d'AG", icon: "users", color: "#f59e0b" },
  resolution: { label: "Résolution", icon: "clipboard", color: "#6366f1" },
  mandat: { label: "Mandat", icon: "shield", color: "#8b5cf6" },
  attestation: { label: "Attestation", icon: "award", color: "#ec4899" },
  courrier_officiel: { label: "Courrier officiel", icon: "send", color: "#f97316" },
};

const STATUT_CONFIG: Record<ActeStatut, { label: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }> = {
  brouillon: { label: "Brouillon", color: "#6b7280", bg: "#6b728018", icon: "edit-3" },
  valide: { label: "Validé", color: "#10b981", bg: "#10b98118", icon: "check-circle" },
  diffuse: { label: "Diffusé", color: "#3b82f6", bg: "#3b82f618", icon: "send" },
  archive: { label: "Archivé", color: "#6b7280", bg: "#6b728015", icon: "archive" },
};

const ACTES: ActeAdministratif[] = [
  {
    id: "ac1", type: "convocation", statut: "diffuse", important: true,
    numero: "CONV-2026-012", date: "2026-06-02", dateEcheance: "2026-06-09",
    titre: "Convocation — Assemblée Générale Extraordinaire du 10 juin 2026",
    objet: "Vote sur le principe de la grève nationale et approbation du préavis déposé",
    auteur: "Fatima Zahra El Alami", signataires: ["Fatima Zahra El Alami", "Mohammed Karim"],
    destinataires: ["Tous les membres du SNE (312 personnes)", "Direction Générale", "Inspection du Travail"],
    resumeContenu: "L'Assemblée Générale extraordinaire est convoquée pour voter sur le principe de la grève nationale du 10 juin 2026, valider le préavis de grève et donner mandat au bureau pour les négociations.",
  },
  {
    id: "ac2", type: "pv", statut: "valide", important: true,
    numero: "PV-2026-011", date: "2026-05-28",
    titre: "PV de réunion du Bureau — Décisions CHSCT et préparation grève",
    objet: "Bureau syndical du 28 mai 2026 — Compte-rendu officiel",
    auteur: "Rachid Bennis", signataires: ["Fatima Zahra El Alami", "Mohammed Karim", "Rachid Bennis"],
    destinataires: ["Membres du bureau", "Archive SNE"],
    resumeContenu: "Le bureau a voté à l'unanimité pour : (1) Valider les résultats du CHSCT extraordinaire, (2) Déposer un préavis de grève nationale, (3) Lancer une campagne de communication vers les médias.",
  },
  {
    id: "ac3", type: "decision", statut: "valide", important: false,
    numero: "DEC-2026-010", date: "2026-05-25",
    titre: "Décision de lancement de la pétition nationale — Révision des grilles salariales",
    objet: "Autorisation et cadre de la pétition syndicale nationale 2026",
    auteur: "Fatima Zahra El Alami", signataires: ["Fatima Zahra El Alami"],
    destinataires: ["Bureau SNE", "Coordinateurs section"],
    resumeContenu: "Le bureau décide de lancer une pétition nationale adressée au Ministère de tutelle pour la révision des grilles salariales. Objectif : 5 000 signatures avant le 30 juin 2026.",
  },
  {
    id: "ac4", type: "proces_verbal_ag", statut: "diffuse", important: true,
    numero: "PV-AG-2026-003", date: "2026-05-20",
    titre: "PV de l'AG extraordinaire — Résultats CHSCT et vote du débrayage",
    objet: "Assemblée Générale extraordinaire du 20 mai 2026",
    auteur: "Nadia El Fassi", signataires: ["Fatima Zahra El Alami", "Mohammed Karim", "Rachid Bennis", "Amina Tazi"],
    destinataires: ["Tous les membres", "Direction Générale", "Inspection du Travail"],
    resumeContenu: "L'AG extraordinaire réunit 247 membres (quorum : 50%+1). Vote du débrayage du 19 mai : approuvé à 89,4%. Compte-rendu du CHSCT partagé. Résolution adoptée : exiger une expertise agréée.",
  },
  {
    id: "ac5", type: "courrier_officiel", statut: "diffuse", important: true,
    numero: "CO-2026-009", date: "2026-05-19",
    titre: "Courrier à la Direction — Demande de réunion CHSCT urgente",
    objet: "Suite accident du 12 mai — Demande réunion extraordinaire CHSCT sous 48h",
    auteur: "Fatima Zahra El Alami", signataires: ["Fatima Zahra El Alami"],
    destinataires: ["Directeur Général", "DRH", "Inspection du Travail (copie)"],
    resumeContenu: "Suite à l'accident du travail grave survenu le 12 mai 2026, le SNE demande formellement la convocation du CHSCT dans les 48 heures et la désignation d'un expert agréé conformément à l'article 18 de la convention collective.",
  },
  {
    id: "ac6", type: "attestation", statut: "valide", important: false,
    numero: "ATT-2026-008", date: "2026-05-15",
    titre: "Attestation de mandat syndical — Fatima Zahra El Alami",
    objet: "Renouvellement attestation Secrétaire Générale SNE",
    auteur: "Bureau SNE", signataires: ["Président du Conseil Syndical"],
    destinataires: ["Fatima Zahra El Alami", "Direction Générale"],
    resumeContenu: "Atteste que Mme Fatima Zahra El Alami est Secrétaire Générale du SNE depuis l'élection du 15/05/2026, pour un mandat de 3 ans. Elle bénéficie à ce titre de 20 heures de délégation mensuelles.",
  },
  {
    id: "ac7", type: "resolution", statut: "archive", important: false,
    numero: "RES-2026-004", date: "2026-03-10",
    titre: "Résolution — Adhésion du SNE à la plateforme syndicale nationale",
    objet: "Vote sur l'adhésion à la Confédération Syndicale Nationale (CSN)",
    auteur: "Rachid Bennis", signataires: ["Fatima Zahra El Alami", "Mohammed Karim", "Rachid Bennis"],
    destinataires: ["Confédération Syndicale Nationale", "Archive SNE"],
    resumeContenu: "Le SNE vote à 73,2% en faveur de l'adhésion à la Confédération Syndicale Nationale (CSN) pour l'exercice 2026-2027. Cotisation annuelle : 1 800 MAD.",
  },
  {
    id: "ac8", type: "brouillon" as ActeType, statut: "brouillon", important: false,
    numero: "DEC-2026-013 (Brouillon)", date: "2026-06-02",
    titre: "[BROUILLON] Décision de boycott de la commission paritaire",
    objet: "Réponse à l'absence de réponse de la direction sur les grilles salariales",
    auteur: "Fatima Zahra El Alami", signataires: [],
    destinataires: [],
    resumeContenu: "En cours de rédaction — À valider lors du prochain bureau du 5 juin 2026.",
  },
];

export default function ActesAdministratifsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role !== "member";

  const [filterStatut, setFilterStatut] = useState<ActeStatut | "all">("all");
  const [filterType, setFilterType] = useState<ActeType | "all">("all");
  const [selected, setSelected] = useState<ActeAdministratif | null>(null);

  const displayed = ACTES
    .filter((a) => filterStatut === "all" || a.statut === filterStatut)
    .filter((a) => filterType === "all" || a.type === filterType);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Actes Administratifs</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{ACTES.length} actes · {ACTES.filter((a) => a.statut === "brouillon").length} brouillon{ACTES.filter((a) => a.statut === "brouillon").length > 1 ? "s" : ""}</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Nouvel acte", "Créer un nouvel acte administratif syndicale."); }}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity style={[styles.chip, { backgroundColor: filterStatut === "all" ? colors.primary : colors.card, borderColor: filterStatut === "all" ? colors.primary : colors.border }]} onPress={() => setFilterStatut("all")}>
          <Text style={[styles.chipText, { color: filterStatut === "all" ? "#fff" : colors.foreground }]}>Tous ({ACTES.length})</Text>
        </TouchableOpacity>
        {(Object.entries(STATUT_CONFIG) as [ActeStatut, typeof STATUT_CONFIG[ActeStatut]][]).map(([key, cfg]) => {
          const count = ACTES.filter((a) => a.statut === key).length;
          const active = filterStatut === key;
          return (
            <TouchableOpacity key={key} style={[styles.chip, { backgroundColor: active ? cfg.color : colors.card, borderColor: active ? cfg.color : colors.border }]} onPress={() => setFilterStatut(key)}>
              <Feather name={cfg.icon} size={11} color={active ? "#fff" : cfg.color} />
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{cfg.label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { paddingTop: 0 }]}>
        <TouchableOpacity style={[styles.chip, { backgroundColor: filterType === "all" ? colors.foreground : colors.card, borderColor: filterType === "all" ? colors.foreground : colors.border }]} onPress={() => setFilterType("all")}>
          <Text style={[styles.chipText, { color: filterType === "all" ? colors.background : colors.foreground }]}>Tous types</Text>
        </TouchableOpacity>
        {(Object.entries(TYPE_CONFIG) as [ActeType, typeof TYPE_CONFIG[ActeType]][]).map(([key, cfg]) => {
          const count = ACTES.filter((a) => a.type === key).length;
          if (count === 0) return null;
          const active = filterType === key;
          return (
            <TouchableOpacity key={key} style={[styles.chip, { backgroundColor: active ? cfg.color : colors.card, borderColor: active ? cfg.color : colors.border }]} onPress={() => setFilterType(key)}>
              <Feather name={cfg.icon} size={11} color={active ? "#fff" : cfg.color} />
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.foreground }]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}>
        {displayed.map((acte) => {
          const tc = TYPE_CONFIG[acte.type];
          const sc = STATUT_CONFIG[acte.statut];
          return (
            <TouchableOpacity
              key={acte.id}
              style={[styles.acteCard, { backgroundColor: colors.card, borderColor: acte.important && acte.statut !== "archive" ? tc.color + "50" : colors.border }]}
              onPress={() => { setSelected(acte); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.75}
            >
              <View style={styles.acteTop}>
                <View style={[styles.acteIcon, { backgroundColor: tc.color + "18" }]}>
                  <Feather name={tc.icon} size={18} color={tc.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.acteBadges}>
                    <View style={[styles.typeBadge, { backgroundColor: tc.color + "15" }]}>
                      <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.label}</Text>
                    </View>
                    <View style={[styles.statutBadge, { backgroundColor: sc.bg }]}>
                      <Feather name={sc.icon} size={9} color={sc.color} />
                      <Text style={[styles.statutText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.acteTitre, { color: colors.foreground }]} numberOfLines={2}>{acte.titre}</Text>
                  <Text style={[styles.acteObjet, { color: colors.mutedForeground }]} numberOfLines={1}>{acte.objet}</Text>
                </View>
              </View>
              <View style={styles.acteFooter}>
                <View style={styles.acteMeta}>
                  <Feather name="hash" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.acteMetaText, { color: colors.mutedForeground }]}>{acte.numero}</Text>
                </View>
                <View style={styles.acteMeta}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.acteMetaText, { color: colors.mutedForeground }]}>{acte.date}</Text>
                </View>
                {acte.dateEcheance ? (
                  <View style={styles.acteMeta}>
                    <Feather name="clock" size={11} color="#ef4444" />
                    <Text style={[styles.acteMetaText, { color: "#ef4444" }]}>Échéance : {acte.dateEcheance}</Text>
                  </View>
                ) : null}
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
              <TouchableOpacity onPress={() => setSelected(null)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Acte administratif</Text>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Télécharger", "Télécharger cet acte en PDF signé."); }}>
                <Feather name="download" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {(() => {
                const tc = TYPE_CONFIG[selected.type];
                const sc = STATUT_CONFIG[selected.statut];
                return (
                  <>
                    <View style={[styles.acteDetailHeader, { backgroundColor: tc.color + "12", borderColor: tc.color + "30" }]}>
                      <Feather name={tc.icon} size={22} color={tc.color} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.acteBadges}>
                          <View style={[styles.typeBadge, { backgroundColor: tc.color + "15" }]}>
                            <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.label}</Text>
                          </View>
                          <View style={[styles.statutBadge, { backgroundColor: sc.bg }]}>
                            <Feather name={sc.icon} size={9} color={sc.color} />
                            <Text style={[styles.statutText, { color: sc.color }]}>{sc.label}</Text>
                          </View>
                        </View>
                        <Text style={[styles.acteDetailTitre, { color: colors.foreground }]}>{selected.titre}</Text>
                      </View>
                    </View>
                    <View style={[styles.infoGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                        { label: "N° de référence", value: selected.numero, icon: "hash" as const },
                        { label: "Date", value: selected.date + (selected.dateEcheance ? ` · Échéance : ${selected.dateEcheance}` : ""), icon: "calendar" as const },
                        { label: "Auteur", value: selected.auteur, icon: "user" as const },
                        { label: "Objet", value: selected.objet, icon: "target" as const },
                      ].map((row, i) => (
                        <View key={row.label}>
                          {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                          <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
                              <Feather name={row.icon} size={13} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                              <Text style={[styles.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                    <View style={[styles.resumeBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.resumeLabel, { color: colors.mutedForeground }]}>RÉSUMÉ DU CONTENU</Text>
                      <Text style={[styles.resumeText, { color: colors.foreground }]}>{selected.resumeContenu}</Text>
                    </View>
                    {selected.signataires.length > 0 ? (
                      <View style={[styles.sigBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.sigLabel, { color: colors.mutedForeground }]}>SIGNATAIRES</Text>
                        {selected.signataires.map((s, i) => (
                          <View key={i} style={styles.sigItem}>
                            <View style={[styles.sigDot, { backgroundColor: "#10b981" }]} />
                            <Text style={[styles.sigName, { color: colors.foreground }]}>{s}</Text>
                            <Feather name="check-circle" size={13} color="#10b981" />
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {selected.destinataires.length > 0 ? (
                      <View style={[styles.sigBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.sigLabel, { color: colors.mutedForeground }]}>DESTINATAIRES</Text>
                        {selected.destinataires.map((d, i) => (
                          <View key={i} style={styles.sigItem}>
                            <View style={[styles.sigDot, { backgroundColor: tc.color }]} />
                            <Text style={[styles.sigName, { color: colors.foreground }]}>{d}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.actionBtns}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("PDF", "Télécharger le document officiel en PDF."); }}>
                        <Feather name="download" size={15} color="#fff" />
                        <Text style={styles.actionBtnText}>Télécharger PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Partager", "Partager cet acte administratif."); }}>
                        <Feather name="share-2" size={15} color={colors.foreground} />
                        <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Partager</Text>
                      </TouchableOpacity>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  addBtn: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  acteCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  acteTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  acteIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  acteBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  statutBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statutText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  acteTitre: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 19 },
  acteObjet: { fontSize: 11, fontFamily: "Inter_400Regular" },
  acteFooter: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  acteMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  acteMetaText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: Platform.OS === "web" ? 20 : 56, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  acteDetailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  acteDetailTitre: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 22, marginTop: 6 },
  infoGrid: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sep: { height: 1 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 },
  infoIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  resumeBox: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  resumeLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  resumeText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sigBox: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sigLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  sigItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  sigDot: { width: 6, height: 6, borderRadius: 3 },
  sigName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
