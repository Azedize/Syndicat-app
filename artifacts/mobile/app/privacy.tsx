/**
 * MIZAN — Politique de Confidentialité
 */
import ScreenHeader from "@/components/ScreenHeader";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import LegalLanguageNotice from "@/components/LegalLanguageNotice";
import { CONTACT } from "@/constants/contact";
import { useLanguage } from "@/context/LanguageContext";

function Section({ title, children, isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: isDark ? "#C9BEFF" : "#5A4AD6" }]}>{title}</Text>
      {children}
    </View>
  );
}
function P({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return <Text style={[s.para, { color: isDark ? "rgba(232,240,254,0.75)" : "#3A3652" }]}>{children}</Text>;
}
function Li({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={s.liRow}>
      <View style={[s.bullet, { backgroundColor: isDark ? "#5A4AD6" : "#5A4AD6" }]} />
      <Text style={[s.liText, { color: isDark ? "rgba(232,240,254,0.75)" : "#3A3652" }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const bg = isDark ? "#0E0C1C" : "#F7F4EE";
  const card = isDark ? "#17142B" : "#fff";
  const fg = isDark ? "#EEEBFC" : "#120F2C";
  const muted = isDark ? "rgba(232,240,254,0.45)" : "#6A6680";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(37,99,235,0.1)";

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <ScreenHeader title={t("privacyPolicy")} subtitle={`${t("legalDraftSubtitle")} · 09-08`} />

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <LegalLanguageNotice />

        <View style={[s.legalBadge, { backgroundColor: "#13976C15", borderColor: "#13976C30" }]}>
          <Feather name="lock" size={14} color="#13976C" />
          <Text style={[s.legalBadgeText, { color: isDark ? "#7FE3B8" : "#13976C" }]}>
            MIZAN protège vos données personnelles. Ce texte est en cours de validation juridique (loi marocaine 09-08).
          </Text>
        </View>

        <Section title="1. Responsable du traitement" isDark={isDark}>
          <P isDark={isDark}>
            Le responsable du traitement de vos données personnelles est {CONTACT.legalEntity ?? "[raison sociale de l'exploitant — à compléter]"}. Contact protection des données : {CONTACT.privacyEmail ?? "[adresse à compléter]"}
          </P>
        </Section>

        <Section title="2. Données collectées" isDark={isDark}>
          <P isDark={isDark}>Dans le cadre de l'utilisation de la plateforme, nous collectons les données suivantes :</P>
          <P isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Données d'identification :</Text></P>
          <Li isDark={isDark}>Nom et prénom</Li>
          <Li isDark={isDark}>Adresse email</Li>
          <Li isDark={isDark}>Numéro de téléphone</Li>
          <Li isDark={isDark}>Photographie de profil (optionnel)</Li>
          <P isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Données professionnelles :</Text></P>
          <Li isDark={isDark}>Informations sur le syndicat géré</Li>
          <Li isDark={isDark}>Documents de copropriété</Li>
          <Li isDark={isDark}>Données financières (charges, paiements)</Li>
          <P isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Données techniques :</Text></P>
          <Li isDark={isDark}>Adresse IP et données de connexion</Li>
          <Li isDark={isDark}>Journaux d'activité et d'audit</Li>
          <Li isDark={isDark}>Données de navigation et d'utilisation</Li>
        </Section>

        <Section title="3. Finalités du traitement" isDark={isDark}>
          <P isDark={isDark}>Vos données sont utilisées pour :</P>
          <Li isDark={isDark}>Créer et gérer votre compte utilisateur</Li>
          <Li isDark={isDark}>Fournir les services de gestion de syndicat</Li>
          <Li isDark={isDark}>Traiter les paiements et émettre les factures</Li>
          <Li isDark={isDark}>Envoyer des notifications et communications de service</Li>
          <Li isDark={isDark}>Améliorer la plateforme et corriger les anomalies</Li>
          <Li isDark={isDark}>Respecter nos obligations légales et réglementaires</Li>
          <Li isDark={isDark}>Prévenir la fraude et assurer la sécurité de la plateforme</Li>
        </Section>

        <Section title="4. Base légale du traitement" isDark={isDark}>
          <P isDark={isDark}>Selon les cas, le traitement de vos données repose sur :</P>
          <Li isDark={isDark}>L'exécution du contrat d'abonnement vous liant à MIZAN</Li>
          <Li isDark={isDark}>Votre consentement explicite (communications marketing)</Li>
          <Li isDark={isDark}>Notre intérêt légitime (sécurité, amélioration du service)</Li>
          <Li isDark={isDark}>Le respect d'obligations légales (facturation, conservation)</Li>
        </Section>

        <Section title="5. Durée de conservation" isDark={isDark}>
          <P isDark={isDark}>
            Vos données de compte sont conservées tant que votre compte est actif. Vous pouvez supprimer votre compte à tout moment dans Paramètres, ou sur la page web de suppression de compte. La suppression efface immédiatement vos données de compte (nom, adresse e-mail, téléphone, CIN, profession, photo, sessions), vos véhicules, favoris, annonces en cours et le contenu de vos messages. Restent conservés, au titre des obligations de la copropriété : votre fiche de copropriétaire ou de locataire tenue par le syndic, les écritures financières, les bulletins de vote, les signatures de documents, le registre du conseil syndical et le journal d'audit de sécurité.
          </P>
          <P isDark={isDark}>
            Les documents de la copropriété ont une durée de conservation par catégorie (par exemple 10 ans pour les documents financiers et juridiques, 5 ans pour les procès-verbaux), à l'issue de laquelle ils sont archivés puis purgés. Les écritures comptables et les paiements ne sont pas supprimés.
          </P>
        </Section>

        <Section title="6. Partage des données" isDark={isDark}>
          <P isDark={isDark}>
            Vos données ne sont jamais vendues à des tiers. Elles peuvent être partagées uniquement avec :
          </P>
          <Li isDark={isDark}>Nos prestataires techniques (hébergement, emails, paiement) — liés par des accords de confidentialité stricts</Li>
          <Li isDark={isDark}>Les autorités compétentes sur réquisition légale</Li>
          <Li isDark={isDark}>Votre syndicat : les membres du conseil syndical peuvent accéder aux données des copropriétaires dans le cadre de la gestion de la résidence</Li>
        </Section>

        <Section title="7. Transferts internationaux" isDark={isDark}>
          <P isDark={isDark}>
            Le lieu d'hébergement des données et les éventuels transferts hors du Maroc dépendent de l'infrastructure retenue par l'exploitant ; ils doivent être précisés ici et, le cas échéant, déclarés à la CNDP.
          </P>
        </Section>

        <Section title="8. Sécurité des données" isDark={isDark}>
          <P isDark={isDark}>
            MIZAN met en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données :
          </P>
          <Li isDark={isDark}>Connexion chiffrée (HTTPS) entre l'application et le serveur</Li>
          <Li isDark={isDark}>Mots de passe stockés uniquement sous forme de hachage (bcrypt)</Li>
          <Li isDark={isDark}>Contrôle d'accès par rôle et par copropriété, vérifié par le serveur</Li>
          <Li isDark={isDark}>Documents privés servis par des liens temporaires (5 minutes)</Li>
          <Li isDark={isDark}>Journal d'audit des actions sensibles</Li>
        </Section>

        <Section title="9. Vos droits" isDark={isDark}>
          <P isDark={isDark}>Conformément à la loi 09-08 et au RGPD, vous disposez des droits suivants :</P>
          <Li isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Droit d'accès</Text> : obtenir une copie de vos données personnelles</Li>
          <Li isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Droit de rectification</Text> : corriger des données inexactes ou incomplètes</Li>
          <Li isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Droit à l'effacement</Text> : demander la suppression de vos données</Li>
          <Li isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Droit à la portabilité</Text> : recevoir vos données dans un format structuré</Li>
          <Li isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Droit d'opposition</Text> : vous opposer au traitement de vos données</Li>
          <Li isDark={isDark}><Text style={{ fontFamily: "Inter_600SemiBold" }}>Droit à la limitation</Text> : restreindre le traitement dans certains cas</Li>
          <P isDark={isDark}>
            Pour exercer ces droits, contactez-nous à {CONTACT.privacyEmail ?? "[adresse à compléter]"}. Vous pouvez également introduire une réclamation auprès de la Commission Nationale de Contrôle de la Protection des Données à Caractère Personnel (CNDP).
          </P>
        </Section>

        <Section title="10. Cookies et traceurs" isDark={isDark}>
          <P isDark={isDark}>
            L'application mobile MIZAN n'utilise pas de cookies tiers. Nous utilisons uniquement des tokens de session stockés localement sur votre appareil pour maintenir votre connexion. Ces tokens sont chiffrés et peuvent être révoqués à tout moment via la déconnexion.
          </P>
        </Section>

        <Section title="11. Modifications de la politique" isDark={isDark}>
          <P isDark={isDark}>
            Cette politique peut être mise à jour périodiquement. Toute modification substantielle vous sera notifiée par email avec un préavis de 30 jours. La version en vigueur est toujours disponible dans l'application.
          </P>
        </Section>

        <View style={[s.contactBox, { backgroundColor: card, borderColor: border }]}>
          <Feather name="shield" size={16} color="#13976C" />
          <View style={{ flex: 1 }}>
            <Text style={[s.contactTitle, { color: fg }]}>Délégué à la Protection des Données (DPO)</Text>
            <Text style={[s.contactText, { color: muted }]}>{CONTACT.privacyEmail ?? "[adresse à compléter]"}</Text>
            <Text style={[s.contactText, { color: muted }]}>{CONTACT.legalEntity ?? "[raison sociale à compléter]"}</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  content: { padding: 20, gap: 24 },
  legalBadge: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  legalBadgeText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1, lineHeight: 19 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  para: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22 },
  liRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  liText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, flex: 1 },
  contactBox: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 12, borderWidth: 1 },
  contactTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  contactText: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
});
