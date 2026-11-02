import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MizanMark from "@/components/brand/MizanMark";
import { IconButton, ZelligePattern } from "@/components/ui";
import { MIZAN } from "@/constants/brand";
import { DURATION, STAGGER, STAGGER_MAX } from "@/constants/motion";
import { RADIUS, SPACING } from "@/constants/spacing";
import { displayFace, FONT } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import type { StatusTone } from "@/constants/colors";
import { toneColors } from "@/components/ui";

type IconName = keyof typeof Feather.glyphMap;
type Lang = "fr" | "en" | "ar" | "es";

interface Module {
  icon: IconName;
  tone: StatusTone;
  tag: string;
  title: string;
  description: string;
  points: [string, string, string];
}

interface Copy {
  login: string;
  eyebrow: string;
  title: string;
  titleAccent: string;
  description: string;
  discover: string;
  kicker: string;
  sectionTitle: string;
  sectionText: string;
  finalTitle: string;
  finalText: string;
  finalButton: string;
  modules: Module[];
}

const ICONS: Array<[IconName, StatusTone]> = [
  ["grid", "primary"],
  ["bar-chart-2", "success"],
  ["users", "warning"],
  ["file-text", "info"],
  ["shopping-bag", "primary"],
  ["tool", "warning"],
  ["inbox", "danger"],
  ["message-circle", "info"],
  ["shield", "neutral"],
];

function mods(rows: Array<[string, string, string, string, string, string]>): Module[] {
  return rows.map(([tag, title, description, a, b, c], i) => ({ icon: ICONS[i][0], tone: ICONS[i][1], tag, title, description, points: [a, b, c] }));
}

