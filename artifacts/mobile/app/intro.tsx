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

const PREVIEWS: Record<
  string,
  {
    metrics: [string, string];
    rows: [string, string];
  }
> = {
  PILOTAGE: {
    metrics: ["Décisions", "Alertes"],
    rows: ["Activité de la résidence", "Actions prioritaires"],
  },
  FINANCE: {
    metrics: ["Appels de fonds", "Règlements"],
    rows: ["Échéances et paiements", "Budgets par poste"],
  },
  GOUVERNANCE: {
    metrics: ["Assemblées", "Votes"],
    rows: ["Ordre du jour", "Quorum et résultats"],
  },
  DOCUMENTS: {
    metrics: ["Dossiers", "Signatures"],
    rows: ["Documents récents", "Validations en attente"],
  },
  SERVICES: {
    metrics: ["Prestataires", "Demandes"],
    rows: ["Offres de la résidence", "Devis et partenaires"],
  },
  MAINTENANCE: {
    metrics: ["Interventions", "Chantiers"],
    rows: ["Incidents signalés", "Suivi des travaux"],
  },
  "RELATION RÉSIDENTS": {
    metrics: ["Demandes", "Réponses"],
    rows: ["Réclamations ouvertes", "Suivi des interventions"],
  },
  COMMUNICATION: {
    metrics: ["Annonces", "Échanges"],
    rows: ["Publications officielles", "Conversations ciblées"],
  },
  ADMINISTRATION: {
    metrics: ["Équipes", "Accès"],
    rows: ["Rôles et responsabilités", "Audit et transparence"],
  },
};

