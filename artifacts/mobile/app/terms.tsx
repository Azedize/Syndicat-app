/**
 * VERIDIAN — Conditions Générales d'Utilisation
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

export default function TermsScreen() {
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
          <Text style={[s.headerTitle, { color: fg }]}>Conditions Générales d'Utilisation</Text>
          <Text style={[s.headerSub, { color: muted }]}>Version 1.0 — Juillet 2025</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        <View style={[s.legalBadge, { backgroundColor: "#2563EB15", borderColor: "#2563EB30" }]}>
          <Feather name="shield" size={14} color="#2563EB" />
          <Text style={[s.legalBadgeText, { color: isDark ? "#93C5FD" : "#2563EB" }]}>
            Lisez attentivement ces conditions avant d'utiliser la plateforme VERIDIAN.
          </Text>
        </View>

        <Section title="1. Objet" isDark={isDark}>
          <P isDark={isDark}>
            Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme SaaS VERIDIAN, éditée par la société VERIDIAN TECHNOLOGIES SARL, société à responsabilité limitée de droit marocain, dont le siège social est situé à Casablanca, Maroc (ci-après « VERIDIAN »).
          </P>
          <P isDark={isDark}>
            VERIDIAN est une solution logicielle destinée à la gestion des syndicats de copropriété, permettant notamment la gestion financière, documentaire, la gouvernance numérique et la communication entre les parties prenantes d'une résidence.
          </P>
        </Section>

        <Section title="2. Acceptation des conditions" isDark={isDark}>
          <P isDark={isDark}>
            En créant un compte ou en accédant à la plateforme, vous acceptez sans réserve les présentes CGU. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser la plateforme.
          </P>
          <P isDark={isDark}>
            Ces conditions s'appliquent à tous les utilisateurs, qu'ils soient Administrateurs de Syndicat, membres du conseil syndical, copropriétaires ou locataires.
          </P>
        </Section>

        <Section title="3. Description des services" isDark={isDark}>
          <P isDark={isDark}>VERIDIAN propose notamment les modules suivants :</P>
          <Li isDark={isDark}>Gestion financière : budgets prévisionnels, charges, recouvrement, comptabilité</Li>
          <Li isDark={isDark}>Gouvernance : assemblées générales numériques, élections, procès-verbaux</Li>
          <Li isDark={isDark}>Documents : archivage certifié, génération PDF, signature électronique</Li>
          <Li isDark={isDark}>Communication : messagerie interne, notifications, annonces</Li>
          <Li isDark={isDark}>Maintenance : gestion des travaux, incidents, prestataires</Li>
          <Li isDark={isDark}>Marketplace : plateforme d'échanges entre résidents</Li>
          <Li isDark={isDark}>Rapports et statistiques : tableaux de bord, analyses</Li>
        </Section>

        <Section title="4. Comptes utilisateurs" isDark={isDark}>
          <P isDark={isDark}>
            Pour accéder aux services, vous devez créer un compte en fournissant des informations exactes, complètes et à jour. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée sous votre compte.
          </P>
          <P isDark={isDark}>
            Vous vous engagez à ne pas partager vos identifiants, à ne pas créer de compte pour le compte d'un tiers sans autorisation et à informer immédiatement VERIDIAN de toute utilisation non autorisée de votre compte.
          </P>
        </Section>

        <Section title="5. Abonnements et paiements" isDark={isDark}>
          <P isDark={isDark}>
            L'accès à VERIDIAN est soumis à la souscription d'un abonnement payant (sauf période d'essai gratuit). Les tarifs sont indiqués hors taxes et peuvent être révisés avec un préavis de 30 jours.
          </P>
          <Li isDark={isDark}>L'essai gratuit est valable 30 jours sans engagement ni carte bancaire</Li>
          <Li isDark={isDark}>Le paiement est dû à la date d'échéance indiquée sur la facture</Li>
          <Li isDark={isDark}>En cas de non-paiement, l'accès peut être suspendu après une période de grâce de 7 jours</Li>
          <Li isDark={isDark}>Les remboursements sont accordés selon la politique de remboursement en vigueur</Li>
        </Section>

        <Section title="6. Propriété intellectuelle" isDark={isDark}>
          <P isDark={isDark}>
            La plateforme VERIDIAN, son code source, ses bases de données, ses interfaces graphiques, ses marques et ses contenus sont la propriété exclusive de VERIDIAN TECHNOLOGIES SARL. Toute reproduction, représentation ou exploitation non autorisée est strictement interdite.
          </P>
          <P isDark={isDark}>
            Vous conservez la propriété de vos données. VERIDIAN vous accorde uniquement une licence d'utilisation de la plateforme, non exclusive et non transférable.
          </P>
        </Section>

        <Section title="7. Protection des données personnelles" isDark={isDark}>
          <P isDark={isDark}>
            VERIDIAN traite vos données conformément à la loi marocaine n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel et au Règlement Général sur la Protection des Données (RGPD) pour les utilisateurs européens.
          </P>
          <P isDark={isDark}>
            Pour plus d'informations, consultez notre Politique de Confidentialité.
          </P>
        </Section>

        <Section title="8. Disponibilité du service" isDark={isDark}>
          <P isDark={isDark}>
            VERIDIAN s'engage à maintenir une disponibilité du service de 99,5% par mois, hors maintenances planifiées. En cas d'indisponibilité prolongée, un crédit de service peut être accordé selon les conditions du contrat.
          </P>
        </Section>

        <Section title="9. Limitation de responsabilité" isDark={isDark}>
          <P isDark={isDark}>
            VERIDIAN ne saurait être tenu responsable des dommages indirects, pertes de données, pertes d'exploitation ou préjudices consécutifs à l'utilisation ou à l'impossibilité d'utiliser la plateforme.
          </P>
          <P isDark={isDark}>
            La responsabilité totale de VERIDIAN est limitée au montant des abonnements payés par le client au cours des 12 derniers mois.
          </P>
        </Section>

        <Section title="10. Résiliation" isDark={isDark}>
          <P isDark={isDark}>
            Vous pouvez résilier votre abonnement à tout moment depuis votre espace client. La résiliation prend effet à la fin de la période d'abonnement en cours. Vos données sont conservées pendant 90 jours après la résiliation, puis supprimées définitivement.
          </P>
          <P isDark={isDark}>
            VERIDIAN se réserve le droit de suspendre ou de résilier votre accès en cas de violation des présentes CGU, de non-paiement ou d'utilisation abusive de la plateforme.
          </P>
        </Section>

        <Section title="11. Loi applicable et juridiction" isDark={isDark}>
          <P isDark={isDark}>
            Les présentes CGU sont régies par le droit marocain. Tout litige relatif à leur interprétation ou à leur exécution sera soumis à la compétence exclusive des tribunaux de Casablanca, Maroc.
          </P>
        </Section>

        <Section title="12. Modification des CGU" isDark={isDark}>
          <P isDark={isDark}>
            VERIDIAN se réserve le droit de modifier les présentes CGU à tout moment. Les modifications sont notifiées par email avec un préavis de 30 jours. La poursuite de l'utilisation de la plateforme après cette période vaut acceptation des nouvelles conditions.
          </P>
        </Section>

        <View style={[s.contactBox, { backgroundColor: card, borderColor: border }]}>
          <Feather name="mail" size={16} color="#2563EB" />
          <View style={{ flex: 1 }}>
            <Text style={[s.contactTitle, { color: fg }]}>Contact juridique</Text>
            <Text style={[s.contactText, { color: muted }]}>legal@veridian.ma — VERIDIAN TECHNOLOGIES SARL, Casablanca, Maroc</Text>
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