const COPY: Record<Lang, Copy> = {
  fr: {
    login: "Se connecter",
    eyebrow: "La copropriété, enfin connectée",
    title: "La gestion de votre résidence",
    titleAccent: "mérite un espace à sa hauteur.",
    description: "MIZAN réunit les décisions, les finances, les documents et les échanges dans une seule expérience.",
    discover: "Commencer",
    kicker: "Tout ce dont vous avez besoin",
    sectionTitle: "Neuf domaines, un parcours cohérent.",
    sectionText: "De la première décision au suivi quotidien, chaque fonction trouve sa place dans le même environnement.",
    finalTitle: "Votre résidence peut fonctionner autrement.",
    finalText: "Créez votre espace et donnez à chaque personne la bonne information, au bon moment.",
    finalButton: "Créer mon espace",
    modules: mods([
      ["Pilotage", "Une vue claire de votre syndicat", "Les informations importantes sont réunies pour décider plus vite.", "Activité et alertes regroupées", "Accès rapide aux modules clés", "Informations adaptées à chaque rôle"],
      ["Finance", "Des finances lisibles et suivies", "Charges, appels de fonds, paiements, impayés et budgets restent traçables au même endroit.", "Appels de fonds et échéances", "Suivi des règlements et relances", "Budgets et rapports financiers"],
      ["Gouvernance", "Des assemblées mieux organisées", "Préparez les réunions, gérez les votes et conservez les procès-verbaux.", "Ordre du jour et convocations", "Candidatures, votes et quorum", "Mandats et procès-verbaux"],
      ["Documents", "Tous vos documents, au bon endroit", "Centralisez les documents de la copropriété, suivez leur cycle de vie et leurs signatures.", "Classement par résidence et dossier", "Signatures et validations", "Téléchargement et archivage contrôlés"],
      ["Services", "Une place de marché pour la résidence", "Mettez en relation résidents, vendeurs et prestataires.", "Annonces de vente et de location", "Prestataires et partenaires", "Favoris et commandes"],
      ["Maintenance", "Des travaux suivis de bout en bout", "Chaque incident ou chantier devient une action suivie, documentée et attribuée.", "Sinistres et incidents déclarés", "Travaux avec responsables et statuts", "Pièces jointes et historique"],
      ["Relation résidents", "Les demandes ne se perdent plus", "Donnez un cadre clair aux réclamations et aux interventions.", "Dépôt et qualification des demandes", "Statuts et responsables identifiés", "Escalade et suivi des réponses"],
      ["Communication", "Une communication qui rassemble", "Diffusez les annonces officielles et échangez avec les bons interlocuteurs.", "Messagerie interne", "Publications et annonces", "Notifications"],
      ["Administration", "Une organisation prête à grandir", "Chaque équipe dispose d'un espace adapté à son périmètre.", "Données séparées par copropriété", "Équipe du syndic et rôles", "Journal d'audit"],
    ]),
  },
  en: {
    login: "Sign in",
    eyebrow: "Co-ownership, finally connected",
    title: "Running your residence",
    titleAccent: "deserves a space of its own.",
    description: "MIZAN brings decisions, finances, documents and conversations together in one experience.",
    discover: "Get started",
    kicker: "Everything you need",
    sectionTitle: "Nine areas, one coherent journey.",
    sectionText: "From the first decision to day-to-day follow-up, every function has its place in the same environment.",
    finalTitle: "Your residence can work differently.",
    finalText: "Create your workspace and give everyone the right information at the right time.",
    finalButton: "Create my workspace",
    modules: mods([
      ["Overview", "A clear view of your condominium", "The important information in one place, to decide faster.", "Activity and alerts together", "Quick access to key modules", "Information suited to each role"],
      ["Finance", "Readable, tracked finances", "Charges, calls for funds, payments, arrears and budgets stay traceable in one place.", "Calls for funds and due dates", "Payment follow-up and reminders", "Budgets and financial reports"],
      ["Governance", "Better-organised general meetings", "Prepare meetings, run votes and keep the minutes.", "Agenda and notices", "Candidacies, votes and quorum", "Terms of office and minutes"],
      ["Documents", "Every document in the right place", "Keep the condominium's documents together and follow their life cycle and signatures.", "Filed by residence and folder", "Signatures and approvals", "Controlled download and archiving"],
      ["Services", "A marketplace for the residence", "Connect residents, sellers and service providers.", "Sale and rental listings", "Providers and partners", "Favourites and orders"],
      ["Maintenance", "Works followed from start to finish", "Every incident or work site becomes a tracked, documented, assigned action.", "Reported claims and incidents", "Works with owners and statuses", "Attachments and history"],
      ["Residents", "Requests no longer get lost", "Give claims and interventions a clear framework.", "Submitting and qualifying requests", "Clear statuses and owners", "Escalation and follow-up"],
      ["Communication", "Communication that brings people together", "Publish official announcements and talk to the right people.", "Internal messaging", "Posts and announcements", "Notifications"],
      ["Administration", "An organisation ready to grow", "Each team has a space suited to its scope.", "Data separated by condominium", "Syndic team and roles", "Audit log"],
    ]),
  },
  ar: {
    login: "تسجيل الدخول",
    eyebrow: "الملكية المشتركة، متصلة أخيرًا",
    title: "تدبير إقامتكم",
    titleAccent: "يستحق فضاءً في مستواه.",
    description: "يجمع MIZAN القرارات والمالية والوثائق والتواصل في تجربة واحدة.",
    discover: "ابدأ",
    kicker: "كل ما تحتاجونه",
    sectionTitle: "تسعة مجالات، مسار واحد متناسق.",
    sectionText: "من القرار الأول إلى المتابعة اليومية، تجد كل وظيفة مكانها في البيئة نفسها.",
    finalTitle: "يمكن لإقامتكم أن تعمل بشكل مختلف.",
    finalText: "أنشئوا فضاءكم وامنحوا كل شخص المعلومة المناسبة في الوقت المناسب.",
    finalButton: "إنشاء فضائي",
    modules: mods([
      ["القيادة", "رؤية واضحة لسنديككم", "المعلومات المهمة مجتمعة لاتخاذ القرار بسرعة أكبر.", "النشاط والتنبيهات في مكان واحد", "وصول سريع إلى الوحدات الرئيسية", "معلومات ملائمة لكل دور"],
      ["المالية", "مالية واضحة ومتابعة", "التكاليف ونداءات الأموال والأداءات والمتأخرات والميزانيات قابلة للتتبع في مكان واحد.", "نداءات الأموال والآجال", "متابعة الأداءات والتذكيرات", "الميزانيات والتقارير المالية"],
      ["الحكامة", "جموع عامة أحسن تنظيمًا", "حضّروا الاجتماعات ونظّموا التصويت واحفظوا المحاضر.", "جدول الأعمال والاستدعاءات", "الترشيحات والتصويت والنصاب", "الولايات والمحاضر"],
      ["الوثائق", "كل وثائقكم في مكانها", "اجمعوا وثائق الملكية المشتركة وتابعوا دورة حياتها وتوقيعاتها.", "تصنيف حسب الإقامة والملف", "التوقيعات والمصادقات", "تحميل وأرشفة مضبوطان"],
      ["الخدمات", "سوق خاصة بالإقامة", "اربطوا السكان بالبائعين ومقدمي الخدمات.", "إعلانات البيع والكراء", "مقدمو الخدمات والشركاء", "المفضلة والطلبات"],
      ["الصيانة", "أشغال متابعة من البداية إلى النهاية", "يتحول كل حادث أو ورش إلى إجراء متابَع وموثَّق ومسنَد.", "الحوادث المصرح بها", "الأشغال مع المسؤولين والحالات", "المرفقات والسجل"],
      ["علاقة السكان", "لم تعد الطلبات تضيع", "امنحوا الشكايات والتدخلات إطارًا واضحًا.", "إيداع الطلبات وتصنيفها", "حالات ومسؤولون واضحون", "التصعيد ومتابعة الردود"],
      ["التواصل", "تواصل يجمع الناس", "انشروا الإعلانات الرسمية وتواصلوا مع المعنيين.", "المراسلة الداخلية", "المنشورات والإعلانات", "الإشعارات"],
      ["الإدارة", "تنظيم جاهز للنمو", "لكل فريق فضاء ملائم لنطاقه.", "بيانات منفصلة لكل ملكية مشتركة", "فريق السنديك والأدوار", "سجل التدقيق"],
    ]),
  },
  es: {
    login: "Iniciar sesión",
    eyebrow: "La comunidad de propietarios, por fin conectada",
    title: "La gestión de su residencia",
    titleAccent: "merece un espacio a su altura.",
    description: "MIZAN reúne las decisiones, las finanzas, los documentos y los intercambios en una sola experiencia.",
    discover: "Empezar",
    kicker: "Todo lo que necesita",
    sectionTitle: "Nueve áreas, un recorrido coherente.",
    sectionText: "De la primera decisión al seguimiento diario, cada función tiene su lugar en el mismo entorno.",
    finalTitle: "Su residencia puede funcionar de otra manera.",
    finalText: "Cree su espacio y dé a cada persona la información adecuada en el momento adecuado.",
    finalButton: "Crear mi espacio",
    modules: mods([
      ["Pilotaje", "Una visión clara de su comunidad", "La información importante reunida para decidir más rápido.", "Actividad y alertas agrupadas", "Acceso rápido a los módulos clave", "Información adaptada a cada rol"],
      ["Finanzas", "Finanzas claras y seguidas", "Gastos, derramas, pagos, impagos y presupuestos trazables en un mismo lugar.", "Derramas y vencimientos", "Seguimiento de pagos y recordatorios", "Presupuestos e informes financieros"],
      ["Gobernanza", "Juntas mejor organizadas", "Prepare las reuniones, gestione las votaciones y conserve las actas.", "Orden del día y convocatorias", "Candidaturas, votos y quórum", "Mandatos y actas"],
      ["Documentos", "Todos sus documentos en su sitio", "Centralice los documentos de la comunidad y siga su ciclo de vida y sus firmas.", "Clasificados por residencia y carpeta", "Firmas y validaciones", "Descarga y archivo controlados"],
      ["Servicios", "Un mercado para la residencia", "Ponga en contacto a residentes, vendedores y proveedores.", "Anuncios de venta y alquiler", "Proveedores y socios", "Favoritos y pedidos"],
      ["Mantenimiento", "Obras seguidas de principio a fin", "Cada incidencia u obra se convierte en una acción seguida, documentada y asignada.", "Siniestros e incidencias", "Obras con responsables y estados", "Adjuntos e historial"],
      ["Residentes", "Las solicitudes ya no se pierden", "Dé un marco claro a las reclamaciones e intervenciones.", "Registro y calificación de solicitudes", "Estados y responsables claros", "Escalado y seguimiento"],
      ["Comunicación", "Una comunicación que une", "Publique los anuncios oficiales y hable con las personas adecuadas.", "Mensajería interna", "Publicaciones y anuncios", "Notificaciones"],
      ["Administración", "Una organización lista para crecer", "Cada equipo dispone de un espacio adaptado a su ámbito.", "Datos separados por comunidad", "Equipo de la administración y roles", "Registro de auditoría"],
    ]),
  },
};

