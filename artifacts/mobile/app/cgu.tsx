import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
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

const CGU_SECTIONS = [
  {
    title: "1. Objet et champ d'application",
    icon: "file-text" as const,
    color: "#2563EB",
    content: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme MIZAN (ci-après « la Plateforme »), développée conformément aux lois marocaines en vigueur.

La Plateforme est destinée aux syndicats professionnels légalement constitués, à leurs administrateurs et à leurs membres, dans le respect du Dahir n° 1-57-119 du 16 juillet 1957 relatif à l'exercice du droit syndical.

En accédant à la Plateforme, vous acceptez sans réserve les présentes CGU dans leur intégralité.`,
  },
  {
    title: "2. Liberté syndicale — Dahir 1-57-119",
    icon: "shield" as const,
    color: "#3b82f6",
    content: `Conformément au Dahir n° 1-57-119 du 16 juillet 1957 portant reconnaissance du droit syndical, la Plateforme garantit :

• Le libre exercice du droit syndical pour tous les travailleurs marocains
• La constitution libre de syndicats professionnels
• L'indépendance des organisations syndicales vis-à-vis des pouvoirs publics
• La protection des représentants syndicaux dans l'exercice de leurs fonctions

L'utilisation de la Plateforme ne peut en aucun cas porter atteinte aux droits fondamentaux reconnus par ce Dahir fondateur du syndicalisme marocain.`,
  },
  {
    title: "3. Conformité Code du Travail — Loi 65-99",
    icon: "briefcase" as const,
    color: "#10b981",
    content: `La Plateforme est développée en conformité avec la Loi n° 65-99 portant Code du Travail, notamment les dispositions relatives à :

• La représentation syndicale dans l'entreprise (Art. 425-459)
• Les délégués syndicaux et leurs attributions (Art. 463-480)
• Les conventions collectives (Art. 104-134)
• Les élections professionnelles (Art. 430-450)
• Les heures de délégation et congés de formation syndicale (Art. 455)

Les fonctionnalités de la Plateforme relatives à la gestion des élections, des conventions et des délégations sont conçues pour respecter scrupuleusement ces dispositions légales.`,
  },
  {
    title: "4. Protection des données — Loi 09-08 & CNDP",
    icon: "lock" as const,
    color: "#f59e0b",
    content: `En vertu de la Loi n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel, et conformément aux directives de la Commission Nationale de contrôle de la protection des Données à caractère Personnel (CNDP) :

Données collectées :
• Identité (nom, prénom, photo)
• Coordonnées professionnelles et personnelles
• Données de connexion (IP, horodatage)
• Historique des activités sur la Plateforme

Finalités du traitement :
• Gestion de l'adhésion syndicale
• Traitement des cotisations
• Organisation des élections
• Communication syndicale interne

Droits des personnes :
• Droit d'accès à vos données personnelles
• Droit de rectification des données inexactes
• Droit d'opposition au traitement
• Droit à l'effacement (sous conditions légales)

 Pour exercer vos droits, contactez le Délégué à la Protection des Données (DPD) à : dpo@mizan.ma`,
  },
  {
    title: "5. Signature électronique — Loi 53-05",
    icon: "pen-tool" as const,
    color: "#ec4899",
    content: `Conformément à la Loi n° 53-05 relative à l'échange électronique de données juridiques, les signatures électroniques apposées via la Plateforme :

• Ont la même valeur juridique qu'une signature manuscrite lorsqu'elles sont certifiées
• Sont horodatées par une Autorité de Certification accréditée
• Sont conservées pendant la durée légale applicable
• Peuvent être utilisées comme preuve devant les juridictions marocaines

Les documents signés électroniquement via MIZAN sont générés avec un hash SHA-256 garantissant leur intégrité.`,
  },
  {
    title: "6. Responsabilités et obligations des utilisateurs",
    icon: "users" as const,
    color: "#6366f1",
    content: `En utilisant la Plateforme, vous vous engagez à :

• Fournir des informations exactes et à jour
• Ne pas usurper l'identité d'une autre personne
• Respecter la confidentialité des informations syndicales
• Ne pas partager vos identifiants de connexion
• Signaler tout accès non autorisé à votre compte
• Utiliser la Plateforme uniquement à des fins syndicales légitimes
• Respecter les droits des autres membres et utilisateurs

Toute violation de ces obligations peut entraîner la suspension ou la suppression de votre compte, sans préjudice des poursuites judiciaires éventuelles.`,
  },
  {
    title: "7. Sécurité et confidentialité",
    icon: "shield" as const,
    color: "#ef4444",
    content: `MIZAN met en œuvre les mesures techniques et organisationnelles suivantes pour protéger vos données :

• Chiffrement AES-256 des données sensibles au repos
• Protocole TLS 1.3 pour les transmissions
• Authentification à deux facteurs (2FA) disponible
• Journalisation des accès et des modifications
• Sauvegardes quotidiennes chiffrées
• Tests de pénétration trimestriels
• Conformité SOC 2 Type II

En cas de violation de données, vous serez notifié dans les 72 heures conformément aux obligations légales.`,
  },
  {
    title: "8. Durée et résiliation",
    icon: "calendar" as const,
    color: "#8b5cf6",
    content: `Le présent accord est conclu pour une durée indéterminée, à compter de votre première connexion à la Plateforme.

Il peut être résilié :
• Par l'utilisateur : en contactant l'administrateur de votre syndicat ou en cliquant sur "Supprimer mon compte" dans les paramètres
• Par MIZAN : en cas de violation des CGU, après notification préalable de 15 jours

La résiliation entraîne la suppression de vos données personnelles dans un délai de 30 jours, sous réserve des obligations légales de conservation.`,
  },
  {
    title: "9. Modifications des CGU",
    icon: "edit" as const,
    color: "#06b6d4",
    content: `MIZAN se réserve le droit de modifier les présentes CGU à tout moment. Les modifications entrent en vigueur :

• Dès leur publication pour les mises à jour mineures
• Après notification et délai de 30 jours pour les modifications substantielles

Vous serez informé de toute modification par notification in-app et par email. La poursuite de l'utilisation de la Plateforme après ce délai vaut acceptation des nouvelles CGU.`,
  },
  {
    title: "10. Droit applicable et juridiction compétente",
    icon: "award" as const,
    color: "#f97316",
    content: `Les présentes CGU sont régies par le droit marocain. Tout litige relatif à leur interprétation ou exécution sera soumis :

1. Prioritairement à une procédure de médiation amiable
2. À défaut d'accord, aux tribunaux compétents de Casablanca, Maroc

Version des CGU : 2.0 — En vigueur depuis le 1er Juin 2026
Responsable du traitement : MIZAN Community OS SARL
Siège social : Casablanca, Maroc
Contact DPD : dpo@mizan.ma`,
  },
];

