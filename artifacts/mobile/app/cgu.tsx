import { Feather } from "@expo/vector-icons";
import ScreenHeader from "@/components/ScreenHeader";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import LegalLanguageNotice from "@/components/LegalLanguageNotice";
import { apiRequest } from "@/lib/api";

/** Version identifier stored with each acceptance (change it with the text). */
const CGU_VERSION = "2026-10-21";

// Version de travail, à faire valider par un juriste. La version précédente
// visait les « syndicats professionnels » (Dahir 1-57-119, Code du travail) :
// un autre produit. MIZAN sert la gestion des copropriétés (loi 18-00).
const CGU_SECTIONS = [
  {
    title: "1. Objet et champ d'application",
    icon: "file-text" as const,
    color: "#5A4AD6",
    content: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme MIZAN (ci-après « la Plateforme »).

La Plateforme est un logiciel de gestion de copropriétés. Elle est destinée aux syndicats des copropriétaires, à leurs syndics (professionnels ou bénévoles), aux membres de leurs conseils syndicaux, aux copropriétaires et aux locataires qu'ils y invitent.

En accédant à la Plateforme, vous acceptez les présentes CGU.`,
  },
  {
    title: "2. Cadre légal de la copropriété",
    icon: "home" as const,
    color: "#5A4AD6",
    content: `La gestion d'une copropriété au Maroc relève de la loi n° 18-00 relative au statut de la copropriété des immeubles bâtis, modifiée et complétée notamment par la loi n° 106-12.

Les décisions de la copropriété (budget, travaux, désignation du syndic, règlement) sont prises par l'assemblée générale des copropriétaires selon les règles de cette loi et du règlement de copropriété. La Plateforme est un outil : elle ne remplace ni l'assemblée générale, ni le syndic, ni le règlement de copropriété.`,
  },
  {
    title: "3. Rôle de la Plateforme",
    icon: "briefcase" as const,
    color: "#13976C",
    content: `La Plateforme aide le syndic et le conseil syndical à tenir la comptabilité de la copropriété, émettre les appels de fonds, suivre les paiements, organiser les assemblées et conserver les documents.

Les fonds de la copropriété sont versés sur le compte bancaire du syndicat des copropriétaires. MIZAN ne reçoit ni ne détient ces fonds.

Les règles de majorité, de quorum, de délais de convocation et de procuration affichées par la Plateforme sont des aides : leur conformité à la loi et au règlement de copropriété reste sous la responsabilité du syndic.`,
  },
  {
    title: "4. Protection des données — Loi 09-08",
    icon: "lock" as const,
    color: "#C98511",
    content: `En vertu de la loi n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel (les formalités auprès de la CNDP relèvent de l'exploitant) :

Données traitées :
• Identité et coordonnées (nom, téléphone, e-mail)
• Lots détenus ou occupés, quotes-parts
• Appels de fonds, paiements et justificatifs
• Données de connexion (adresse IP, horodatage)

Finalités du traitement :
• Gestion de la copropriété et de sa comptabilité
• Émission des appels de fonds et suivi des paiements
• Organisation des assemblées générales et des votes
• Communication entre le syndic, le conseil syndical et les résidents

Droits des personnes :
• Droit d'accès à vos données personnelles
• Droit de rectification des données inexactes
• Droit d'opposition au traitement
• Droit à l'effacement (sous réserve des obligations légales de conservation)

Pour exercer vos droits, contactez l'exploitant de la Plateforme ou le syndic de votre copropriété.`,
  },
  {
    title: "5. Signature électronique — Loi 53-05",
    icon: "pen-tool" as const,
    color: "#C2456E",
    content: `Lorsqu'un document est signé sur la Plateforme, MIZAN enregistre l'identité du signataire, la date et l'empreinte SHA-256 du document, qui permet de vérifier qu'il n'a pas été modifié.

La Plateforme ne délivre pas de certificat électronique émis par un prestataire agréé et n'utilise pas d'horodatage qualifié. La valeur juridique d'une signature réalisée sur la Plateforme, au regard de la loi n° 53-05, doit être appréciée par un juriste.`,
  },
  {
    title: "6. Responsabilités et obligations des utilisateurs",
    icon: "users" as const,
    color: "#5A4AD6",
    content: `En utilisant la Plateforme, vous vous engagez à :

• Fournir des informations exactes et à jour
• Ne pas usurper l'identité d'une autre personne
• Respecter la confidentialité des informations de la copropriété
• Ne pas partager vos identifiants de connexion
• Signaler tout accès non autorisé à votre compte
• Utiliser la Plateforme uniquement pour la gestion de la copropriété
• Respecter les droits des autres membres et utilisateurs

Toute violation de ces obligations peut entraîner la suspension ou la suppression de votre compte, sans préjudice des poursuites judiciaires éventuelles.`,
  },
  {
    title: "7. Sécurité et confidentialité",
    icon: "shield" as const,
    color: "#C8323C",
    content: `MIZAN met en œuvre les mesures techniques et organisationnelles suivantes pour protéger vos données :

• Connexion chiffrée (HTTPS) entre l'application et le serveur
• Mots de passe stockés uniquement sous forme de hachage
• Contrôle d'accès par rôle et par copropriété, vérifié par le serveur
• Liens temporaires pour le téléchargement des documents privés
• Journal d'audit des actions sensibles

L'authentification à deux facteurs n'est pas encore disponible. Les modalités de notification en cas de violation de données seront précisées par l'exploitant.`,
  },
  {
    title: "8. Durée et résiliation",
    icon: "calendar" as const,
    color: "#1F8A9A",
    content: `Le présent accord est conclu pour une durée indéterminée, à compter de votre première connexion à la Plateforme.

Il peut être résilié :
• Par l'utilisateur : en contactant l'administrateur de votre syndicat ou l'exploitant de la Plateforme
• Par MIZAN : en cas de violation des CGU, après notification préalable

Après la résiliation, vos données personnelles sont supprimées ou anonymisées sur demande, à l'exception des données que la copropriété doit conserver (écritures comptables, paiements, procès-verbaux).`,
  },
  {
    title: "9. Modifications des CGU",
    icon: "edit" as const,
    color: "#1F8A9A",
    content: `MIZAN se réserve le droit de modifier les présentes CGU à tout moment. Les modifications entrent en vigueur :

• Dès leur publication pour les mises à jour mineures
• Après notification et délai de 30 jours pour les modifications substantielles

Vous serez informé de toute modification par notification in-app et par email. La poursuite de l'utilisation de la Plateforme après ce délai vaut acceptation des nouvelles CGU.`,
  },
  {
    title: "10. Droit applicable et juridiction compétente",
    icon: "award" as const,
    color: "#C98511",
    content: `Les présentes CGU sont régies par le droit marocain. Tout litige relatif à leur interprétation ou exécution sera soumis :

1. Prioritairement à une procédure de médiation amiable
2. À défaut d'accord, aux tribunaux compétents de Casablanca, Maroc

Version de travail — à valider par un juriste
Contact : l'exploitant de la Plateforme (coordonnées à préciser)`,
  },
];

export default function CguScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [scrollProgress, setScrollProgress] = useState(0);
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  // Date of the acceptance recorded by the server for this version, if any.
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accepted = acceptedAt !== null;

  useEffect(() => {
    if (!user) return;
    apiRequest<{ data: { document: string; version: string; acceptedAt: string }[] }>("/me/terms-acceptances")
      .then((r) => {
        const row = (r.data ?? []).find((x) => x.document === "cgu" && x.version === CGU_VERSION);
        if (row) setAcceptedAt(row.acceptedAt);
      })
      .catch(() => {});
  }, [user?.id]);
  const [expandedSection, setExpandedSection] = useState<number | null>(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

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
      Alert.alert(t("cguReadRequired"), t("cguReadRequiredMsg"));
      return;
    }
    if (accepted || saving) return;
    Alert.alert(t("cguConfirmTitle"), t("cguConfirmMsg"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        onPress: async () => {
          setSaving(true);
          try {
            // Only the server's answer counts as an acceptance.
            const r = await apiRequest<{ data: { acceptedAt: string } }>("/me/terms-acceptances", "POST", { document: "cgu", version: CGU_VERSION });
            setAcceptedAt(r.data.acceptedAt);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert(t("error"), t("cguAcceptFailed"));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };


  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("cguLabel")} subtitle={t("legalDraftSubtitle")} />

      {/* Scroll progress bar */}
      <View style={[styles.progressWrap, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { width: `${scrollProgress}%` as any, backgroundColor: scrollProgress >= 80 ? colors.success : colors.primary }]} />
      </View>

      {!canAccept && (
        <View style={[styles.readBanner, { backgroundColor: colors.warning + "18", borderBottomColor: colors.warning + "30" }]}>
          <Feather name="alert-circle" size={14} color={colors.warning} />
          <Text style={[styles.readBannerText, { color: colors.warning }]}>
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
        <LegalLanguageNotice />
        {/* Legal compliance badges */}
        <View style={styles.badgesRow}>
          {[
            // Texts referred to; not a statement of compliance.
            { label: "Loi 18-00 (copropriété)", color: "#5A4AD6" },
            { label: "Loi 09-08 (données personnelles)", color: "#5A4AD6" },
            { label: "Loi 53-05 (échanges électroniques)", color: colors.warning },
          ].map((b) => (
            <View key={b.label} style={[styles.legalBadge, { backgroundColor: b.color + "15", borderColor: b.color + "30" }]}>
              <Feather name="book" size={9} color={b.color} />
              <Text style={[styles.legalBadgeText, { color: b.color }]}>{b.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.introCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="info" size={18} color={colors.primary} />
          <Text style={[styles.introText, { color: colors.mutedForeground }]}>
            Ces CGU régissent l'utilisation de MIZAN. Version de travail : ce texte doit être validé par un juriste marocain avant la mise en production.
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
        {!user ? null : accepted ? (
          <View style={[styles.acceptedBadge, { backgroundColor: colors.success + "15" }]}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text style={[styles.acceptedText, { color: colors.success }]}>
              {t("cguAcceptedOn").replace("{date}", new Date(acceptedAt!).toLocaleDateString(lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-MA", { day: "numeric", month: "long", year: "numeric" }))}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: canAccept ? colors.primary : colors.muted }]}
            onPress={handleAccept}
            activeOpacity={canAccept ? 0.85 : 1}
          >
            <Feather name={canAccept ? "check-circle" : "arrow-down"} size={18} color={canAccept ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.acceptBtnText, { color: canAccept ? "#fff" : colors.mutedForeground }]}>
              {saving ? t("saving") : canAccept ? t("cguAcceptBtn") : t("cguKeepReading").replace("{pct}", String(scrollProgress))}
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
  title: { fontSize: 20, fontFamily: "Fraunces_600SemiBold" },
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