function ModuleCard({ module, index }: { module: Module; index: number }) {
  const colors = useColors();
  const { lang } = useLanguage();
  const tc = toneColors(colors, module.tone);
  return (
    <Animated.View
      entering={FadeInDown.duration(DURATION.base).delay(Math.min(index, STAGGER_MAX) * STAGGER)}
      style={[styles.module, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.moduleHead}>
        <View style={[styles.moduleIcon, { backgroundColor: tc.bg }]}>
          <Feather name={module.icon} size={20} color={tc.fg} />
        </View>
        <View style={styles.moduleCopy}>
          <Text style={[styles.moduleTag, { color: tc.text }, lang === "ar" && { letterSpacing: 0 }]}>
            {String(index + 1).padStart(2, "0")} · {lang === "ar" ? module.tag : module.tag.toUpperCase()}
          </Text>
          <Text style={[styles.moduleTitle, { color: colors.foreground }, lang === "ar" && { fontFamily: displayFace(lang), lineHeight: 30 }]}>{module.title}</Text>
        </View>
      </View>
      <Text style={[styles.moduleText, { color: colors.textMuted }]}>{module.description}</Text>
      <View style={styles.points}>
        {module.points.map((p) => (
          <View key={p} style={styles.point}>
            <Feather name="check" size={14} color={colors.success} />
            <Text style={[styles.pointText, { color: colors.textSecondary }]}>{p}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

/** Public product tour: what MIZAN covers, module by module. */
export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggle } = useTheme();
  const colors = useColors();
  const { t, lang, isRTL } = useLanguage();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const c = COPY[(lang as Lang) in COPY ? (lang as Lang) : "fr"];
  const ar = lang === "ar";
  const pageW = Math.min(width, 720);

  const openStart = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Replayed from Settings by a signed-in user: back to the app, not to the sign-up.
    if (user) router.replace("/(tabs)" as any);
    else router.push("/get-started");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={["#2B2475", MIZAN.colors.navyDeep]} style={[styles.hero, { paddingTop: insets.top + (Platform.OS === "web" ? 16 : 10) }]}>
          <ZelligePattern opacity={0.035} />
          <View style={[styles.page, { width: pageW }]}>
            <View style={styles.topBar}>
              <IconButton icon={isRTL ? "arrow-right" : "arrow-left"} variant="onDark" accessibilityLabel={t("back")} onPress={() => router.replace("/welcome" as any)} />
              <View style={styles.topActions}>
                <IconButton testID="intro-theme-toggle" icon={isDark ? "sun" : "moon"} variant="onDark" accessibilityLabel={isDark ? t("lightMode") : t("darkMode")} onPress={toggle} />
                <Pressable onPress={() => router.replace("/login")} accessibilityRole="button" style={({ pressed }) => [styles.loginChip, pressed && { opacity: 0.75 }]}>
                  <Text style={styles.loginText}>{c.login}</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.heroCopy}>
              <MizanMark size={64} />
              <Text style={[styles.eyebrow, ar && { letterSpacing: 0 }]}>{ar ? c.eyebrow : c.eyebrow.toUpperCase()}</Text>
              <Text style={[styles.heroTitle, ar && { fontFamily: displayFace(lang), lineHeight: 46 }]} accessibilityRole="header">
                {c.title}{"\n"}
                <Text style={styles.heroAccent}>{c.titleAccent}</Text>
              </Text>
              <Text style={styles.heroText}>{c.description}</Text>
              <Pressable onPress={openStart} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { backgroundColor: colors.primaryStrong, transform: [{ scale: 0.985 }] }]}>
                <Text style={styles.primaryText}>{c.discover}</Text>
                <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.page, styles.section, { width: pageW }]}>
          <Text style={[styles.kicker, { color: colors.goldText }, ar && { letterSpacing: 0 }]}>{ar ? c.kicker : c.kicker.toUpperCase()}</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }, ar && { fontFamily: displayFace(lang), lineHeight: 40 }]} accessibilityRole="header">{c.sectionTitle}</Text>
          <Text style={[styles.sectionText, { color: colors.textMuted }]}>{c.sectionText}</Text>
          <View style={styles.modules}>
            {c.modules.map((m, i) => (
              <ModuleCard key={m.tag} module={m} index={i} />
            ))}
          </View>

          <LinearGradient colors={["#2B2475", MIZAN.colors.navyDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.final}>
            <ZelligePattern opacity={0.04} />
            <Text style={[styles.finalTitle, ar && { fontFamily: displayFace(lang), lineHeight: 36 }]}>{c.finalTitle}</Text>
            <Text style={styles.finalText}>{c.finalText}</Text>
            <Pressable onPress={openStart} accessibilityRole="button" style={({ pressed }) => [styles.finalButton, pressed && { opacity: 0.9 }]}>
              <Text style={styles.finalButtonText}>{c.finalButton}</Text>
              <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={17} color={MIZAN.colors.blue} />
            </Pressable>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: "center", overflow: "hidden", borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 36 },
  page: { alignSelf: "center", maxWidth: "100%", paddingHorizontal: 20 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  loginChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.24)" },
  loginText: { fontFamily: FONT.semibold, fontSize: 14, color: "#FFFFFF" },
  heroCopy: { alignItems: "center", gap: 14, marginTop: 24 },
  eyebrow: { fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 1.6, color: "#E3B75C", textAlign: "center" },
  heroTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 31, lineHeight: 38, textAlign: "center", color: "#FFFFFF" },
  heroAccent: { color: "#C9BEFF" },
  heroText: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, textAlign: "center", color: "rgba(255,255,255,0.8)", maxWidth: 520 },
  primary: { marginTop: 6, minHeight: 54, alignSelf: "stretch", borderRadius: RADIUS.MD + 2, backgroundColor: MIZAN.colors.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { fontFamily: FONT.bold, fontSize: 15, color: "#FFFFFF" },
  section: { paddingTop: 40, gap: 10 },
  kicker: { fontFamily: FONT.bold, fontSize: 11, letterSpacing: 1.4 },
  sectionTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 27, lineHeight: 34 },
  sectionText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21 },
  modules: { gap: SPACING.MD, marginTop: SPACING.MD },
  module: { borderRadius: RADIUS.LG + 4, borderWidth: 1, padding: SPACING.LG, gap: 10 },
  moduleHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  moduleIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  moduleCopy: { flex: 1, gap: 2 },
  moduleTag: { fontFamily: FONT.bold, fontSize: 11, letterSpacing: 1.2 },
  moduleTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 18, lineHeight: 24 },
  moduleText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21 },
  points: { gap: 6 },
  point: { flexDirection: "row", alignItems: "center", gap: 8 },
  pointText: { flex: 1, fontFamily: FONT.medium, fontSize: 13, lineHeight: 18 },
  final: { marginTop: 32, borderRadius: 26, padding: 24, alignItems: "center", gap: 10, overflow: "hidden" },
  finalTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 23, lineHeight: 30, textAlign: "center", color: "#FFFFFF" },
  finalText: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21, textAlign: "center", color: "rgba(255,255,255,0.8)" },
  finalButton: { marginTop: 8, minHeight: 52, alignSelf: "stretch", borderRadius: 14, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  finalButtonText: { fontFamily: FONT.bold, fontSize: 15, color: MIZAN.colors.blue },
});
