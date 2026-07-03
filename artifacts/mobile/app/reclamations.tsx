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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type ReclamationType =
  | "salaire"
  | "condition_travail"
  | "discrimination"
  | "harcelement"
  | "licenciement"
  | "conge"
  | "avancement"
  | "securite"
  | "autre";

type ReclamationStatut =
  | "deposee"
  | "en_instruction"
  | "transmise_direction"
  | "en_mediation"
  | "resolue"
  | "classee"
  | "contentieux";

type ReclamationPriorite = "urgente" | "haute" | "normale" | "basse";

interface Reclamation {
  id: string;
  reference: string;
  type: ReclamationType;
  statut: ReclamationStatut;
  priorite: ReclamationPriorite;
  titre: string;
  description: string;
  membre: string;
  membreId: string;
  service: string;
  dateDepot: string;
  dateEcheance?: string;
  dateCloture?: string;
  traitePar?: string;
  commentaireAdmin?: string;
  documentsJoints: string[];
  etapes: { date: string; action: string; auteur: string }[];
  anonymous: boolean;
}

const TYPE_CONFIG: Record<ReclamationType, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  salaire: { label: "Salaire", icon: "dollar-sign", color: "#10b981" },
  condition_travail: { label: "Conditions de travail", icon: "tool", color: "#f59e0b" },
  discrimination: { label: "Discrimination", icon: "alert-octagon", color: "#ef4444" },
  harcelement: { label: "Harcèlement", icon: "slash", color: "#dc2626" },
  licenciement: { label: "Licenciement", icon: "user-x", color: "#ef4444" },
  conge: { label: "Congé", icon: "calendar", color: "#3b82f6" },
  avancement: { label: "Avancement", icon: "trending-up", color: "#7c3aed" },
  securite: { label: "Sécurité", icon: "shield", color: "#f97316" },
  autre: { label: "Autre", icon: "more-horizontal", color: "#6b7280" },
};

const STATUT_CONFIG: Record<ReclamationStatut, { label: string; color: string }> = {
  deposee: { label: "Déposée", color: "#6b7280" },
  en_instruction: { label: "En instruction", color: "#3b82f6" },
  transmise_direction: { label: "Transmise direction", color: "#f59e0b" },
  en_mediation: { label: "En médiation", color: "#7c3aed" },
  resolue: { label: "Résolue", color: "#10b981" },
  classee: { label: "Classée", color: "#6b7280" },
  contentieux: { label: "Contentieux", color: "#ef4444" },
};

const PRIORITE_CONFIG: Record<ReclamationPriorite, { label: string; color: string }> = {
  urgente: { label: "Urgente", color: "#dc2626" },
  haute: { label: "Haute", color: "#ef4444" },
  normale: { label: "Normale", color: "#f59e0b" },
  basse: { label: "Basse", color: "#6b7280" },
};

