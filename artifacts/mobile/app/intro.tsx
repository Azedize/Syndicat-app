import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import MizanLogo from "@/components/brand/MizanLogo";

type IconName = React.ComponentProps<typeof Feather>["name"];

const MODULES: Array<{
  icon: IconName;
  color: string;
  tag: string;
  title: string;
  description: string;
  points: string[];
}> = [
  {
    icon: "grid",
    color: "#4C7DFF",
    tag: "PILOTAGE",
    title: "Une vue claire de votre syndicat",
    description:
      "Les informations importantes sont réunies pour décider plus vite, avec une vision structurée de la résidence.",
    points: ["Activité et alertes regroupées", "Accès rapide aux modules clés", "Informations adaptées à chaque rôle"],
  },
  {
    icon: "bar-chart-2",
    color: "#2A9D8F",
    tag: "FINANCE",
    title: "Des finances lisibles et suivies",
    description:
      "Charges, appels de fonds, paiements, impayés et budgets restent traçables dans un même espace.",
    points: ["Appels de fonds et échéances", "Suivi des règlements et relances", "Budgets et rapports financiers"],
  },
  {
    icon: "users",
    color: "#D9A441",
    tag: "GOUVERNANCE",
    title: "Des assemblées mieux organisées",
    description:
      "Préparez les réunions, gérez les votes et conservez les procès-verbaux sans perdre le fil.",
    points: ["Ordre du jour et convocations", "Candidatures, votes et quorum", "Mandats et procès-verbaux"],
  },
  {
    icon: "file-text",
    color: "#A78BFA",
    tag: "DOCUMENTS",
    title: "Tous vos documents, au bon endroit",
    description:
      "Centralisez les documents administratifs et contractuels, suivez leur cycle de vie et facilitez les signatures.",
    points: ["Classement par résidence et dossier", "Signatures et validations multi-parties", "Téléchargement et archivage contrôlés"],
  },
  {
    icon: "shopping-bag",
    color: "#F08C46",
    tag: "SERVICES",
    title: "Une place de marché pour la résidence",
    description:
      "Mettez en relation résidents, vendeurs et prestataires dans un environnement dédié à la copropriété.",
    points: ["Annonces de vente et de location", "Demandes de devis et partenaires", "Gestion des favoris et commandes"],
  },
  {
    icon: "tool",
    color: "#E6BC61",
    tag: "MAINTENANCE",
    title: "Des travaux suivis de bout en bout",
    description:
      "Chaque incident ou chantier devient une action suivie, documentée et attribuée.",
    points: ["Sinistres et incidents déclarés", "Travaux avec responsables et statuts", "Pièces jointes et historique des actions"],
  },
  {
    icon: "shield",
    color: "#F07178",
    tag: "RELATION RÉSIDENTS",
    title: "Les demandes ne se perdent plus",
    description:
      "Donnez un cadre clair aux réclamations, aux interventions et aux échanges avec les résidents.",
    points: ["Dépôt et qualification des demandes", "Statuts et responsables identifiés", "Escalade et suivi des réponses"],
  },
  {
    icon: "message-circle",
    color: "#5AC8FA",
    tag: "COMMUNICATION",
    title: "Une communication qui rassemble",
    description:
      "Diffusez les annonces officielles et échangez avec les bons interlocuteurs, sans mélanger les conversations.",
    points: ["Messagerie interne et conversations", "Publications et annonces de résidence", "Notifications et pièces jointes"],
  },
  {
    icon: "globe",
    color: "#8EA5FF",
    tag: "ADMINISTRATION",
    title: "Une organisation prête à grandir",
    description:
      "Chaque équipe dispose d’un espace adapté à son périmètre et à ses responsabilités.",
    points: ["Séparation des espaces et des données", "Équipe du syndic et rôles métier", "Audit, transparence et supervision"],
  },
];

const ROLE_BENEFITS = [
  { icon: "briefcase" as IconName, label: "Syndics", text: "Pilotez vos résidences avec méthode." },
  { icon: "home" as IconName, label: "Copropriétaires", text: "Suivez ce qui compte, en toute transparence." },
  { icon: "users" as IconName, label: "Conseils syndicaux", text: "Décidez avec les bons éléments." },
  { icon: "key" as IconName, label: "Locataires", text: "Accédez simplement à vos démarches." },
];

