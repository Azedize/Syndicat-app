import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

import { useLanguage } from "@/context/LanguageContext";

const TOTAL_STEPS = 4;

const STRINGS = {
  sectors: {
    education: { fr: "Éducation", en: "Education", ar: "التعليم", es: "Educación" },
    health: { fr: "Santé", en: "Health", ar: "الصحة", es: "Salud" },
    publicAdmin: { fr: "Administration publique", en: "Public Administration", ar: "الإدارة العامة", es: "Administración Pública" },
    industry: { fr: "Industrie", en: "Industry", ar: "الصناعة", es: "Industria" },
    commerce: { fr: "Commerce", en: "Commerce", ar: "التجارة", es: "Comercio" },
    engineering: { fr: "Ingénierie", en: "Engineering", ar: "الهندسة", es: "Ingeniería" },
    transport: { fr: "Transport", en: "Transport", ar: "النقل", es: "Transporte" },
    agriculture: { fr: "Agriculture", en: "Agriculture", ar: "الفلاحة", es: "Agricultura" },
    tourism: { fr: "Tourisme", en: "Tourism", ar: "السياحة", es: "Turismo" },
    justice: { fr: "Justice", en: "Justice", ar: "العدل", es: "Justicia" },
    other: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
  },
  regions: {
    casablanca: { fr: "Casablanca-Settat", en: "Casablanca-Settat", ar: "الدار البيضاء-سطات", es: "Casablanca-Settat" },
    rabat: { fr: "Rabat-Salé-Kénitra", en: "Rabat-Salé-Kénitra", ar: "الرباط-سلا-القنيطرة", es: "Rabat-Salé-Kenitra" },
    fes: { fr: "Fès-Meknès", en: "Fès-Meknès", ar: "فاس-مكناس", es: "Fez-Mequinez" },
    marrakech: { fr: "Marrakech-Safi", en: "Marrakech-Safi", ar: "مراكش-آسفي", es: "Marrakech-Safí" },
    souss: { fr: "Souss-Massa", en: "Souss-Massa", ar: "سوس-ماسة", es: "Sus-Masa" },
    tanger: { fr: "Tanger-Tétouan-Al Hoceïma", en: "Tanger-Tétouan-Al Hoceima", ar: "طنجة-تطوان-الحسيمة", es: "Tánger-Tetuán-Alhucemas" },
    oriental: { fr: "Oriental", en: "Oriental", ar: "الجهة الشرقية", es: "Oriental" },
    beni: { fr: "Béni Mellal-Khénifra", en: "Béni Mellal-Khénifra", ar: "بني ملال-خنيفرة", es: "Beni Melal-Jenifra" },
    draa: { fr: "Drâa-Tafilalet", en: "Drâa-Tafilalet", ar: "درعة-تافيلالت", es: "Drá-Tafilalet" },
    guelmim: { fr: "Guelmim-Oued Noun", en: "Guelmim-Oued Noun", ar: "كلميم-واد نون", es: "Guelmim-Oued Nun" },
    national: { fr: "National", en: "National", ar: "وطني", es: "Nacional" },
  },
  legalForms: {
    professional: { fr: "Syndicat professionnel — Dahir 1957", en: "Professional Union — 1957 Dahir", ar: "نقابة مهنية — ظهير 1957", es: "Sindicato profesional — Dahir 1957" },
    sectoral: { fr: "Syndicat sectoriel", en: "Sectoral Union", ar: "نقابة قطاعية", es: "Sindicato sectorial" },
    federation: { fr: "Fédération syndicale", en: "Trade Union Federation", ar: "اتحاد نقابي", es: "Federación sindical" },
    confederation: { fr: "Confédération syndicale", en: "Trade Union Confederation", ar: "كونفدرالية نقابية", es: "Confederación sindical" },
    localUnion: { fr: "Union locale", en: "Local Union", ar: "اتحاد محلي", es: "Unión local" },
  },
  cycles: {
    monthly: { fr: "Mensuel", en: "Monthly", ar: "شهري", es: "Mensual" },
    quarterly: { fr: "Trimestriel", en: "Quarterly", ar: "فصلي", es: "Trimestral" },
    yearly: { fr: "Annuel", en: "Yearly", ar: "سنوي", es: "Anual" },
  },
  steps: {
    identity: { fr: "Identité", en: "Identity", ar: "الهوية", es: "Identidad" },
    contact: { fr: "Contact", en: "Contact", ar: "الاتصال", es: "Contacto" },
    legal: { fr: "Légal", en: "Legal", ar: "القانوني", es: "Legal" },
    config: { fr: "Configuration", en: "Configuration", ar: "الإعدادات", es: "Configuración" },
  },
  titles: {
    create: { fr: "Créer un syndicat", en: "Create a union", ar: "إنشاء نقابة", es: "Crear un sindicato" },
    stepLabel: { fr: "Étape", en: "Step", ar: "خطوة", es: "Paso" },
    identityTitle: { fr: "Identité du syndicat", en: "Union Identity", ar: "هوية النقابة", es: "Identidad del sindicato" },
    contactTitle: { fr: "Contact & Apparence", en: "Contact & Appearance", ar: "الاتصال والمظهر", es: "Contacto y Apariencia" },
    legalTitle: { fr: "Informations légales", en: "Legal Information", ar: "معلومات قانونية", es: "Información legal" },
    configTitle: { fr: "Configuration & Récapitulatif", en: "Configuration & Summary", ar: "الإعدادات والملخص", es: "Configuración y Resumen" },
  },
  fields: {
    fullName: { fr: "Nom complet du syndicat *", en: "Full name of the union *", ar: "الاسم الكامل للنقابة *", es: "Nombre completo del sindicato *" },
    fullNamePlaceholder: { fr: "Ex: Syndicat National des Enseignants", en: "Ex: National Union of Teachers", ar: "مثال: النقابة الوطنية للمدرسين", es: "Ej: Sindicato Nacional de Docentes" },
    abbreviation: { fr: "Sigle / Abréviation *", en: "Acronym / Abbreviation *", ar: "الاسم المختصر *", es: "Sigla / Abreviatura *" },
    abbreviationPlaceholder: { fr: "Ex: SNE", en: "Ex: NUT", ar: "مثال: SNE", es: "Ej: SNE" },
    mission: { fr: "Mission / Description", en: "Mission / Description", ar: "المهمة / الوصف", es: "Misión / Descripción" },
    missionPlaceholder: { fr: "Décrivez la mission principale du syndicat...", en: "Describe the union's primary mission...", ar: "صف المهمة الرئيسية للنقابة...", es: "Describa la misión principal del sindicato..." },
    sector: { fr: "Secteur d'activité", en: "Activity Sector", ar: "قطاع النشاط", es: "Sector de actividad" },
    region: { fr: "Région", en: "Region", ar: "الجهة", es: "Región" },
    email: { fr: "Email officiel *", en: "Official Email *", ar: "البريد الإلكتروني الرسمي *", es: "Correo oficial *" },
    emailPlaceholder: { fr: "contact@syndicat.ma", en: "contact@union.ma", ar: "contact@syndicat.ma", es: "contacto@sindicato.ma" },
    phone: { fr: "Téléphone *", en: "Phone *", ar: "الهاتف *", es: "Teléfono *" },
    phonePlaceholder: { fr: "+212 5 00 00 00 00", en: "+212 5 00 00 00 00", ar: "+212 5 00 00 00 00", es: "+212 5 00 00 00 00" },
    website: { fr: "Site web", en: "Website", ar: "الموقع الإلكتروني", es: "Sitio web" },
    websitePlaceholder: { fr: "https://www.syndicat.ma", en: "https://www.union.ma", ar: "https://www.syndicat.ma", es: "https://www.sindicato.ma" },
    address: { fr: "Adresse du siège", en: "Headquarters Address", ar: "عنوان المقر", es: "Dirección de la sede" },
    addressPlaceholder: { fr: "Numéro, rue, ville...", en: "Number, street, city...", ar: "رقم، شارع، مدينة...", es: "Número, calle, ciudad..." },
    colorLogo: { fr: "Couleur / Logo du syndicat", en: "Color / Union Logo", ar: "لون / شعار النقابة", es: "Color / Logo del sindicato" },
    logoDefaultAbbr: { fr: "SND", en: "SND", ar: "نقابة", es: "SND" },
    logoDefaultName: { fr: "Nom du syndicat", en: "Union Name", ar: "اسم النقابة", es: "Nombre del sindicato" },
    regNumber: { fr: "Numéro d'enregistrement *", en: "Registration Number *", ar: "رقم التسجيل *", es: "Número de registro *" },
    regNumberPlaceholder: { fr: "Ex: 2024-SYN-001234", en: "Ex: 2024-SYN-001234", ar: "مثال: 2024-SYN-001234", es: "Ej: 2024-SYN-001234" },
    foundingDate: { fr: "Date de fondation *", en: "Founding Date *", ar: "تاريخ التأسيس *", es: "Fecha de fundación *" },
    foundingDatePlaceholder: { fr: "AAAA-MM-JJ", en: "YYYY-MM-DD", ar: "YYYY-MM-DD", es: "AAAA-MM-DD" },
    memberCount: { fr: "Nombre initial de membres", en: "Initial number of members", ar: "العدد الأولي للأعضاء", es: "Número inicial de miembros" },
    memberCountPlaceholder: { fr: "Ex: 50", en: "Ex: 50", ar: "مثال: 50", es: "Ej: 50" },
    legalForm: { fr: "Forme juridique", en: "Legal Form", ar: "الشكل القانوني", es: "Forma jurídica" },
    cotisationAmount: { fr: "Montant cotisation (MAD)", en: "Contribution Amount (MAD)", ar: "مبلغ الاشتراك (درهم)", es: "Monto de la cotización (MAD)" },
    cotisationCycle: { fr: "Cycle de cotisation", en: "Contribution Cycle", ar: "دورة الاشتراك", es: "Ciclo de cotización" },
  },
  descriptions: {
    step1: { fr: "Renseignez les informations d'identité principales de votre syndicat.", en: "Fill in the main identity information of your union.", ar: "املأ معلومات الهوية الرئيسية لنقابتك.", es: "Complete la información de identidad principal de su sindicato." },
    step2: { fr: "Ces coordonnées seront visibles par les membres et affichées dans l'annuaire.", en: "These details will be visible to members and displayed in the directory.", ar: "ستكون هذه البيانات مرئية للأعضاء ومعروضة في الدليل.", es: "Estos datos serán visibles para los miembros y se mostrarán en el directorio." },
    step3: { fr: "Informations juridiques requises conformément au Dahir n° 1-57-119 du 16 juillet 1957.", en: "Legal information required in accordance with Dahir No. 1-57-119 of July 16, 1957.", ar: "المعلومات القانونية المطلوبة وفقاً للظهير رقم 1-57-119 الصادر في 16 يوليو 1957.", es: "Información legal requerida de acuerdo con el Dahir n° 1-57-119 del 16 de julio de 1957." },
    step4: { fr: "Configurez les paramètres financiers et d'adhésion de votre syndicat.", en: "Configure the financial and membership settings of your union.", ar: "قم بتهيئة الإعدادات المالية والعضوية لنقابتك.", es: "Configure los ajustes financieros y de membresía de su sindicato." },
    legalNote: { fr: "Ces informations seront vérifiées lors de la validation de votre syndicat sur la plateforme. Assurez-vous de la conformité avec le Dahir 1-57-119.", en: "This information will be verified during the validation of your union on the platform. Ensure compliance with Dahir 1-57-119.", ar: "سيتم التحقق من هذه المعلومات أثناء التحقق من نقابتك على المنصة. تأكد من الامتثال للظهير 1-57-119.", es: "Esta información será verificada durante la validación de su sindicato en la plataforma. Asegúrese de cumplir con el Dahir 1-57-119." },
  },
  preview: {
    notProvided: { fr: "Non renseigné", en: "Not provided", ar: "غير متوفر", es: "No proporcionado" },
    regPrefix: { fr: "N°", en: "No.", ar: "رقم", es: "Nº" },
    foundedPrefix: { fr: "Fondé le", en: "Founded on", ar: "تأسس في", es: "Fundado el" },
    summaryPart1: { fr: "Cotisation de", en: "Contribution of", ar: "اشتراك", es: "Cotización de" },
    summaryPart2: { fr: "par membre", en: "per member", ar: "لكل عضو", es: "por miembro" },
    revenueEst: { fr: "Revenus estimés:", en: "Estimated revenue:", ar: "الإيرادات المقدرة:", es: "Ingresos estimados:" },
    cyclesSmall: {
      monthly: { fr: "mois", en: "month", ar: "شهر", es: "mes" },
      quarterly: { fr: "trimestre", en: "quarter", ar: "trimestre", es: "trimestre" },
      yearly: { fr: "an", en: "year", ar: "سنة", es: "año" },
    }
  },
  validation: {
    required: { fr: "Requis", en: "Required", ar: "مطلوب", es: "Requerido" },
    nameReq: { fr: "Le nom du syndicat est obligatoire.", en: "The union name is required.", ar: "اسم النقابة مطلوب.", es: "El nombre del sindicato es obligatorio." },
    abbrReq: { fr: "Le sigle/abréviation est obligatoire.", en: "The acronym/abbreviation is required.", ar: "الاسم المختصر مطلوب.", es: "La sigla/abreviatura es obligatoria." },
    emailReq: { fr: "L'email de contact est obligatoire.", en: "Contact email is required.", ar: "البريد الإلكتروني للاتصال مطلوب.", es: "El correo de contacto es obligatorio." },
    phoneReq: { fr: "Le téléphone est obligatoire.", en: "Phone is required.", ar: "الهاتف مطلوب.", es: "El teléfono es obligatorio." },
    regNumberReq: { fr: "Le numéro d'enregistrement est obligatoire.", en: "Registration number is required.", ar: "رقم التسجيل مطلوب.", es: "El número de registro es obligatorio." },
    foundingDateReq: { fr: "La date de fondation est obligatoire.", en: "Founding date is required.", ar: "تاريخ التأسيس مطلوب.", es: "La fecha de fundación es obligatoria." },
  },
  alerts: {
    createdTitle: { fr: "Syndicat créé !", en: "Union created!", ar: "تم إنشاء النقابة!", es: "¡Sindicato creado!" },
    createdMsg: { fr: "Le syndicat \"{name}\" a été créé avec succès. Vous pouvez maintenant inviter des membres.", en: "The union \"{name}\" has been successfully created. You can now invite members.", ar: "تم إنشاء النقابة \"{name}\" بنجاح. يمكنك الآن دعوة الأعضاء.", es: "El sindicato \"{name}\" se ha creado con éxito. Ahora puede invitar a miembros." },
    dashboardBtn: { fr: "Voir le tableau de bord", en: "View Dashboard", ar: "عرض لوحة القيادة", es: "Ver el panel de control" },
  },
  buttons: {
    continue: { fr: "Continuer", en: "Continue", ar: "استمرار", es: "Continuar" },
    createBtn: { fr: "Créer le syndicat", en: "Create the union", ar: "إنشاء النقابة", es: "Crear el sindicato" },
  }
};

