/**
 * MIZAN — Politique de Confidentialité
 */
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";

function Section({ title, children, isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: isDark ? "#93C5FD" : "#2563EB" }]}>{title}</Text>
      {children}
    </View>
  );
}
function P({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return <Text style={[s.para, { color: isDark ? "rgba(232,240,254,0.75)" : "#374151" }]}>{children}</Text>;
}
function Li({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={s.liRow}>
      <View style={[s.bullet, { backgroundColor: isDark ? "#3B82F6" : "#2563EB" }]} />
      <Text style={[s.liText, { color: isDark ? "rgba(232,240,254,0.75)" : "#374151" }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const bg = isDark ? "#070D1A" : "#F8FAFF";
  const card = isDark ? "#0D1929" : "#fff";
  const fg = isDark ? "#E8F0FE" : "#0A1628";
  const muted = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(37,99,235,0.1)";

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <View style={[s.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={isDark ? "#93C5FD" : "#2563EB"} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: fg }]}>Politique de Confidentialité</Text>
          <Text style={[s.headerSub, { color: muted }]}>Version 1.0 — Juillet 2025 · Conforme CNDP & RGPD</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        <View style={[s.legalBadge, { backgroundColor: "#10B98115", borderColor: "#10B98130" }]}>
          <Feather name="lock" size={14} color="#10B981" />
          <Text style={[s.legalBadgeText, { color: isDark ? "#6EE7B7" : "#059669" }]}>
            MIZAN s'engage à protéger vos données personnelles conformément à la loi marocaine 09-08 et au RGPD européen.
          </Text>
        </View>

        <Section title="1. Responsable du traitement" isDark={isDark}>
          <P isDark={isDark}>
            Le responsable du traitement de vos données personnelles est MIZAN Community OS SARL, société de droit marocain immatriculée à Casablanca. Contact DPO : privacy@mizan.ma
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
            Vos données sont conservées pendant toute la durée de votre abonnement, puis pendant 90 jours après la résiliation de votre compte pour permettre une réactivation éventuelle.
          </P>
          <P isDark={isDark}>
            Les données de facturation sont conservées pendant 10 ans conformément aux obligations comptables et fiscales. Les journaux d'audit sont conservés pendant 3 ans.
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
            Les données sont hébergées sur des serveurs situés dans l'Union Européenne et/ou au Maroc. Tout transfert vers des pays tiers est encadré par des garanties appropriées (clauses contractuelles types, décisions d'adéquation).
          </P>
        </Section>

        <Section title="8. Sécurité des données" isDark={isDark}>
          <P isDark={isDark}>
            MIZAN met en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données :
          </P>
          <Li isDark={isDark}>Chiffrement des données en transit (TLS 1.3) et au repos (AES-256)</Li>
          <Li isDark={isDark}>Authentification sécurisée avec hachage des mots de passe (bcrypt)</Li>
          <Li isDark={isDark}>Contrôle d'accès basé sur les rôles (RBAC)</Li>
          <Li isDark={isDark}>Audits de sécurité réguliers et tests de pénétration</Li>
          <Li isDark={isDark}>Sauvegardes chiffrées quotidiennes avec rétention de 30 jours</Li>
          <Li isDark={isDark}>Journaux d'audit complets et immuables</Li>
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
            Pour exercer ces droits, contactez-nous à privacy@mizan.ma. Vous pouvez également introduire une réclamation auprès de la Commission Nationale de Contrôle de la Protection des Données à Caractère Personnel (CNDP).
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
          <Feather name="shield" size={16} color="#10B981" />
          <View style={{ flex: 1 }}>
            <Text style={[s.contactTitle, { color: fg }]}>Délégué à la Protection des Données (DPO)</Text>
            <Text style={[s.contactText, { color: muted }]}>privacy@mizan.ma</Text>
            <Text style={[s.contactText, { color: muted }]}>MIZAN Community OS SARL — Casablanca, Maroc</Text>
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