const RECLAMATIONS: Reclamation[] = [
  {
    id: "r1",
    reference: "REC-2026-047",
    type: "salaire",
    statut: "en_instruction",
    priorite: "haute",
    titre: "Non-paiement des heures supplémentaires — Mars à Mai 2026",
    description: "Depuis mars 2026, mes heures supplémentaires (environ 24h/mois) ne sont pas intégrées dans le bulletin de paie. Malgré deux relances RH restées sans réponse, la situation perdure. Conformément à l'article 201 du Code du Travail, je sollicite le paiement de ces heures majorées à 25%.",
    membre: "Mohammed Alaoui",
    membreId: "1",
    service: "Département Informatique",
    dateDepot: "2026-06-10",
    dateEcheance: "2026-06-24",
    traitePar: "Fatima Zahra El Alami",
    documentsJoints: ["Relevé heures supplémentaires.pdf", "Bulletins de paie mars-mai.pdf"],
    etapes: [
      { date: "2026-06-10", action: "Réclamation déposée auprès du syndicat", auteur: "Mohammed Alaoui" },
      { date: "2026-06-11", action: "Accusé de réception envoyé au membre", auteur: "Système" },
      { date: "2026-06-12", action: "Dossier pris en charge — affectation délégué", auteur: "Fatima Zahra El Alami" },
      { date: "2026-06-15", action: "Courrier de mise en demeure transmis à la RH", auteur: "Fatima Zahra El Alami" },
    ],
    anonymous: false,
  },
  {
    id: "r2",
    reference: "REC-2026-046",
    type: "condition_travail",
    statut: "transmise_direction",
    priorite: "normale",
    titre: "Locaux de travail insalubres — Bâtiment C",
    description: "Le bâtiment C présente des problèmes d'humidité et de ventilation depuis octobre 2025. Plusieurs collègues ont développé des pathologies respiratoires. Le médecin du travail a été saisi mais aucune mesure corrective n'a été prise par l'employeur.",
    membre: "Khadija Tahiri",
    membreId: "2",
    service: "Administration",
    dateDepot: "2026-06-05",
    dateEcheance: "2026-06-30",
    traitePar: "Rachid Bennis",
    commentaireAdmin: "Courrier adressé à la direction le 8 juin. Réunion CHSCT prévue le 25 juin.",
    documentsJoints: ["Rapport médecin travail.pdf", "Photos locaux.pdf"],
    etapes: [
      { date: "2026-06-05", action: "Réclamation déposée", auteur: "Khadija Tahiri" },
      { date: "2026-06-08", action: "Dossier transmis à la direction", auteur: "Rachid Bennis" },
      { date: "2026-06-10", action: "Accusé de réception direction reçu", auteur: "Système" },
    ],
    anonymous: false,
  },
  {
    id: "r3",
    reference: "REC-2026-045",
    type: "harcelement",
    statut: "en_mediation",
    priorite: "urgente",
    titre: "Harcèlement moral — Comportement du chef de service",
    description: "Déclaration confidentielle relative à un comportement harcelant de la part d'un responsable hiérarchique direct. Pressions constantes, humiliations en public, surcharge de travail délibérée. Témoin disponible.",
    membre: "Anonyme",
    membreId: "anon",
    service: "Non communiqué",
    dateDepot: "2026-06-08",
    dateEcheance: "2026-06-22",
    traitePar: "Amina Tazi",
    documentsJoints: ["Témoignage écrit.pdf"],
    etapes: [
      { date: "2026-06-08", action: "Réclamation anonyme reçue", auteur: "Système" },
      { date: "2026-06-09", action: "Médiation interne engagée — Désignation médiateur", auteur: "Amina Tazi" },
      { date: "2026-06-12", action: "Première séance de médiation tenue", auteur: "Amina Tazi" },
    ],
    anonymous: true,
  },
  {
    id: "r4",
    reference: "REC-2026-041",
    type: "avancement",
    statut: "resolue",
    priorite: "normale",
    titre: "Blocage injustifié d'avancement — Grade A1",
    description: "Bloqué au même échelon depuis 4 ans sans motif officiel. Les critères d'avancement sont pourtant remplis : évaluations positives, ancienneté, formation professionnelle à jour.",
    membre: "Omar Lahlou",
    membreId: "7",
    service: "Production",
    dateDepot: "2026-05-15",
    dateCloture: "2026-06-03",
    traitePar: "Fatima Zahra El Alami",
    commentaireAdmin: "Résolu favorablement. La direction a accepté de régulariser l'avancement avec effet rétroactif au 01/01/2026.",
    documentsJoints: ["Fiche d'avancement.pdf"],
    etapes: [
      { date: "2026-05-15", action: "Réclamation déposée", auteur: "Omar Lahlou" },
      { date: "2026-05-20", action: "Courrier adressé au DRH", auteur: "Fatima Zahra El Alami" },
      { date: "2026-05-28", action: "Réunion bilatérale avec le DRH", auteur: "Fatima Zahra El Alami" },
      { date: "2026-06-03", action: "Avancement accordé — Réclamation résolue", auteur: "Fatima Zahra El Alami" },
    ],
    anonymous: false,
  },
  {
    id: "r5",
    reference: "REC-2026-039",
    type: "licenciement",
    statut: "contentieux",
    priorite: "urgente",
    titre: "Licenciement abusif sans cause réelle — Affaire Benali",
    description: "Licenciement prononcé sans motif réel ni sérieux le 12 mai 2026, sans respect de la procédure légale (absence d'entretien préalable). Demande de réintégration et/ou indemnités légales conformément aux articles 62 et suivants du Code du Travail.",
    membre: "Hassan Idrissi",
    membreId: "5",
    service: "Commercial",
    dateDepot: "2026-05-14",
    dateEcheance: "2026-07-14",
    traitePar: "Amina Tazi",
    commentaireAdmin: "Dossier transmis au cabinet d'avocats partenaire. Saisine du Tribunal du Travail de Casablanca prévue.",
    documentsJoints: ["Lettre de licenciement.pdf", "Contrat de travail.pdf", "Bulletins de paie.pdf"],
    etapes: [
      { date: "2026-05-14", action: "Réclamation urgente déposée", auteur: "Hassan Idrissi" },
      { date: "2026-05-15", action: "Consultation juridique d'urgence organisée", auteur: "Amina Tazi" },
      { date: "2026-05-20", action: "Mise en demeure transmise à l'employeur", auteur: "Amina Tazi" },
      { date: "2026-06-01", action: "Échec de la conciliation — Passage en contentieux", auteur: "Amina Tazi" },
    ],
    anonymous: false,
  },
  {
    id: "r6",
    reference: "REC-2026-038",
    type: "conge",
    statut: "resolue",
    priorite: "basse",
    titre: "Refus de congé de formation syndicale",
    description: "Demande de congé de 5 jours pour formation syndicale refusée par le responsable direct sans motif valable. L'article 457 du Code du Travail garantit ce droit.",
    membre: "Zineb Berrada",
    membreId: "6",
    service: "Logistique",
    dateDepot: "2026-05-10",
    dateCloture: "2026-05-22",
    traitePar: "Rachid Bennis",
    commentaireAdmin: "Congé accordé après intervention syndicale. Formation effectuée les 26-30 mai.",
    documentsJoints: ["Programme formation.pdf"],
    etapes: [
      { date: "2026-05-10", action: "Réclamation déposée", auteur: "Zineb Berrada" },
      { date: "2026-05-14", action: "Intervention auprès du DRH", auteur: "Rachid Bennis" },
      { date: "2026-05-22", action: "Congé accordé — Réclamation close", auteur: "Rachid Bennis" },
    ],
    anonymous: false,
  },
];