export default function CguScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [expandedSection, setExpandedSection] = useState<number | null>(0);
  const scrollRef = useRef<ScrollView>(null);

  const canAccept = scrollProgress >= 80;

  const handleScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrolled = contentOffset.y;
    const total = contentSize.height - layoutMeasurement.height;
    const pct = total > 0 ? Math.min(100, Math.round((scrolled / total) * 100)) : 0;
    setScrollProgress(pct);
  };

  const handleAccept = () => {
    if (!canAccept) {
      Alert.alert("Lecture requise", "Veuillez lire l'intégralité des CGU avant d'accepter (faites défiler jusqu'en bas).");
      return;
    }
    if (!accepted) {
      Alert.alert("Confirmation", "Confirmez-vous l'acceptation des Conditions Générales d'Utilisation de MIZAN ?", [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: () => {
            setAccepted(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("CGU acceptées", `Acceptation enregistrée le ${new Date().toLocaleDateString("fr-MA", { day: "numeric", month: "long", year: "numeric" })}.`, [
              { text: "Continuer", onPress: () => router.back() },
            ]);
          },
        },
      ]);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Conditions Générales</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Conformité légale marocaine</Text>
        </View>
        <View style={[styles.versionBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.versionText, { color: colors.primary }]}>v2.0</Text>
        </View>
      </View>

      {/* Scroll progress bar */}
      <View style={[styles.progressWrap, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { width: `${scrollProgress}%` as any, backgroundColor: scrollProgress >= 80 ? "#10b981" : colors.primary }]} />
        <View style={[styles.progressLabel, { right: 8 }]}>
          <Text style={[styles.progressText, { color: scrollProgress >= 80 ? "#10b981" : colors.primary }]}>
            {scrollProgress}% lu
          </Text>
        </View>
      </View>

      {!canAccept && (
        <View style={[styles.readBanner, { backgroundColor: "#f59e0b18", borderBottomColor: "#f59e0b30" }]}>
          <Feather name="alert-circle" size={14} color="#f59e0b" />
          <Text style={[styles.readBannerText, { color: "#f59e0b" }]}>
            Lisez jusqu'en bas pour pouvoir accepter les CGU
          </Text>
        </View>
      )}

      {/* Legal badges */}
      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Legal compliance badges */}
        <View style={styles.badgesRow}>
          {[
            { label: "Dahir 1-57-119", color: "#2563EB" },
            { label: "Code Travail 65-99", color: "#3b82f6" },
            { label: "Loi 09-08 CNDP", color: "#10b981" },
            { label: "Loi 53-05", color: "#f59e0b" },
          ].map((b) => (
            <View key={b.label} style={[styles.legalBadge, { backgroundColor: b.color + "15", borderColor: b.color + "30" }]}>
              <Feather name="check" size={9} color={b.color} />
              <Text style={[styles.legalBadgeText, { color: b.color }]}>{b.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.introCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="info" size={18} color={colors.primary} />
          <Text style={[styles.introText, { color: colors.mutedForeground }]}>
            Ces CGU constituent un accord légalement contraignant entre vous et MIZAN. Elles ont été rédigées en conformité avec le droit marocain en vigueur au 1er juin 2026.
          </Text>
        </View>

        {CGU_SECTIONS.map((section, i) => {
          const isExpanded = expandedSection === i;
          return (
            <View key={i} style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => { setExpandedSection(isExpanded ? null : i); Haptics.selectionAsync(); }}
              >
                <View style={[styles.sectionIcon, { backgroundColor: section.color + "18" }]}>
                  <Feather name={section.icon} size={14} color={section.color} />
                </View>
                <Text style={[styles.sectionTitle, { color: colors.foreground, flex: 1 }]}>{section.title}</Text>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
              {isExpanded && (
                <View style={[styles.sectionBody, { borderTopColor: colors.border }]}>
                  <Text style={[styles.sectionContent, { color: colors.foreground }]}>{section.content}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Signature block */}
        <View style={[styles.signatureBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.signTitle, { color: colors.foreground }]}>Acceptation</Text>
          <Text style={[styles.signText, { color: colors.mutedForeground }]}>
            En cliquant sur "Accepter", vous reconnaissez avoir lu et compris l'intégralité des présentes CGU, et vous vous engagez à les respecter.
          </Text>
          <View style={styles.signMeta}>
            <View style={styles.signMetaRow}>
              <Feather name="calendar" size={13} color={colors.mutedForeground} />
              <Text style={[styles.signMetaText, { color: colors.mutedForeground }]}>
                {new Date().toLocaleDateString("fr-MA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </View>
            <View style={styles.signMetaRow}>
              <Feather name="tag" size={13} color={colors.mutedForeground} />
              <Text style={[styles.signMetaText, { color: colors.mutedForeground }]}>Version 2.0 — CGU MIZAN</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer accept */}
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        {accepted ? (
          <View style={[styles.acceptedBadge, { backgroundColor: "#10b98115" }]}>
            <Feather name="check-circle" size={18} color="#10b981" />
            <Text style={[styles.acceptedText, { color: "#10b981" }]}>CGU acceptées — Merci !</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: canAccept ? colors.primary : colors.muted }]}
            onPress={handleAccept}
            activeOpacity={canAccept ? 0.85 : 1}
          >
            <Feather name={canAccept ? "check-circle" : "arrow-down"} size={18} color={canAccept ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.acceptBtnText, { color: canAccept ? "#fff" : colors.mutedForeground }]}>
              {canAccept ? "Accepter les CGU" : `Continuez à lire (${scrollProgress}%)...`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  versionBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  versionText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  progressWrap: { height: 6, position: "relative" },
  progressFill: { height: "100%", borderRadius: 0 },
  progressLabel: { position: "absolute", top: -18 },
  progressText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  readBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, paddingHorizontal: 16, borderBottomWidth: 1 },
  readBannerText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  legalBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  legalBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  introCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  introText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionBody: { borderTopWidth: 1, padding: 16 },
  sectionContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
  signatureBlock: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  signTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  signText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  signMeta: { gap: 6 },
  signMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  signMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 14, alignItems: "center" },
  acceptBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  acceptBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  acceptedBadge: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16 },
  acceptedText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