function DashboardPreview() {
  return (
    <View style={styles.previewShell}>
      <View style={styles.previewTopbar}>
        <View style={styles.previewWindowDots}>
          <View style={[styles.previewDot, { backgroundColor: "#F07178" }]} />
          <View style={[styles.previewDot, { backgroundColor: "#E6BC61" }]} />
          <View style={[styles.previewDot, { backgroundColor: "#2A9D8F" }]} />
        </View>
        <View style={styles.previewTopLine} />
        <View style={styles.previewAvatar}>
          <Text style={styles.previewAvatarText}>SC</Text>
        </View>
      </View>
      <View style={styles.previewBody}>
        <View style={styles.previewRail}>
          <View style={styles.previewRailLogo}>
            <Feather name="layers" size={13} color="#9CB8FF" />
          </View>
          {[ "grid", "bar-chart-2", "file-text", "message-circle" ].map((icon, index) => (
            <View key={icon} style={[styles.previewRailItem, index === 0 && styles.previewRailItemActive]}>
              <Feather name={icon as IconName} size={13} color={index === 0 ? "#FFFFFF" : "#6682AD"} />
            </View>
          ))}
        </View>
        <View style={styles.previewContent}>
          <View style={styles.previewHeadingRow}>
            <View>
              <Text style={styles.previewKicker}>VOTRE ESPACE</Text>
              <Text style={styles.previewTitle}>Bonjour, votre résidence</Text>
            </View>
            <View style={styles.previewBell}>
              <Feather name="bell" size={13} color="#A9C1EC" />
            </View>
          </View>
          <View style={styles.previewMetricRow}>
            <View style={[styles.previewMetric, { backgroundColor: "#14315F" }]}>
              <Text style={styles.previewMetricLabel}>À SUIVRE</Text>
              <Text style={[styles.previewMetricValue, { color: "#FFFFFF" }]}>12</Text>
              <Text style={styles.previewMetricHint}>éléments actifs</Text>
            </View>
            <View style={[styles.previewMetric, { backgroundColor: "#123D3B" }]}>
              <Text style={styles.previewMetricLabel}>ACTIVITÉ</Text>
              <Text style={[styles.previewMetricValue, { color: "#72E0C4" }]}>+24%</Text>
              <Text style={styles.previewMetricHint}>ce mois-ci</Text>
            </View>
          </View>
          <View style={styles.previewActivity}>
            <View style={styles.previewActivityHeader}>
              <Text style={styles.previewActivityTitle}>Activité récente</Text>
              <Text style={styles.previewSeeAll}>Voir tout</Text>
            </View>
            {[
              { icon: "check-circle" as IconName, text: "Appel de fonds validé", time: "Il y a 12 min", color: "#72E0C4" },
              { icon: "file-text" as IconName, text: "Nouveau document partagé", time: "Il y a 42 min", color: "#9CB8FF" },
              { icon: "message-circle" as IconName, text: "Réponse du syndic", time: "Hier", color: "#E6BC61" },
            ].map((item) => (
              <View key={item.text} style={styles.previewActivityRow}>
                <View style={[styles.previewActivityIcon, { backgroundColor: `${item.color}20` }]}>
                  <Feather name={item.icon} size={12} color={item.color} />
                </View>
                <View style={styles.previewActivityCopy}>
                  <Text style={styles.previewActivityText}>{item.text}</Text>
                  <Text style={styles.previewActivityTime}>{item.time}</Text>
                </View>
                <Feather name="chevron-right" size={13} color="#577196" />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function ModuleCard({
  module,
  isDark,
}: {
  module: (typeof MODULES)[number];
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.moduleCard,
        {
          backgroundColor: isDark ? "#102B4D" : "#FFFFFF",
          borderColor: isDark ? "#27486D" : "#E2E8F0",
        },
      ]}
    >
      <View style={styles.moduleHeader}>
        <View style={[styles.moduleIcon, { backgroundColor: module.color }]}>
          <Feather name={module.icon} size={19} color="#FFFFFF" />
        </View>
        <View style={styles.moduleTagWrap}>
          <Text style={[styles.moduleTag, { color: module.color }]}>{module.tag}</Text>
          <View style={[styles.moduleLine, { backgroundColor: `${module.color}35` }]} />
        </View>
        <Feather name="arrow-up-right" size={16} color={isDark ? "#6F8FB8" : "#9AAAC0"} />
      </View>
      <Text style={[styles.moduleTitle, { color: isDark ? "#F8FAFF" : "#0B1F3A" }]}>{module.title}</Text>
      <Text style={[styles.moduleDescription, { color: isDark ? "#A8BCD8" : "#64748B" }]}>{module.description}</Text>
      <View style={styles.pointList}>
        {module.points.map((point) => (
          <View key={point} style={styles.pointRow}>
            <View style={[styles.pointIcon, { backgroundColor: `${module.color}18` }]}>
              <Feather name="check" size={11} color={module.color} />
            </View>
            <Text style={[styles.pointText, { color: isDark ? "#D5E1F2" : "#344861" }]}>{point}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useColors();
  const foreground = isDark ? "#F8FAFF" : colors.foreground;
  const muted = isDark ? "#9DB3CF" : colors.mutedForeground;

  const openStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/get-started");
  };

  return (
    <View style={[styles.root, { backgroundColor: "#081A31" }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Platform.OS === "web" ? 67 : insets.top, paddingBottom: insets.bottom + 40 }}
      >
        <View style={styles.hero}>
          <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 0 : 16 }]}>
            <MizanLogo variant="horizontal" colorScheme="dark" size={38} showTagline={false} />
            <TouchableOpacity onPress={() => router.replace("/login")} style={styles.topCta}>
              <Text style={styles.topCtaText}>Se connecter</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrowText}>LA COPROPRIÉTÉ, ENFIN CONNECTÉE</Text>
            <Text style={styles.heroTitle}>
              La gestion de votre résidence{"\n"}
              <Text style={styles.heroTitleAccent}>mérite un espace à sa hauteur.</Text>
            </Text>
            <Text style={styles.heroDescription}>
              MIZAN réunit les décisions, les finances, les documents et les échanges dans une seule expérience.
            </Text>
            <TouchableOpacity onPress={openStart} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Découvrir la plateforme</Text>
              <Feather name="arrow-right" size={18} color="#0B1F3A" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.pageSection, { backgroundColor: isDark ? "#081A31" : "#F5F8FC" }]}>
          <Text style={[styles.sectionKicker, { color: "#4C7DFF" }]}>TOUT CE DONT VOUS AVEZ BESOIN</Text>
          <Text style={[styles.sectionTitle, { color: foreground }]}>Neuf domaines.{"\n"}Un parcours cohérent.</Text>
          <Text style={[styles.sectionDescription, { color: muted }]}>
            De la première décision au suivi quotidien, chaque fonction trouve sa place dans le même environnement.
          </Text>
          {MODULES.map((module) => (
            <ModuleCard key={module.tag} module={module} isDark={isDark} />
          ))}
        </View>
        <View style={[styles.pageSection, { backgroundColor: isDark ? "#081A31" : "#F5F8FC" }]}>
          <View style={[styles.finalCta, { backgroundColor: "#0B1F3A" }]}>
            <Text style={styles.finalTitle}>Votre résidence peut fonctionner autrement.</Text>
            <Text style={styles.finalText}>Créez votre espace et donnez à chaque personne la bonne information, au bon moment.</Text>
            <TouchableOpacity onPress={openStart} style={styles.finalButton}>
              <Text style={styles.finalButtonText}>Créer mon espace</Text>
              <Feather name="arrow-right" size={17} color="#0B1F3A" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { backgroundColor: "#081A31", paddingHorizontal: 20, paddingBottom: 42 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#1F5EFF", alignItems: "center", justifyContent: "center" },
  brandMarkInner: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", alignItems: "center", justifyContent: "center" },
  brandName: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1.8 },
  brandSubname: { color: "#7F9BC1", fontFamily: "Inter_600SemiBold", fontSize: 8, letterSpacing: 1.9, marginTop: 2 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  topLogin: { paddingHorizontal: 8, paddingVertical: 10 },
  topLoginText: { color: "#B9CCFF", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  topCta: { minHeight: 38, borderRadius: 10, paddingHorizontal: 13, backgroundColor: "#FFFFFF", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  topCtaText: { color: "#0B1F3A", fontFamily: "Inter_700Bold", fontSize: 11 },
  heroCopy: { alignItems: "center", paddingTop: 52, gap: 16 },
  heroEyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#72E0C4" },
  heroEyebrowText: { color: "#72E0C4", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.7 },
  heroTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 30, lineHeight: 37, letterSpacing: -0.8 },
  heroTitleAccent: { color: "#9CB8FF" },
  heroDescription: { color: "#A9BEDC", fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 14, lineHeight: 22, maxWidth: 580 },
  heroActions: { width: "100%", gap: 10, marginTop: 3 },
  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 18 },
  primaryText: { color: "#0B1F3A", fontFamily: "Inter_700Bold", fontSize: 14 },
  secondaryButton: { minHeight: 47, borderRadius: 13, borderWidth: 1, borderColor: "#2D4E7D", backgroundColor: "#0D2443", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryText: { color: "#B9CCFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  heroPreview: { alignItems: "center", marginTop: 34, position: "relative" },
  previewGlow: { position: "absolute", width: 220, height: 180, top: 18, backgroundColor: "#1F5EFF", opacity: 0.15, borderRadius: 120 },
  previewShell: { width: "100%", maxWidth: 560, borderRadius: 15, backgroundColor: "#0E2342", borderWidth: 1, borderColor: "#315581", padding: 9, shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  previewTopbar: { height: 27, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 10 },
  previewWindowDots: { flexDirection: "row", gap: 4 },
  previewDot: { width: 5, height: 5, borderRadius: 3 },
  previewTopLine: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#17365F" },
  previewAvatar: { width: 17, height: 17, borderRadius: 9, backgroundColor: "#2D5DAD", alignItems: "center", justifyContent: "center" },
  previewAvatarText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 6 },
  previewBody: { flexDirection: "row", borderRadius: 9, overflow: "hidden", backgroundColor: "#0A1A32", minHeight: 214 },
  previewRail: { width: 35, backgroundColor: "#102B4D", alignItems: "center", paddingTop: 10, gap: 11 },
  previewRailLogo: { width: 20, height: 20, borderRadius: 6, backgroundColor: "#1F5EFF", alignItems: "center", justifyContent: "center", marginBottom: 3 },
  previewRailItem: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  previewRailItemActive: { backgroundColor: "#2A5794" },
  previewContent: { flex: 1, padding: 14, gap: 13 },
  previewHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewKicker: { color: "#6F8FB8", fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 1.2, marginBottom: 3 },
  previewTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 13 },
  previewBell: { width: 25, height: 25, borderRadius: 8, backgroundColor: "#14315F", alignItems: "center", justifyContent: "center" },
  previewMetricRow: { flexDirection: "row", gap: 8 },
  previewMetric: { flex: 1, borderRadius: 8, padding: 9, minHeight: 62 },
  previewMetricLabel: { color: "#91A9CC", fontFamily: "Inter_700Bold", fontSize: 6, letterSpacing: 0.8 },
  previewMetricValue: { fontFamily: "Inter_700Bold", fontSize: 20, marginTop: 2 },
  previewMetricHint: { color: "#7794BB", fontFamily: "Inter_400Regular", fontSize: 7 },
  previewActivity: { backgroundColor: "#0E2342", borderRadius: 8, padding: 10, gap: 8, flex: 1 },
  previewActivityHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewActivityTitle: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 9 },
  previewSeeAll: { color: "#7EA7FF", fontFamily: "Inter_500Medium", fontSize: 7 },
  previewActivityRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  previewActivityIcon: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  previewActivityCopy: { flex: 1 },
  previewActivityText: { color: "#D5E1F2", fontFamily: "Inter_500Medium", fontSize: 8 },
  previewActivityTime: { color: "#6F8FB8", fontFamily: "Inter_400Regular", fontSize: 7, marginTop: 2 },
  previewCaption: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
  captionCheck: { width: 19, height: 19, borderRadius: 10, backgroundColor: "#143D3A", alignItems: "center", justifyContent: "center" },
  captionText: { color: "#8EA5C4", fontFamily: "Inter_500Medium", fontSize: 11 },
  trustStrip: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, gap: 12 },
  trustLabel: { textAlign: "center", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5 },
  trustItems: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  trustDivider: { width: 3, height: 3, borderRadius: 2 },
  trustItemText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.1 },
  pageSection: { paddingHorizontal: 20, paddingVertical: 48, maxWidth: 1100, width: "100%", alignSelf: "center" },
  sectionIntro: { gap: 10, marginBottom: 25 },
  sectionKicker: { color: "#4C7DFF", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.7 },
  sectionDescription: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, maxWidth: 650 },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roleCard: { flexGrow: 1, flexBasis: "45%", minWidth: 145, borderWidth: 1, borderRadius: 15, padding: 14, gap: 7 },
  roleIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#EDF3FF", alignItems: "center", justifyContent: "center", marginBottom: 2 },
  roleLabel: { fontFamily: "Inter_700Bold", fontSize: 13 },
  roleText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  modulesSection: { width: "100%" },
  moduleList: { gap: 13 },
  moduleCard: { borderRadius: 17, borderWidth: 1, padding: 16, gap: 10 },
  moduleHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  moduleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  moduleTagWrap: { flex: 1, gap: 6 },
  moduleTag: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.3 },
  moduleLine: { width: "100%", height: 2, borderRadius: 1 },
  moduleTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 22, marginTop: 2 },
  moduleDescription: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  pointList: { gap: 7, marginTop: 2 },
  pointRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pointIcon: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pointText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16 },
  finalCta: { borderRadius: 22, padding: 24, alignItems: "center", gap: 11 },
  finalCtaBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: "#143D3A" },
  finalCtaBadgeText: { color: "#72E0C4", fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.1 },
  finalTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 23, lineHeight: 29, letterSpacing: -0.4, maxWidth: 540 },
  finalText: { color: "#AFC5E2", fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 13, lineHeight: 20, maxWidth: 520 },
  finalButton: { minHeight: 50, width: "100%", maxWidth: 460, marginTop: 5, borderRadius: 12, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  finalButtonText: { color: "#0B1F3A", fontFamily: "Inter_700Bold", fontSize: 14 },
  finalNote: { color: "#7894B9", fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
});