const TYPES_LIST = Object.entries(TYPE_CONFIG) as [ReclamationType, typeof TYPE_CONFIG[ReclamationType]][];

export default function ReclamationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  const [filterStatut, setFilterStatut] = useState<ReclamationStatut | "all">("all");
  const [filterType, setFilterType] = useState<ReclamationType | "all">("all");
  const [filterPriorite, setFilterPriorite] = useState<ReclamationPriorite | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Reclamation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<ReclamationType>("autre");
  const [newAnon, setNewAnon] = useState(false);
  const [showEtapes, setShowEtapes] = useState(false);

  const filtered = RECLAMATIONS.filter((r) => {
    if (filterStatut !== "all" && r.statut !== filterStatut) return false;
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterPriorite !== "all" && r.priorite !== filterPriorite) return false;
    if (searchText && !r.titre.toLowerCase().includes(searchText.toLowerCase()) && !r.reference.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (!isAdmin && r.membreId !== "0" && r.membreId !== user?.id) return false;
    return true;
  });

  const stats = {
    total: RECLAMATIONS.length,
    enCours: RECLAMATIONS.filter((r) => ["deposee", "en_instruction", "transmise_direction", "en_mediation"].includes(r.statut)).length,
    resolues: RECLAMATIONS.filter((r) => r.statut === "resolue").length,
    urgentes: RECLAMATIONS.filter((r) => r.priorite === "urgente" && r.statut !== "resolue" && r.statut !== "classee").length,
  };

  const handleDeposer = () => {
    if (!newTitle.trim() || !newDesc.trim()) {
      Alert.alert("Champs requis", "Veuillez renseigner le titre et la description.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowNew(false);
    setNewTitle("");
    setNewDesc("");
    setNewType("autre");
    setNewAnon(false);
    Alert.alert("Réclamation déposée", `Votre réclamation a été enregistrée.\nRéférence : REC-2026-048\n\nLe syndicat vous contactera dans les 48h ouvrées.`);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.foreground }]}>Réclamations & Griefs</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            {isAdmin ? `${stats.enCours} en cours · ${stats.urgentes} urgentes` : "Vos réclamations syndicales"}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowNew(true); }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={s.newBtnText}>Déposer</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar — admin only */}
      {isAdmin && (
        <View style={[s.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {[
            { label: "Total", value: stats.total, color: colors.foreground },
            { label: "En cours", value: stats.enCours, color: "#3b82f6" },
            { label: "Résolues", value: stats.resolues, color: "#10b981" },
            { label: "Urgentes", value: stats.urgentes, color: "#ef4444" },
          ].map((st) => (
            <View key={st.label} style={s.statItem}>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{st.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Rechercher une réclamation..."
            placeholderTextColor={colors.mutedForeground}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }} contentContainerStyle={s.filterRow}>
        {(["all", "deposee", "en_instruction", "transmise_direction", "en_mediation", "resolue", "contentieux"] as (ReclamationStatut | "all")[]).map((st) => {
          const cfg = st === "all" ? null : STATUT_CONFIG[st];
          const active = filterStatut === st;
          const count = st === "all" ? filtered.length : filtered.filter((r) => r.statut === st).length;
          return (
            <TouchableOpacity
              key={st}
              style={[s.chip, { backgroundColor: active ? (cfg?.color ?? colors.primary) : colors.card, borderColor: active ? (cfg?.color ?? colors.primary) : colors.border }]}
              onPress={() => { setFilterStatut(st); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[s.chipText, { color: active ? "#fff" : colors.foreground }]}>
                {st === "all" ? `Toutes (${count})` : `${cfg?.label} (${count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="inbox" size={32} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>Aucune réclamation</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {isAdmin ? "Aucune réclamation ne correspond aux filtres." : "Vous n'avez pas encore déposé de réclamation.\nDéposez-en une via le bouton ci-dessus."}
            </Text>
          </View>
        )}

        {filtered.map((rec) => {
          const tc = TYPE_CONFIG[rec.type];
          const sc = STATUT_CONFIG[rec.statut];
          const pc = PRIORITE_CONFIG[rec.priorite];
          return (
            <TouchableOpacity
              key={rec.id}
              style={[s.card, { backgroundColor: colors.card, borderColor: rec.priorite === "urgente" ? "#ef444440" : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelected(rec); setShowEtapes(false); }}
              activeOpacity={0.75}
            >
              <View style={s.cardTop}>
                <View style={[s.typeIcon, { backgroundColor: tc.color + "18" }]}>
                  <Feather name={tc.icon} size={18} color={tc.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.badgeRow}>
                    <View style={[s.badge, { backgroundColor: sc.color + "18" }]}>
                      <Text style={[s.badgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: pc.color + "18" }]}>
                      <Text style={[s.badgeText, { color: pc.color }]}>{pc.label}</Text>
                    </View>
                    {rec.anonymous && (
                      <View style={[s.badge, { backgroundColor: "#6b728018" }]}>
                        <Text style={[s.badgeText, { color: "#6b7280" }]}>Anonyme</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{rec.titre}</Text>
                  <Text style={[s.cardRef, { color: colors.mutedForeground }]}>{rec.reference} · {tc.label}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
              <View style={[s.cardFooter, { borderTopColor: colors.border }]}>
                <View style={s.metaItem}>
                  <Feather name="user" size={11} color={colors.mutedForeground} />
                  <Text style={[s.metaText, { color: colors.mutedForeground }]}>{rec.anonymous ? "Anonyme" : rec.membre}</Text>
                </View>
                <View style={s.metaItem}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[s.metaText, { color: colors.mutedForeground }]}>Déposée le {new Date(rec.dateDepot).toLocaleDateString("fr-FR")}</Text>
                </View>
                {rec.etapes.length > 0 && (
                  <View style={s.metaItem}>
                    <Feather name="list" size={11} color={colors.mutedForeground} />
                    <Text style={[s.metaText, { color: colors.mutedForeground }]}>{rec.etapes.length} étapes</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (() => {
          const tc = TYPE_CONFIG[selected.type];
          const sc = STATUT_CONFIG[selected.statut];
          const pc = PRIORITE_CONFIG[selected.priorite];
          return (
            <View style={[s.modal, { backgroundColor: colors.background }]}>
              <View style={[s.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <View style={[s.typeIcon, { backgroundColor: tc.color + "18" }]}>
                  <Feather name={tc.icon} size={20} color={tc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: colors.foreground }]} numberOfLines={2}>{selected.titre}</Text>
                  <Text style={[s.modalRef, { color: colors.mutedForeground }]}>{selected.reference}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                  <Feather name="x" size={22} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}>
                {/* Status & priority */}
                <View style={s.badgeRowLarge}>
                  <View style={[s.badgeLg, { backgroundColor: sc.color + "18", borderColor: sc.color + "30" }]}>
                    <View style={[s.dot, { backgroundColor: sc.color }]} />
                    <Text style={[s.badgeLgText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                  <View style={[s.badgeLg, { backgroundColor: pc.color + "18", borderColor: pc.color + "30" }]}>
                    <Text style={[s.badgeLgText, { color: pc.color }]}>Priorité {pc.label}</Text>
                  </View>
                  <View style={[s.badgeLg, { backgroundColor: tc.color + "18", borderColor: tc.color + "30" }]}>
                    <Text style={[s.badgeLgText, { color: tc.color }]}>{tc.label}</Text>
                  </View>
                </View>

                {/* Description */}
                <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>Description</Text>
                  <Text style={[s.sectionBody, { color: colors.mutedForeground }]}>{selected.description}</Text>
                </View>

                {/* Info grid */}
                <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>Informations</Text>
                  {[
                    { label: "Membre", value: selected.anonymous ? "Anonyme (protégé)" : selected.membre, icon: "user" as const },
                    { label: "Service", value: selected.service, icon: "briefcase" as const },
                    { label: "Date de dépôt", value: new Date(selected.dateDepot).toLocaleDateString("fr-FR"), icon: "calendar" as const },
                    ...(selected.dateEcheance ? [{ label: "Échéance", value: new Date(selected.dateEcheance).toLocaleDateString("fr-FR"), icon: "clock" as const }] : []),
                    ...(selected.dateCloture ? [{ label: "Date clôture", value: new Date(selected.dateCloture).toLocaleDateString("fr-FR"), icon: "check-circle" as const }] : []),
                    ...(selected.traitePar ? [{ label: "Traité par", value: selected.traitePar, icon: "user-check" as const }] : []),
                  ].map((info) => (
                    <View key={info.label} style={[s.infoRow, { borderTopColor: colors.border }]}>
                      <Feather name={info.icon} size={13} color={colors.mutedForeground} />
                      <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{info.label}</Text>
                      <Text style={[s.infoValue, { color: colors.foreground }]}>{info.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Admin comment */}
                {selected.commentaireAdmin && (
                  <View style={[s.section, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
                    <View style={s.sectionTitleRow}>
                      <Feather name="message-circle" size={14} color="#10b981" />
                      <Text style={[s.sectionTitle, { color: "#10b981" }]}>Note du délégué</Text>
                    </View>
                    <Text style={[s.sectionBody, { color: colors.foreground }]}>{selected.commentaireAdmin}</Text>
                  </View>
                )}

                {/* Documents */}
                {selected.documentsJoints.length > 0 && (
                  <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[s.sectionTitle, { color: colors.foreground }]}>Documents joints ({selected.documentsJoints.length})</Text>
                    {selected.documentsJoints.map((doc, i) => (
                      <TouchableOpacity key={i} style={[s.docRow, { borderTopColor: colors.border }]} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                        <Feather name="file-text" size={14} color="#6366f1" />
                        <Text style={[s.docName, { color: "#6366f1" }]}>{doc}</Text>
                        <Feather name="download" size={14} color="#6366f1" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Timeline */}
                <TouchableOpacity
                  style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { setShowEtapes((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={[s.sectionTitleRow, { justifyContent: "space-between" }]}>
                    <View style={s.sectionTitleRow}>
                      <Feather name="list" size={14} color={colors.primary} />
                      <Text style={[s.sectionTitle, { color: colors.foreground }]}>Historique ({selected.etapes.length} étapes)</Text>
                    </View>
                    <Feather name={showEtapes ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>
                  {showEtapes && selected.etapes.map((etape, i) => (
                    <View key={i} style={[s.etapeRow, { borderTopColor: colors.border }]}>
                      <View style={[s.etapeDot, { backgroundColor: i === selected.etapes.length - 1 ? colors.primary : colors.border }]} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.etapeDate, { color: colors.mutedForeground }]}>{new Date(etape.date).toLocaleDateString("fr-FR")} · {etape.auteur}</Text>
                        <Text style={[s.etapeAction, { color: colors.foreground }]}>{etape.action}</Text>
                      </View>
                    </View>
                  ))}
                </TouchableOpacity>

                {/* Admin actions */}
                {isAdmin && selected.statut !== "resolue" && selected.statut !== "classee" && (
                  <View style={s.actionsRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#10b981" }]}
                      onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Réclamation résolue", "La réclamation a été marquée comme résolue."); setSelected(null); }}
                    >
                      <Feather name="check-circle" size={14} color="#fff" />
                      <Text style={s.actionBtnText}>Marquer résolue</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#7c3aed" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert("Médiation", "Procédure de médiation engagée."); }}
                    >
                      <Feather name="users" size={14} color="#fff" />
                      <Text style={s.actionBtnText}>Médiation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#ef4444" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); Alert.alert("Contentieux", "Dossier transmis au service juridique pour procédure contentieuse."); }}
                    >
                      <Feather name="alert-triangle" size={14} color="#fff" />
                      <Text style={s.actionBtnText}>Contentieux</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* New Reclamation Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNew(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Feather name="plus-circle" size={20} color={colors.primary} />
            <Text style={[s.modalTitle, { color: colors.foreground }]}>Déposer une réclamation</Text>
            <TouchableOpacity onPress={() => setShowNew(false)} style={s.closeBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}>
            {/* Info */}
            <View style={[s.infoBox, { backgroundColor: "#3b82f610", borderColor: "#3b82f630" }]}>
              <Feather name="info" size={14} color="#3b82f6" />
              <Text style={[s.infoBoxText, { color: "#3b82f6" }]}>
                Votre réclamation sera traitée par votre délégué syndical dans un délai de 48h ouvrées. Vous pouvez choisir de rester anonyme.
              </Text>
            </View>

            {/* Type */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>Type de réclamation *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TYPES_LIST.map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.typeChip, { backgroundColor: newType === key ? cfg.color : colors.card, borderColor: newType === key ? cfg.color : colors.border }]}
                    onPress={() => { setNewType(key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Feather name={cfg.icon} size={13} color={newType === key ? "#fff" : cfg.color} />
                    <Text style={[s.typeChipText, { color: newType === key ? "#fff" : colors.foreground }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Title */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>Titre de la réclamation *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Non-paiement des heures supplémentaires"
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>Description détaillée *</Text>
              <TextInput
                style={[s.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Décrivez les faits, dates, personnes impliquées, articles du Code du Travail si connus..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
                value={newDesc}
                onChangeText={setNewDesc}
              />
            </View>

            {/* Anonymous toggle */}
            <TouchableOpacity
              style={[s.anonRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setNewAnon((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name={newAnon ? "eye-off" : "eye"} size={16} color={newAnon ? "#7c3aed" : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[s.anonTitle, { color: colors.foreground }]}>Réclamation anonyme</Text>
                <Text style={[s.anonDesc, { color: colors.mutedForeground }]}>Votre identité ne sera pas communiquée à l'employeur</Text>
              </View>
              <View style={[s.toggle, { backgroundColor: newAnon ? "#7c3aed" : colors.border }]}>
                <View style={[s.toggleThumb, { marginLeft: newAnon ? 20 : 2 }]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary }]} onPress={handleDeposer} activeOpacity={0.85}>
              <Feather name="send" size={16} color="#fff" />
              <Text style={s.submitText}>Déposer la réclamation</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  statsBar: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 16 },
  emptyIcon: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  typeIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  cardRef: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardFooter: { flexDirection: "row", gap: 14, flexWrap: "wrap", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, paddingTop: 24, borderBottomWidth: 1, gap: 12 },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  modalRef: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4 },
  badgeRowLarge: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badgeLg: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  badgeLgText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  infoLabel: { width: 110, fontSize: 12, fontFamily: "Inter_400Regular" },
  infoValue: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  docName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  etapeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  etapeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  etapeDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  etapeAction: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, minWidth: 100 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoBoxText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 19 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 120, textAlignVertical: "top" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  anonRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  anonTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  anonDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  toggle: { width: 42, height: 24, borderRadius: 12, justifyContent: "center" },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