function DashboardMini({
  module,
  colors,
}: {
  module: (typeof MODULES)[number];
  colors: ReturnType<typeof useColors>;
}) {
  const preview = PREVIEWS[module.tag] ?? PREVIEWS.PILOTAGE;

  return (
    <View style={[styles.dashboardPreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.dashboardHeader}>
        <View style={[styles.dashboardMark, { backgroundColor: module.color }]}>
          <Feather name={module.icon} size={13} color="#FFFFFF" />
        </View>
        <View style={styles.dashboardHeaderCopy}>
          <Text style={[styles.dashboardEyebrow, { color: module.color }]}>APERÇU DE VUE</Text>
          <Text style={[styles.dashboardHeading, { color: colors.foreground }]}>Tableau {module.tag.toLowerCase()}</Text>
        </View>
        <View style={[styles.dashboardMenu, { backgroundColor: colors.secondary }]}>
          <Feather name="more-horizontal" size={15} color={colors.mutedForeground} />
        </View>
      </View>

      <View style={styles.dashboardMetrics}>
        {preview.metrics.map((metric, index) => (
          <View key={metric} style={[styles.dashboardMetric, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.dashboardMetricLabel, { color: colors.mutedForeground }]}>{metric}</Text>
            <View style={styles.dashboardMetricBottom}>
              <Text style={[styles.dashboardMetricValue, { color: colors.foreground }]}>Aperçu</Text>
              <View style={[styles.dashboardMetricBar, { backgroundColor: index === 0 ? module.color : colors.accent }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.dashboardList, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {preview.rows.map((row, index) => (
          <View
            key={row}
            style={[
              styles.dashboardRow,
              index === 1 && [styles.dashboardRowSecond, { borderTopColor: colors.border }],
            ]}
          >
            <View style={[styles.dashboardRowDot, { backgroundColor: index === 0 ? module.color : colors.success }]} />
            <Text style={[styles.dashboardRowText, { color: colors.foreground }]}>{row}</Text>
            <Feather name="arrow-up-right" size={13} color={colors.mutedForeground} />
          </View>
        ))}
      </View>
    </View>
  );
}

function ServiceLine({
  module,
  index,
  colors,
}: {
  module: (typeof MODULES)[number];
  index: number;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.serviceBlock,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.serviceMeta}>
        <View style={[styles.serviceNumber, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.serviceNumberText, { color: module.color }]}>
            {String(index + 1).padStart(2, "0")}
          </Text>
        </View>
        <View style={styles.serviceCopy}>
          <Text style={[styles.moduleTag, { color: module.color }]}>{module.tag}</Text>
          <Text style={[styles.moduleTitle, { color: colors.cardForeground }]}>{module.title}</Text>
          <Text style={[styles.moduleDescription, { color: colors.mutedForeground }]}>{module.description}</Text>
        </View>
      </View>
      <DashboardMini module={module} colors={colors} />
    </View>
  );
}

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggle } = useTheme();
  const colors = useColors();
  const foreground = colors.foreground;
  const muted = colors.mutedForeground;

  const openStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/get-started");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Platform.OS === "web" ? 67 : insets.top, paddingBottom: insets.bottom + 40 }}
      >
        <View style={[styles.hero, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 0 : 16 }]}>
            <MizanLogo variant="horizontal" colorScheme={isDark ? "dark" : "light"} size={38} showTagline={false} />
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.replace("/login")}
                style={[styles.topCta, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.topCtaText, { color: colors.primaryForeground }]}>Se connecter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="intro-theme-toggle"
                onPress={toggle}
                style={[styles.themeButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
              >
                <Feather name={isDark ? "sun" : "moon"} size={17} color={colors.foreground} />
                <Text style={[styles.themeLabel, { color: colors.foreground }]}>{isDark ? "Clair" : "Sombre"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroEyebrowText, { color: colors.success }]}>LA COPROPRIÉTÉ, ENFIN CONNECTÉE</Text>
            <Text style={[styles.heroTitle, { color: foreground }]}>
              La gestion de votre résidence{"\n"}
              <Text style={[styles.heroTitleAccent, { color: colors.primary }]}>mérite un espace à sa hauteur.</Text>
            </Text>
            <Text style={[styles.heroDescription, { color: muted }]}>
              MIZAN réunit les décisions, les finances, les documents et les échanges dans une seule expérience.
            </Text>
            <TouchableOpacity onPress={openStart} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Découvrir la plateforme</Text>
              <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.pageSection, { backgroundColor: colors.background }]}>
          <Text style={[styles.sectionKicker, { color: colors.primary }]}>TOUT CE DONT VOUS AVEZ BESOIN</Text>
          <Text style={[styles.sectionTitle, { color: foreground }]}>Neuf domaines.{"\n"}Un parcours cohérent.</Text>
          <Text style={[styles.sectionDescription, { color: muted }]}>
            De la première décision au suivi quotidien, chaque fonction trouve sa place dans le même environnement.
          </Text>
          {MODULES.map((module, index) => (
            <ServiceLine key={module.tag} module={module} index={index} colors={colors} />
          ))}
        </View>
        <View style={[styles.pageSection, { backgroundColor: colors.background }]}>
          <View style={[styles.finalCta, { backgroundColor: colors.primary }]}>
            <Text style={[styles.finalTitle, { color: colors.primaryForeground }]}>Votre résidence peut fonctionner autrement.</Text>
            <Text style={[styles.finalText, { color: colors.primaryForeground }]}>Créez votre espace et donnez à chaque personne la bonne information, au bon moment.</Text>
            <TouchableOpacity onPress={openStart} style={[styles.finalButton, { backgroundColor: colors.card }]}>
              <Text style={[styles.finalButtonText, { color: colors.primary }]}>Créer mon espace</Text>
              <Feather name="arrow-right" size={17} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingHorizontal: 20, paddingBottom: 42, borderBottomWidth: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  topCta: { minHeight: 38, borderRadius: 10, paddingHorizontal: 13, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  topCtaText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  themeButton: { minWidth: 38, height: 38, borderRadius: 19, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  themeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  heroCopy: { alignItems: "center", paddingTop: 52, gap: 16 },
  heroEyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#72E0C4" },
  heroEyebrowText: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.7 },
  heroTitle: { fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 30, lineHeight: 37, letterSpacing: -0.8 },
  heroTitleAccent: {},
  heroDescription: { fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 14, lineHeight: 22, maxWidth: 580 },
  primaryButton: { minHeight: 54, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 18 },
  primaryText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  pageSection: { paddingHorizontal: 20, paddingVertical: 48, maxWidth: 1100, width: "100%", alignSelf: "center" },
  sectionKicker: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.5 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.7 },
  sectionDescription: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, maxWidth: 650 },
  serviceBlock: { borderRadius: 20, borderWidth: 1, padding: 14, marginTop: 14 },
  serviceMeta: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  serviceNumber: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  serviceNumberText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  serviceCopy: { flex: 1, gap: 5 },
  moduleTag: { fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.3 },
  moduleTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 22, marginTop: 2 },
  moduleDescription: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  dashboardPreview: { borderWidth: 1, borderRadius: 16, padding: 10, marginTop: 14, gap: 9 },
  dashboardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dashboardMark: { width: 29, height: 29, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  dashboardHeaderCopy: { flex: 1, gap: 2 },
  dashboardEyebrow: { fontFamily: "Inter_700Bold", fontSize: 7, letterSpacing: 1.1 },
  dashboardHeading: { fontFamily: "Inter_700Bold", fontSize: 11 },
  dashboardMenu: { width: 27, height: 27, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dashboardMetrics: { flexDirection: "row", gap: 8 },
  dashboardMetric: { flex: 1, minHeight: 47, borderRadius: 10, borderWidth: 1, padding: 8, justifyContent: "space-between" },
  dashboardMetricLabel: { fontFamily: "Inter_600SemiBold", fontSize: 8 },
  dashboardMetricBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  dashboardMetricValue: { fontFamily: "Inter_700Bold", fontSize: 9 },
  dashboardMetricBar: { width: 27, height: 5, borderRadius: 3 },
  dashboardList: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 9 },
  dashboardRow: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 7 },
  dashboardRowSecond: { borderTopWidth: 1 },
  dashboardRowDot: { width: 7, height: 7, borderRadius: 4 },
  dashboardRowText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 9 },
  finalCta: { borderRadius: 22, padding: 24, alignItems: "center", gap: 11 },
  finalTitle: { fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 23, lineHeight: 29, letterSpacing: -0.4, maxWidth: 540 },
  finalText: { fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 13, lineHeight: 20, maxWidth: 520 },
  finalButton: { minHeight: 50, width: "100%", maxWidth: 460, marginTop: 5, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  finalButtonText: { fontFamily: "Inter_700Bold", fontSize: 14 },
});