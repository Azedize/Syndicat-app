import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
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
  syndicale: { label: "Liberté syndicale", icon: "shield", color: "#7c3aed" },
  discrimination: { label: "Discrimination", icon: "alert-triangle", color: "#ec4899" },
  contrat: { label: "Contrat de travail", icon: "file-text", color: "#3b82f6" },
  sante: { label: "Santé & Sécurité", icon: "activity", color: "#06b6d4" },
  retraite: { label: "Retraite", icon: "clock", color: "#8b5cf6" },
};

const FICHES: FicheJuridique[] = [
  {
    id: "j1", theme: "licenciement", titre: "Procédure de licenciement pour motif personnel", important: true,
    resume: "Toute rupture du contrat à l'initiative de l'employeur doit respecter une procédure stricte sous peine de nullité.",
    contenu: `Le licenciement pour motif personnel repose sur une cause réelle et sérieuse, c'est-à-dire un motif suffisamment grave, objectivement vérifiable et rendant difficile le maintien du salarié dans l'entreprise.\n\nLes étapes obligatoires sont :\n\n1. Convocation à entretien préalable\nL'employeur doit adresser une lettre recommandée ou remise en main propre contre décharge. La convocation doit mentionner l'objet, la date, l'heure et le lieu de l'entretien.\n\n2. Délai de 5 jours ouvrables\nUn délai minimum de 5 jours ouvrables doit séparer la convocation de l'entretien.\n\n3. L'entretien préalable\nLe salarié peut se faire assister d'un membre du personnel ou d'un représentant syndical. L'employeur présente les motifs et le salarié peut s'expliquer.\n\n4. Délai de réflexion\nL'employeur ne peut notifier le licenciement qu'au moins 2 jours ouvrables après l'entretien.\n\n5. Lettre de licenciement\nElle doit être motivée, datée et envoyée en recommandé. Les motifs doivent être précis — une lettre trop vague rend le licenciement sans cause réelle et sérieuse.`,
    articles: ["Art. L1232-1 Code du Travail", "Art. L1232-2 (convocation)", "Art. L1232-4 (assistance)", "Art. L1232-6 (lettre motivée)"],
    jurisprudence: ["Cass. Soc. 14 nov. 2018 — lettre de motivation insuffisante", "Cass. Soc. 6 mars 2019 — délai convocation"],
    conseils: ["Vérifier le respect strict de tous les délais", "Accompagner le salarié à l'entretien", "Conserver une copie de tous les documents", "En cas de doute, consulter immédiatement un délégué"],
    updated: "2026-04-01",
  },
  {
    id: "j2", theme: "syndicale", titre: "Droits et protections des représentants syndicaux", important: true,
    resume: "Les délégués syndicaux bénéficient d'une protection spéciale contre le licenciement et d'heures de délégation rémunérées.",
    contenu: `Les représentants du personnel et délégués syndicaux disposent d'un statut protecteur prévu par le Code du Travail.\n\nHEURES DE DÉLÉGATION\nLes délégués syndicaux bénéficient de crédit d'heures mensuel :\n• DS dans entreprise < 50 salariés : 10h/mois\n• DS dans entreprise 50-150 salariés : 15h/mois\n• DS dans entreprise > 150 salariés : 20h/mois\n\nCes heures sont considérées comme temps de travail et rémunérées normalement. L'employeur ne peut pas les remettre en cause.\n\nPROTECTION CONTRE LE LICENCIEMENT\nLe licenciement d'un représentant du personnel ou syndical nécessite l'autorisation préalable de l'Inspection du Travail. Cette procédure s'applique pendant le mandat et 6 à 12 mois après son terme.\n\nCIRCULATION ET COMMUNICATION\nLes délégués peuvent se déplacer librement dans l'entreprise pendant leurs heures de délégation. Ils peuvent afficher des communications syndicales sur les panneaux prévus à cet effet.`,
    articles: ["Art. L2143-13 à L2143-17 (heures de délégation)", "Art. L2411-1 à L2414-1 (protection licenciement)", "Art. L2142-10 (affichage syndical)"],
    jurisprudence: ["Cass. Soc. 26 sept. 2018 — abus heures délégation", "CE 2 mars 2020 — autorisation inspection du travail"],
    conseils: ["Tenir un registre précis de vos heures de délégation", "Informer l'employeur avant utilisation si accord collectif l'exige", "Toute entrave à l'exercice du mandat est un délit pénal", "En cas de refus d'heures, adresser un courrier RAR immédiatement"],
    updated: "2026-03-15",
  },
  {
    id: "j3", theme: "conges", titre: "Congés payés — droits et calcul", 
    resume: "Tout salarié a droit à 2,5 jours ouvrables de congés payés par mois de travail effectif, soit 30 jours ouvrables par an.",
    contenu: `ACQUISITION\nLes congés s'acquièrent du 1er juin au 31 mai de l'année suivante (période de référence). Tout mois de travail effectif donne droit à 2,5 jours ouvrables.\n\nPLANIFICATION\nL'employeur fixe l'ordre des départs en tenant compte de la situation familiale des salariés. Le salarié doit être informé de ses dates au moins 1 mois à l'avance.\n\nINDEMNITÉ DE CONGÉS PAYÉS\nCalculée selon la méthode la plus avantageuse :\n• 1/10e de la rémunération brute totale perçue pendant la période de référence\n• Ou maintien du salaire habituel\n\nRETENUE POUR ABSENCE\nL'employeur ne peut déduire que les jours ouvrables (lundi au samedi, hors jours fériés) entre le départ et le retour du salarié.\n\nCONGÉS NON PRIS\nLe principe est que les congés non pris sont perdus (pas de report automatique). Des exceptions existent pour maladie ou maternité.`,
    articles: ["Art. L3141-1 à L3141-24 Code du Travail", "Art. L3141-14 (indemnité de congés)", "Art. L3141-16 (ordre des départs)"],
    conseils: ["Vérifier votre solde de congés chaque mois", "Poser vos congés par écrit (email ou formulaire)", "Conserver les confirmations de votre employeur", "En cas de refus abusif, saisir le Conseil des Prud'hommes"],
    updated: "2026-01-10",
  },
  {
    id: "j4", theme: "salaire", titre: "Salaire minimum légal et non-paiement", important: true,
    resume: "Le non-paiement du salaire constitue une faute grave de l'employeur permettant la prise d'acte de rupture.",
    contenu: `LE SALAIRE MINIMUM\nTout salarié doit percevoir au minimum le SMIG (Salaire Minimum Interprofessionnel Garanti) fixé annuellement par décret.\n\nOBLIGATION DE PAIEMENT\nL'employeur est tenu de verser le salaire à la date convenue, au plus tard le dernier jour du mois. Tout retard caractérise un manquement grave.\n\nNON-PAIEMENT\nEn cas de non-paiement, le salarié peut :\n1. Mettre en demeure l'employeur par RAR\n2. Saisir le Conseil des Prud'hommes en référé (procédure d'urgence)\n3. Prendre acte de la rupture aux torts de l'employeur\n\nBULLETIN DE PAIE\nL'employeur est tenu de remettre un bulletin de salaire à chaque versement. Il doit être conservé sans limitation de durée.\n\nRETENUES ILLICITES\nL'employeur ne peut pratiquer de retenues sur salaire que pour les cas expressément prévus par la loi (saisies-arrêts, avances sur salaire).`,
    articles: ["Art. L3221-1 (salaire minimum)", "Art. L3243-1 (bulletin de paie)", "Art. L1237-19 (prise d'acte)"],
    jurisprudence: ["Cass. Soc. 25 juin 2014 — prise d'acte non-paiement"],
    conseils: ["Conservez tous vos bulletins de paie", "Signaler tout retard de paiement immédiatement au délégué", "Le non-paiement de 2 mois ouvre droit à la résiliation judiciaire", "Ne jamais signer de décharge de salaire"],
    updated: "2026-02-20",
  },
  {
    id: "j5", theme: "discrimination", titre: "Discrimination au travail — recours",
    resume: "La discrimination est définie comme toute distinction fondée sur l'un des 25 critères légaux (origine, sexe, âge, handicap, activité syndicale...).",
    contenu: `DÉFINITION\nConstitue une discrimination toute distinction, exclusion, restriction ou préférence fondée sur l'un des critères légaux, qui a pour effet de détruire ou altérer l'égalité de traitement en matière d'emploi.\n\nCRITÈRES PROTÉGÉS (liste non exhaustive)\n• Origine, race, appartenance à une ethnie\n• Sexe, grossesse, situation familiale\n• Âge, handicap, état de santé\n• Opinions syndicales ou politiques\n• Religion, mœurs, orientation sexuelle\n\nPREUVE\nEn matière civile, le salarié doit présenter des éléments de fait laissant supposer une discrimination. L'employeur doit ensuite prouver que sa décision est justifiée.\n\nSANCTIONS\n• Civil : dommages et intérêts, réintégration\n• Pénal : jusqu'à 3 ans d'emprisonnement et 45 000 € d'amende\n\nRECOURS\n• Défenseur des Droits (saisine gratuite)\n• Inspection du Travail\n• Conseil des Prud'hommes`,
    articles: ["Art. L1132-1 (liste des critères)", "Art. L1134-1 (aménagement de la preuve)", "Art. 225-1 Code Pénal (discrimination pénale)"],
    jurisprudence: ["Cass. Soc. 7 mai 2019 — discrimination syndicale", "CEDH 8 janv. 2020 — liberté syndicale"],
    conseils: ["Documenter tous les actes discriminatoires (dates, témoins, écrits)", "Saisir le Défenseur des Droits si discrimination caractérisée", "Les représentants syndicaux sont particulièrement exposés — vigilance renforcée"],
    updated: "2026-03-01",
  },
  {
    id: "j6", theme: "contrat", titre: "CDD — règles et requalification en CDI",
    resume: "Le CDD est dérogatoire au CDI. Son non-respect ouvre droit à la requalification automatique en contrat à durée indéterminée.",
    contenu: `CAS DE RECOURS AUTORISÉS\nLe CDD ne peut être conclu que dans des cas précis :\n• Remplacement d'un salarié absent\n• Accroissement temporaire d'activité\n• Emploi saisonnier\n• Contrat d'usage\n\nDURÉE MAXIMALE\nLe CDD, renouvellements compris, ne peut excéder 18 mois (24 mois pour commande exceptionnelle à l'export).\n\nREQUALIFICATION EN CDI\nL'employeur s'expose à la requalification si :\n• Le motif de recours n'est pas légitime\n• La durée maximale est dépassée\n• Les délais de carence ne sont pas respectés\n• Le contrat ne comporte pas les mentions obligatoires\n\nINDEMNITÉ DE PRÉCARITÉ\nÀ l'issue du CDD, le salarié perçoit une indemnité de fin de contrat égale à 10% de la rémunération brute totale perçue.`,
    articles: ["Art. L1242-1 (cas de recours)", "Art. L1245-1 (requalification)", "Art. L1243-8 (indemnité de précarité)"],
    conseils: ["Vérifier que le motif de CDD est légitime", "En cas de renouvellement abusif, saisir le CPH en requalification", "L'indemnité de précarité est due dans tous les cas sauf faute grave"],
    updated: "2026-01-15",
  },
];

export default function RepertoireJuridiqueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [search, setSearch] = useState("");
  const [filterTheme, setFilterTheme] = useState<ThemeType | "all">("all");
  const [selected, setSelected] = useState<FicheJuridique | null>(null);

  const displayed = FICHES.filter((f) => {
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