const SECTORS = ["education", "health", "publicAdmin", "industry", "commerce", "engineering", "transport", "agriculture", "tourism", "justice", "other"];
const REGIONS = ["casablanca", "rabat", "fes", "marrakech", "souss", "tanger", "oriental", "beni", "draa", "guelmim", "national"];
const LEGAL_FORMS = ["professional", "sectoral", "federation", "confederation", "localUnion"];
const COTISATION_CYCLES = ["monthly", "quarterly", "yearly"];

const STEP_ICONS: Array<keyof typeof Feather.glyphMap> = ["home", "phone", "file-text", "settings"];

interface SetupForm {
  name: string;
  abbreviation: string;
  sector: string;
  region: string;
  legalForm: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  registrationNumber: string;
  foundingDate: string;
  memberCount: string;
  cotisationAmount: string;
  cotisationCycle: string;
  logoColor: string;
  mission: string;
}

export default function SyndicateSetupScreen() {
  const { lang } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addSyndicate } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SetupForm>({
    name: "",
    abbreviation: "",
    sector: "Éducation",
    region: "Casablanca-Settat",
    legalForm: "Syndicat professionnel — Dahir 1957",
    email: "",
    phone: "",
    website: "",
    address: "",
    registrationNumber: "",
    foundingDate: "",
    memberCount: "",
    cotisationAmount: "150",
    cotisationCycle: "Mensuel",
    logoColor: "#7c3aed",
    mission: "",
  });

  const up = (field: keyof SetupForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const progress = (step / TOTAL_STEPS) * 100;

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!form.name.trim()) { Alert.alert("Requis", "Le nom du syndicat est obligatoire."); return false; }
      if (!form.abbreviation.trim()) { Alert.alert("Requis", "Le sigle/abréviation est obligatoire."); return false; }
      return true;
    }
    if (step === 2) {
      if (!form.email.trim()) { Alert.alert("Requis", "L'email de contact est obligatoire."); return false; }
      if (!form.phone.trim()) { Alert.alert("Requis", "Le téléphone est obligatoire."); return false; }
      return true;
    }
    if (step === 3) {
      if (!form.registrationNumber.trim()) { Alert.alert("Requis", "Le numéro d'enregistrement est obligatoire."); return false; }
      if (!form.foundingDate.trim()) { Alert.alert("Requis", "La date de fondation est obligatoire."); return false; }
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => s - 1);
  };

  const handleFinish = () => {
    const newSyndicate = {
      id: `s${Date.now()}`,
      name: form.name,
      sector: form.sector,
      members: parseInt(form.memberCount) || 0,
      admin: user?.name ?? "Admin",
      status: "active" as const,
      createdAt: new Date().toISOString().slice(0, 10),
      region: form.region,
    };
    addSyndicate(newSyndicate);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Syndicat créé !",
      `Le syndicat "${form.name}" a été créé avec succès. Vous pouvez maintenant inviter des membres.`,
      [{ text: "Voir le tableau de bord", onPress: () => router.replace("/(tabs)/" as any) }]
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Renseignez les informations d'identité principales de votre syndicat.
            </Text>
            <Field label="Nom complet du syndicat *" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Ex: Syndicat National des Enseignants" placeholderTextColor={colors.mutedForeground} value={form.name} onChangeText={(v) => up("name", v)} />
            </Field>
            <Field label="Sigle / Abréviation *" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Ex: SNE" placeholderTextColor={colors.mutedForeground} value={form.abbreviation} onChangeText={(v) => up("abbreviation", v.toUpperCase())} autoCapitalize="characters" />
            </Field>
            <Field label="Mission / Description" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground, minHeight: 70 }]}
                placeholder="Décrivez la mission principale du syndicat..."
                placeholderTextColor={colors.mutedForeground}
                value={form.mission}
                onChangeText={(v) => up("mission", v)}
                multiline
              />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Secteur d'activité</Text>
            <View style={styles.chipGrid}>
              {SECTORS.map((s) => (
                <TouchableOpacity key={s} style={[styles.chip, { backgroundColor: form.sector === s ? colors.primary : colors.muted, borderColor: form.sector === s ? colors.primary : colors.border }]} onPress={() => { up("sector", s); Haptics.selectionAsync(); }}>
                  <Text style={[styles.chipText, { color: form.sector === s ? "#fff" : colors.foreground }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Région</Text>
            <View style={styles.chipGrid}>
              {REGIONS.map((r) => (
                <TouchableOpacity key={r} style={[styles.chip, { backgroundColor: form.region === r ? colors.primary : colors.muted, borderColor: form.region === r ? colors.primary : colors.border }]} onPress={() => { up("region", r); Haptics.selectionAsync(); }}>
                  <Text style={[styles.chipText, { color: form.region === r ? "#fff" : colors.foreground }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Ces coordonnées seront visibles par les membres et affichées dans l'annuaire.
            </Text>
            <Field label="Email officiel *" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="contact@syndicat.ma" placeholderTextColor={colors.mutedForeground} value={form.email} onChangeText={(v) => up("email", v)} keyboardType="email-address" autoCapitalize="none" />
            </Field>
            <Field label="Téléphone *" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="+212 5 00 00 00 00" placeholderTextColor={colors.mutedForeground} value={form.phone} onChangeText={(v) => up("phone", v)} keyboardType="phone-pad" />
            </Field>
            <Field label="Site web" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="https://www.syndicat.ma" placeholderTextColor={colors.mutedForeground} value={form.website} onChangeText={(v) => up("website", v)} autoCapitalize="none" />
            </Field>
            <Field label="Adresse du siège" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground, minHeight: 60 }]}
                placeholder="Numéro, rue, ville..."
                placeholderTextColor={colors.mutedForeground}
                value={form.address}
                onChangeText={(v) => up("address", v)}
                multiline
              />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Couleur / Logo du syndicat</Text>
            <View style={styles.colorGrid}>
              {LOGO_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }]}
                  onPress={() => { up("logoColor", c); Haptics.selectionAsync(); }}
                >
                  {form.logoColor === c && (
                    <View style={styles.colorCheck}>
                      <Feather name="check" size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.logoPreview}>
              <View style={[styles.logoCircle, { backgroundColor: form.logoColor }]}>
                <Text style={styles.logoAbbr}>{form.abbreviation || "SND"}</Text>
              </View>
              <View>
                <Text style={[styles.logoName, { color: colors.foreground }]}>{form.name || "Nom du syndicat"}</Text>
                <Text style={[styles.logoSector, { color: colors.mutedForeground }]}>{form.sector}</Text>
              </View>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Informations juridiques requises conformément au Dahir n° 1-57-119 du 16 juillet 1957.
            </Text>
            <Field label="Numéro d'enregistrement *" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Ex: 2024-SYN-001234" placeholderTextColor={colors.mutedForeground} value={form.registrationNumber} onChangeText={(v) => up("registrationNumber", v)} />
            </Field>
            <Field label="Date de fondation *" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.mutedForeground} value={form.foundingDate} onChangeText={(v) => up("foundingDate", v)} />
            </Field>
            <Field label="Nombre initial de membres" colors={colors}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Ex: 50" placeholderTextColor={colors.mutedForeground} value={form.memberCount} onChangeText={(v) => up("memberCount", v)} keyboardType="numeric" />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Forme juridique</Text>
            <View style={styles.chipGrid}>
              {LEGAL_FORMS.map((f) => (
                <TouchableOpacity key={f} style={[styles.chip, { backgroundColor: form.legalForm === f ? colors.primary : colors.muted, borderColor: form.legalForm === f ? colors.primary : colors.border }]} onPress={() => { up("legalForm", f); Haptics.selectionAsync(); }}>
                  <Text style={[styles.chipText, { color: form.legalForm === f ? "#fff" : colors.foreground }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.legalNote, { backgroundColor: "#3b82f618", borderColor: "#3b82f630" }]}>
              <Feather name="info" size={14} color="#3b82f6" />
              <Text style={[styles.legalNoteText, { color: "#3b82f6" }]}>
                Ces informations seront vérifiées lors de la validation de votre syndicat sur la plateforme. Assurez-vous de la conformité avec le Dahir 1-57-119.
              </Text>
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Configurez les paramètres financiers et d'adhésion de votre syndicat.
            </Text>

            {/* Preview card */}
            <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.previewHeader}>
                <View style={[styles.previewLogo, { backgroundColor: form.logoColor }]}>
                  <Text style={styles.previewAbbr}>{form.abbreviation || "SND"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.previewName, { color: colors.foreground }]}>{form.name || "Nom du syndicat"}</Text>
                  <Text style={[styles.previewMeta, { color: colors.mutedForeground }]}>{form.legalForm}</Text>
                  <Text style={[styles.previewMeta, { color: colors.mutedForeground }]}>{form.region} · {form.sector}</Text>
                </View>
              </View>
              <View style={[styles.previewSep, { backgroundColor: colors.border }]} />
              {[
                { icon: "mail" as const, value: form.email || "Non renseigné" },
                { icon: "phone" as const, value: form.phone || "Non renseigné" },
                { icon: "file-text" as const, value: `N° ${form.registrationNumber || "Non renseigné"}` },
                { icon: "calendar" as const, value: `Fondé le ${form.foundingDate || "Non renseigné"}` },
              ].map(({ icon, value }, i) => (
                <View key={i} style={styles.previewRow}>
                  <Feather name={icon} size={13} color={colors.mutedForeground} />
                  <Text style={[styles.previewValue, { color: colors.mutedForeground }]}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Montant cotisation (MAD)</Text>
            <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="150" placeholderTextColor={colors.mutedForeground} value={form.cotisationAmount} onChangeText={(v) => up("cotisationAmount", v)} keyboardType="numeric" />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Cycle de cotisation</Text>
            <View style={styles.cycleRow}>
              {COTISATION_CYCLES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cycleChip, { backgroundColor: form.cotisationCycle === c ? colors.primary + "18" : colors.muted, borderColor: form.cotisationCycle === c ? colors.primary : colors.border }]}
                  onPress={() => { up("cotisationCycle", c); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.cycleText, { color: form.cotisationCycle === c ? colors.primary : colors.mutedForeground }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.summaryBox, { backgroundColor: colors.muted }]}>
              <Text style={[styles.summaryLine, { color: colors.foreground }]}>
                Cotisation de <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{form.cotisationAmount} MAD</Text> {form.cotisationCycle.toLowerCase()} par membre
              </Text>
              {form.memberCount ? (
                <Text style={[styles.summaryLine, { color: colors.mutedForeground }]}>
                  Revenus estimés: {(parseInt(form.cotisationAmount || "0") * parseInt(form.memberCount || "0")).toLocaleString()} MAD / {form.cotisationCycle === "Mensuel" ? "mois" : form.cotisationCycle === "Trimestriel" ? "trimestre" : "an"}
                </Text>
              ) : null}
            </View>
          </View>
        );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          {step > 1 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Créer un syndicat</Text>
            <Text style={[styles.stepIndicator, { color: colors.mutedForeground }]}>Étape {step} / {TOTAL_STEPS}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.stepTabs}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <View key={label} style={styles.stepTab}>
                <View style={[styles.stepCircle, {
                  backgroundColor: done ? colors.primary : active ? colors.primary + "20" : colors.muted,
                  borderColor: active ? colors.primary : "transparent",
                  borderWidth: active ? 2 : 0,
                }]}>
                  {done ? (
                    <Feather name="check" size={12} color="#fff" />
                  ) : (
                    <Feather name={STEP_ICONS[i]} size={12} color={active ? colors.primary : colors.mutedForeground} />
                  )}
                </View>
                <Text style={[styles.stepTabText, { color: active ? colors.primary : colors.mutedForeground }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>
          {["Identité du syndicat", "Contact & Apparence", "Informations légales", "Configuration & Récapitulatif"][step - 1]}
        </Text>
        {renderStep()}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={step === TOTAL_STEPS ? handleFinish : handleNext}
          activeOpacity={0.85}
        >
          {step === TOTAL_STEPS ? (
            <>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.nextBtnText}>Créer le syndicat</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextBtnText}>Continuer</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stepIndicator: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepTabs: { flexDirection: "row", justifyContent: "space-between" },
  stepTab: { alignItems: "center", gap: 4, flex: 1 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepTabText: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  stepTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
  stepContent: { gap: 16 },
  stepDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  fieldBox: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorDot: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  colorCheck: { width: "100%", height: "100%", borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)" },
  logoPreview: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, backgroundColor: "transparent" },
  logoCircle: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  logoAbbr: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  logoName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  logoSector: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  legalNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  legalNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  previewCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  previewLogo: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  previewAbbr: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  previewName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  previewMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  previewSep: { height: 1, marginHorizontal: 16 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  previewValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cycleRow: { flexDirection: "row", gap: 10 },
  cycleChip: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  cycleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryBox: { padding: 14, borderRadius: 14, gap: 4 },
  summaryLine: { fontSize: 13, fontFamily: "Inter_500Medium" },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16 },
  nextBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  nextBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
