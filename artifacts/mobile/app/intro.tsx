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

const MODULES = [
  {
    icon: "grid" as const,
    color: "#2563EB",
    tag: "PILOTAGE",
    title: "Une vue claire de votre syndicat",
    description:
      "Retrouvez les informations importantes au même endroit et prenez vos décisions avec une vision structurée de la résidence.",
    points: [
      "Activité et alertes regroupées",
      "Accès rapide aux modules clés",
      "Informations adaptées à chaque rôle",
    ],
  },
  {
    icon: "bar-chart-2" as const,
    color: "#1D4ED8",
    tag: "FINANCE",
    title: "Des finances lisibles et suivies",
    description:
      "Organisez les charges, les appels de fonds, les paiements, les impayés et les budgets avec une traçabilité complète.",
    points: [
      "Appels de fonds et échéances",
      "Suivi des règlements et relances",
      "Budgets et rapports financiers",
    ],
  },
  {
    icon: "users" as const,
    color: "#059669",
    tag: "GOUVERNANCE",
    title: "Des assemblées mieux organisées",
    description:
      "Préparez les réunions, convoquez les participants, gérez les votes et conservez les procès-verbaux dans un même espace.",
    points: [
      "Ordre du jour et convocations",
      "Candidatures, votes et quorum",
      "Mandats et procès-verbaux",
    ],
  },
  {
    icon: "file-text" as const,
    color: "#7C3AED",
    tag: "DOCUMENTS",
    title: "Tous vos documents, au bon endroit",
    description:
      "Centralisez les documents administratifs et contractuels, suivez leur cycle de vie et facilitez les signatures.",
    points: [
      "Classement par résidence et dossier",
      "Signatures et validations multi-parties",
      "Téléchargement et archivage contrôlés",
    ],
  },
  {
    icon: "shopping-bag" as const,
    color: "#8B5CF6",
    tag: "SERVICES",
    title: "Une place de marché pour la résidence",
    description:
      "Mettez en relation les résidents, les vendeurs et les prestataires dans un environnement dédié à la copropriété.",
    points: [
      "Annonces de vente et de location",
      "Demandes de devis et partenaires",
      "Gestion des favoris et commandes",
    ],
  },
  {
    icon: "tool" as const,
    color: "#D97706",
    tag: "MAINTENANCE",
    title: "Des travaux suivis de bout en bout",
    description:
      "Transformez chaque incident ou chantier en action suivie, documentée et attribuée.",
    points: [
      "Sinistres et incidents déclarés",
      "Travaux avec responsables et statuts",
      "Pièces jointes et historique des actions",
    ],
  },
  {
    icon: "shield" as const,
    color: "#E11D48",
    tag: "RELATION RÉSIDENTS",
    title: "Les demandes ne se perdent plus",
    description:
      "Donnez un cadre clair aux réclamations, aux demandes d’intervention et aux échanges avec les résidents.",
    points: [
      "Dépôt et qualification des demandes",
      "Statuts et responsables identifiés",
      "Escalade et suivi des réponses",
    ],
  },
  {
    icon: "message-circle" as const,
    color: "#0EA5E9",
    tag: "COMMUNICATION",
    title: "Une communication qui rassemble",
    description:
      "Diffusez les annonces officielles et échangez avec les bons interlocuteurs sans mélanger les conversations.",
    points: [
      "Messagerie interne et conversations",
      "Publications et annonces de résidence",
      "Notifications et pièces jointes",
    ],
  },
  {
    icon: "globe" as const,
    color: "#6366F1",
    tag: "ADMINISTRATION",
    title: "Une organisation prête à grandir",
    description:
      "Les équipes de gestion et les administrateurs disposent d’espaces adaptés à leur périmètre et à leurs responsabilités.",
    points: [
      "Séparation des espaces et des données",
      "Équipe du syndic et rôles métier",
      "Audit, transparence et supervision",
    ],
  },
];

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
          backgroundColor: isDark ? "rgba(16, 35, 62, 0.94)" : "#FFFFFF",
          borderColor: isDark ? "rgba(130, 175, 235, 0.18)" : "#DCE8F8",
        },
      ]}
    >
      <View style={styles.moduleHeader}>
        <View style={[styles.moduleIcon, { backgroundColor: module.color }]}>
          <Feather name={module.icon} size={20} color="#FFFFFF" />
        </View>
        <View style={styles.moduleTagWrap}>
          <Text style={[styles.moduleTag, { color: module.color }]}>{module.tag}</Text>
          <View style={[styles.moduleLine, { backgroundColor: `${module.color}30` }]} />
        </View>
      </View>
      <Text style={[styles.moduleTitle, { color: isDark ? "#F8FAFF" : "#0A1628" }]}>
        {module.title}
      </Text>
      <Text style={[styles.moduleDescription, { color: isDark ? "#A8BCD8" : "#61738C" }]}>
        {module.description}
      </Text>
      <View style={styles.pointList}>
        {module.points.map((point) => (
          <View key={point} style={styles.pointRow}>
            <View style={[styles.pointIcon, { backgroundColor: `${module.color}18` }]}>
              <Feather name="check" size={12} color={module.color} />
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
  const foreground = isDark ? "#F8FAFF" : "#0A1628";
  const muted = isDark ? "#9DB3CF" : "#667991";

  const openStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/get-started");
  };

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#071326" : "#F3F7FD" }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18),
            paddingBottom: insets.bottom + 36,
          },
        ]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.replace("/welcome")}
            style={styles.iconButton}
            accessibilityLabel="Retour à l'accueil"
            testID="intro-back"
          >
            <Feather name="arrow-left" size={19} color={isDark ? "#FFFFFF" : "#1D4ED8"} />
          </TouchableOpacity>
          <Text style={styles.brandText}>SYNDYCAT GLOBAL CPS</Text>
          <TouchableOpacity onPress={() => router.replace("/get-started")} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: isDark ? "#BFD4F1" : "#2563EB" }]}>Commencer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>PLATEFORME DE GESTION IMMOBILIÈRE</Text>
          </View>
          <Text style={[styles.heroTitle, { color: foreground }]}>
            La gestion de votre résidence,{" "}
            <Text style={styles.heroAccent}>enfin réunie.</Text>
          </Text>
          <Text style={[styles.heroDescription, { color: muted }]}>
            Une plateforme complète pour les syndics, les copropriétaires, les membres du conseil syndical et les locataires.
            Un seul espace pour organiser, décider, communiquer et suivre la vie de votre résidence.
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity onPress={openStart} style={styles.primaryButton} activeOpacity={0.86} testID="intro-start">
              <Text style={styles.primaryText}>Découvrir et commencer</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.replace("/login")}
              style={[styles.loginButton, { borderColor: isDark ? "#34547E" : "#C7D9F0" }]}
              activeOpacity={0.82}
            >
              <Feather name="log-in" size={16} color={isDark ? "#BFD4F1" : "#2563EB"} />
              <Text style={[styles.loginText, { color: isDark ? "#BFD4F1" : "#2563EB" }]}>Se connecter</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.promiseCard, { backgroundColor: isDark ? "#102B4D" : "#FFFFFF", borderColor: isDark ? "#234A7D" : "#D7E6F8" }]}>
          <View style={[styles.promiseIcon, { backgroundColor: isDark ? "#173C70" : "#EAF3FF" }]}>
            <Feather name="layers" size={22} color={isDark ? "#72A9FF" : "#2563EB"} />
          </View>
          <View style={styles.promiseCopy}>
            <Text style={[styles.promiseTitle, { color: foreground }]}>Un écosystème pensé pour la copropriété</Text>
            <Text style={[styles.promiseText, { color: muted }]}>
              Des espaces dédiés à chaque profil, des accès maîtrisés et un historique pour garder le contrôle.
            </Text>
          </View>
        </View>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionKicker}>TOUT CE DONT VOUS AVEZ BESOIN</Text>
          <Text style={[styles.sectionTitle, { color: foreground }]}>Une plateforme, neuf domaines de gestion</Text>
          <Text style={[styles.sectionDescription, { color: muted }]}>
            Explorez les principales fonctions de SYNDYCAT GLOBAL CPS. Chaque domaine s’intègre dans un parcours unique, de la décision au suivi quotidien.
          </Text>
        </View>

        <View style={styles.moduleList}>
          {MODULES.map((module) => (
            <ModuleCard key={module.tag} module={module} isDark={isDark} />
          ))}
        </View>

        <View style={[styles.finalCta, { backgroundColor: isDark ? "#12386B" : "#0E2A55" }]}>
          <Feather name="check-circle" size={28} color="#69A2FF" />
          <Text style={styles.finalTitle}>Prêt à mieux piloter votre résidence ?</Text>
          <Text style={styles.finalText}>
            Créez votre espace, invitez votre équipe et commencez à centraliser votre gestion.
          </Text>
          <TouchableOpacity onPress={openStart} style={styles.finalButton} activeOpacity={0.86}>
            <Text style={styles.finalButtonText}>Créer mon espace</Text>
            <Feather name="arrow-right" size={17} color="#0A1628" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 26 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandText: { color: "#2563EB", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.1 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D7E6F8", alignItems: "center", justifyContent: "center" },
  skipButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.74)" },
  skipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  hero: { alignItems: "center", gap: 12, paddingTop: 8 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#35D39A" },
  eyebrowText: { color: "#3B82F6", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 },
  heroTitle: { fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 33, lineHeight: 40, letterSpacing: -0.8 },
  heroAccent: { color: "#3B82F6" },
  heroDescription: { fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 15, lineHeight: 23, maxWidth: 600 },
  heroActions: { width: "100%", gap: 10, marginTop: 8 },
  primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: "#2563EB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 18, shadowColor: "#2563EB", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  primaryGradient: { minHeight: 54, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  loginButton: { minHeight: 48, borderRadius: 14, borderWidth: 1.2, backgroundColor: "rgba(255,255,255,0.35)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loginText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  promiseCard: { flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderRadius: 18, padding: 15 },
  promiseIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  promiseCopy: { flex: 1, gap: 4 },
  promiseTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  promiseText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  sectionIntro: { gap: 8, marginTop: 8 },
  sectionKicker: { color: "#3B82F6", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.3 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 25, lineHeight: 31, letterSpacing: -0.5 },
  sectionDescription: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  moduleList: { gap: 14 },
  moduleCard: { borderRadius: 20, borderWidth: 1, padding: 17, gap: 11 },
  moduleHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  moduleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  moduleTagWrap: { flex: 1, gap: 7 },
  moduleTag: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2 },
  moduleLine: { width: "100%", height: 2, borderRadius: 1 },
  moduleTitle: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 23 },
  moduleDescription: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
  pointList: { gap: 8, marginTop: 2 },
  pointRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  pointIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  pointText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17 },
  finalCta: { borderRadius: 22, padding: 22, alignItems: "center", gap: 9, marginTop: 4 },
  finalTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", textAlign: "center", fontSize: 21, lineHeight: 27 },
  finalText: { color: "#AFC5E2", fontFamily: "Inter_400Regular", textAlign: "center", fontSize: 13, lineHeight: 20 },
  finalButton: { minHeight: 48, width: "100%", marginTop: 7, borderRadius: 13, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  finalButtonText: { color: "#0A1628", fontFamily: "Inter_700Bold", fontSize: 14 },
});