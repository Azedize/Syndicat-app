import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

const STRINGS = {
  salaire: {
    fr: "Salaire",
    en: "Salary",
    ar: "الراتب",
    es: "Salario",
  },
  conditionTravail: {
    fr: "Conditions de travail",
    en: "Working conditions",
    ar: "ظروف العمل",
    es: "Condiciones de trabajo",
  },
  discrimination: {
    fr: "Discrimination",
    en: "Discrimination",
    ar: "التمييز",
    es: "Discriminación",
  },
  harcelement: {
    fr: "Harcèlement",
    en: "Harassment",
    ar: "التحرش",
    es: "Acoso",
  },
  licenciement: {
    fr: "Licenciement",
    en: "Dismissal",
    ar: "الفصل",
    es: "Despido",
  },
  conge: {
    fr: "Congé",
    en: "Leave",
    ar: "إجازة",
    es: "Vacaciones",
  },
  avancement: {
    fr: "Avancement",
    en: "Advancement",
    ar: "الترقية",
    es: "Ascenso",
  },
  securite: {
    fr: "Sécurité",
    en: "Security",
    ar: "الأمن",
    es: "Seguridad",
  },
  autre: {
    fr: "Autre",
    en: "Other",
    ar: "آخر",
    es: "Otro",
  },
  deposee: {
    fr: "Déposée",
    en: "Filed",
    ar: "مقدمة",
    es: "Presentada",
  },
  enInstruction: {
    fr: "En instruction",
    en: "Under review",
    ar: "قيد المراجعة",
    es: "En instrucción",
  },
  transmiseDirection: {
    fr: "Transmise direction",
    en: "Forwarded to management",
    ar: "مرسلة للإدارة",
    es: "Transmitida a la dirección",
  },
  enMediation: {
    fr: "En médiation",
    en: "In mediation",
    ar: "في وساطة",
    es: "En mediación",
  },
  resolue: {
    fr: "Résolue",
    en: "Resolved",
    ar: "تم حلها",
    es: "Resuelta",
  },
  classee: {
    fr: "Classée",
    en: "Closed",
    ar: "مؤرشفة",
    es: "Archivada",
  },
  contentieux: {
    fr: "Contentieux",
    en: "Litigation",
    ar: "نزاع قضائي",
    es: "Contencioso",
  },
  urgente: {
    fr: "Urgente",
    en: "Urgent",
    ar: "عاجلة",
    es: "Urgente",
  },
  haute: {
    fr: "Haute",
    en: "High",
    ar: "عالية",
    es: "Alta",
  },
  normale: {
    fr: "Normale",
    en: "Normal",
    ar: "عادية",
    es: "Normal",
  },
  basse: {
    fr: "Basse",
    en: "Low",
    ar: "منخفضة",
    es: "Baja",
  },
  champsRequis: {
    fr: "Champs requis",
    en: "Required fields",
    ar: "حقول مطلوبة",
    es: "Campos requeridos",
  },
  veuillezRenseigner: {
    fr: "Veuillez renseigner le titre et la description.",
    en: "Please provide both title and description.",
    ar: "يرجى تقديم العنوان والوصف.",
    es: "Por favor, proporcione el título y la descripción.",
  },
  reclamationDeposee: {
    fr: "Réclamation déposée",
    en: "Claim filed",
    ar: "تم تقديم المطالبة",
    es: "Reclamación presentada",
  },
  reclamationEnregistree: {
    fr: "Votre réclamation a été enregistrée.\nRéférence : REC-2026-048\n\nLe syndicat vous contactera dans les 48h ouvrées.",
    en: "Your claim has been recorded.\nReference: REC-2026-048\n\nThe union will contact you within 48 business hours.",
    ar: "تم تسجيل مطالبتك.\nالمرجع: REC-2026-048\n\nستتصل بك النقابة في غضون 48 ساعة عمل.",
    es: "Su reclamación ha sido registrada.\nReferencia: REC-2026-048\n\nEl sindicato se pondrá en contacto con usted en un plazo de 48 horas hábiles.",
  },
  screenTitle: {
    fr: "Réclamations & Griefs",
    en: "Claims & Grievances",
    ar: "المطالبات والتظلمات",
    es: "Reclamaciones y Quejas",
  },
  enCoursUrgentes: {
    fr: "en cours · {urgentes} urgentes",
    en: "in progress · {urgentes} urgent",
    ar: "{urgentes} قيد التنفيذ · عاجلة",
    es: "en curso · {urgentes} urgentes",
  },
  vosReclamations: {
    fr: "Vos réclamations syndicales",
    en: "Your union claims",
    ar: "مطالباتك النقابية",
    es: "Tus reclamaciones sindicales",
  },
  deposer: {
    fr: "Déposer",
    en: "File",
    ar: "تقديم",
    es: "Presentar",
  },
  total: {
    fr: "Total",
    en: "Total",
    ar: "المجموع",
    es: "Total",
  },
  enCours: {
    fr: "En cours",
    en: "In progress",
    ar: "قيد التنفيذ",
    es: "En curso",
  },
  resolues: {
    fr: "Résolues",
    en: "Resolved",
    ar: "تم حلها",
    es: "Resueltas",
  },
  urgentesLabel: {
    fr: "Urgentes",
    en: "Urgent",
    ar: "عاجلة",
    es: "Urgentes",
  },
  rechercher: {
    fr: "Rechercher une réclamation...",
    en: "Search a claim...",
    ar: "البحث عن مطالبة...",
    es: "Buscar una reclamación...",
  },
  toutes: {
    fr: "Toutes",
    en: "All",
    ar: "الكل",
    es: "Todas",
  },
  aucuneReclamation: {
    fr: "Aucune réclamation",
    en: "No claims",
    ar: "لا توجد مطالبات",
    es: "No hay reclamaciones",
  },
  aucuneMatch: {
    fr: "Aucune réclamation ne correspond aux filtres.",
    en: "No claims match the filters.",
    ar: "لا توجد مطالبات تطابق الفلاتر.",
    es: "Ninguna reclamación coincide con los filtros.",
  },
  pasEncoreDepose: {
    fr: "Vous n'avez pas encore déposé de réclamation.\nDéposez-en une via le bouton ci-dessus.",
    en: "You haven't filed a claim yet.\nFile one using the button above.",
    ar: "لم تقدم أي مطالبة بعد.\nقدم واحدة عبر الزر أعلاه.",
    es: "Aún no ha presentado ninguna reclamación.\nPresente una mediante el botón de arriba.",
  },
  anonyme: {
    fr: "Anonyme",
    en: "Anonymous",
    ar: "مجهول",
    es: "Anónimo",
  },
  deposeeLe: {
    fr: "Déposée le",
    en: "Filed on",
    ar: "قدمت في",
    es: "Presentada el",
  },
  etapesCount: {
    fr: "étapes",
    en: "steps",
    ar: "خطوات",
    es: "pasos",
  },
  priorite: {
    fr: "Priorité",
    en: "Priority",
    ar: "الأولوية",
    es: "Prioridad",
  },
  description: {
    fr: "Description",
    en: "Description",
    ar: "الوصف",
    es: "Descripción",
  },
  informations: {
    fr: "Informations",
    en: "Information",
    ar: "المعلومات",
    es: "Información",
  },
  membre: {
    fr: "Membre",
    en: "Member",
    ar: "عضو",
    es: "Miembro",
  },
  service: {
    fr: "Service",
    en: "Department",
    ar: "المصلحة",
    es: "Servicio",
  },
  dateDepot: {
    fr: "Date de dépôt",
    en: "Date filed",
    ar: "تاريخ التقديم",
    es: "Fecha de presentación",
  },
  echeance: {
    fr: "Échéance",
    en: "Due date",
    ar: "الموعد النهائي",
    es: "Vencimiento",
  },
  dateCloture: {
    fr: "Date clôture",
    en: "Closing date",
    ar: "تاريخ الإغلاق",
    es: "Fecha de cierre",
  },
  traitePar: {
    fr: "Traité par",
    en: "Handled by",
    ar: "عولج من قبل",
    es: "Tratado por",
  },
  noteDelegue: {
    fr: "Note du délégué",
    en: "Delegate note",
    ar: "ملاحظة المندوب",
    es: "Nota del delegado",
  },
  documentsJoints: {
    fr: "Documents joints",
    en: "Attached documents",
    ar: "الوثائق المرفقة",
    es: "Documentos adjuntos",
  },
  historique: {
    fr: "Historique",
    en: "History",
    ar: "السجل",
    es: "Historial",
  },
  marquerResolue: {
    fr: "Marquer résolue",
    en: "Mark as resolved",
    ar: "تحديد كمحلولة",
    es: "Marcar como resuelta",
  },
  mediation: {
    fr: "Médiation",
    en: "Mediation",
    ar: "وساطة",
    es: "Mediación",
  },
  alertMediation: {
    fr: "Procédure de médiation engagée.",
    en: "Mediation procedure initiated.",
    ar: "بدأت إجراءات الوساطة.",
    es: "Procedimiento de mediación iniciado.",
  },
  alertContentieux: {
    fr: "Dossier transmis au service juridique pour procédure contentieuse.",
    en: "Case forwarded to legal department for litigation proceedings.",
    ar: "تم إرسال الملف إلى القسم القانوني لاتخاذ إجراءات التقاضي.",
    es: "Expediente remitido al departamento jurídico para procedimiento contencioso.",
  },
  deposerReclamation: {
    fr: "Déposer une réclamation",
    en: "File a claim",
    ar: "تقديم مطالبة",
    es: "Presentar una reclamación",
  },
  infoBulleTraitement: {
    fr: "Votre réclamation sera traitée par votre délégué syndical dans un délai de 48h ouvrées. Vous pouvez choisir de rester anonyme.",
    en: "Your claim will be handled by your union delegate within 48 business hours. You can choose to remain anonymous.",
    ar: "سيتم التعامل مع مطالبتك من قبل مندوبك النقابي في غضون 48 ساعة عمل. يمكنك اختيار البقاء مجهول الهوية.",
    es: "Su reclamación será tratada por su delegado sindical en un plazo de 48 horas hábiles. Puede optar por permanecer en el anonimato.",
  },
  typeReclamation: {
    fr: "Type de réclamation *",
    en: "Claim type *",
    ar: "نوع المطالبة *",
    es: "Tipo de reclamación *",
  },
  titreReclamation: {
    fr: "Titre de la réclamation *",
    en: "Claim title *",
    ar: "عنوان المطالبة *",
    es: "Título de la reclamación *",
  },
  titrePlaceholder: {
    fr: "Ex: Non-paiement des heures supplémentaires",
    en: "Ex: Non-payment of overtime",
    ar: "مثال: عدم دفع الساعات الإضافية",
    es: "Ej: Impago de horas extras",
  },
  descDetaille: {
    fr: "Description détaillée *",
    en: "Detailed description *",
    ar: "وصف مفصل *",
    es: "Descripción detallada *",
  },
  descPlaceholder: {
    fr: "Décrivez les faits, dates, personnes impliquées, articles du Code du Travail si connus...",
    en: "Describe the facts, dates, people involved, Labor Code articles if known...",
    ar: "صف الوقائع، التواريخ، الأشخاص المعنيين، مواد قانون الشغل إذا كانت معروفة...",
    es: "Describa los hechos, fechas, personas involucradas, artículos del Código del Trabajo si se conocen...",
  },
  reclamationAnonyme: {
    fr: "Réclamation anonyme",
    en: "Anonymous claim",
    ar: "مطالبة مجهولة",
    es: "Reclamación anónima",
  },
  identitePasCommuniquee: {
    fr: "Votre identité ne sera pas communiquée à l'employeur",
    en: "Your identity will not be shared with the employer",
    ar: "لن يتم الكشف عن هويتك لصاحب العمل",
    es: "Su identidad no será comunicada al empleador",
  },
  deposerLaReclamation: {
    fr: "Déposer la réclamation",
    en: "File the claim",
    ar: "تقديم المطالبة",
    es: "Presentar la reclamación",
  },
  anonymeProtege: {
    fr: "Anonyme (protégé)",
    en: "Anonymous (protected)",
    ar: "مجهول (محمي)",
    es: "Anónimo (protegido)",
  },
};

type ReclamationType =
  | "salaire"
  | "condition_travail"
  | "discrimination"
  | "harcelement"
  | "licenciement"
  | "conge"
  | "avancement"
  | "securite"
  | "autre";

type ReclamationStatut =
  | "deposee"
  | "en_instruction"
  | "transmise_direction"
  | "en_mediation"
  | "resolue"
  | "classee"
  | "contentieux";

type ReclamationPriorite = "urgente" | "haute" | "normale" | "basse";

interface Reclamation {
  id: string;
  reference: string;
  type: ReclamationType;
  statut: ReclamationStatut;
  priorite: ReclamationPriorite;
  titre: string;
  description: string;
  membre: string;
  membreId: string;
  service: string;
  dateDepot: string;
  dateEcheance?: string;
  dateCloture?: string;
  traitePar?: string;
  commentaireAdmin?: string;
  documentsJoints: string[];
  etapes: { date: string; action: string; auteur: string }[];
  anonymous: boolean;
}

const TYPE_CONFIG: Record<ReclamationType, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  salaire: { label: "salaire", icon: "dollar-sign", color: "#10b981" },
  condition_travail: { label: "conditionTravail", icon: "tool", color: "#f59e0b" },
  discrimination: { label: "discrimination", icon: "alert-octagon", color: "#ef4444" },
  harcelement: { label: "harcelement", icon: "slash", color: "#dc2626" },
  licenciement: { label: "licenciement", icon: "user-x", color: "#ef4444" },
  conge: { label: "conge", icon: "calendar", color: "#3b82f6" },
  avancement: { label: "avancement", icon: "trending-up", color: "#7c3aed" },
  securite: { label: "securite", icon: "shield", color: "#f97316" },
  autre: { label: "autre", icon: "more-horizontal", color: "#6b7280" },
};

const STATUT_CONFIG: Record<ReclamationStatut, { label: string; color: string }> = {
  deposee: { label: "deposee", color: "#6b7280" },
  en_instruction: { label: "enInstruction", color: "#3b82f6" },
  transmise_direction: { label: "transmiseDirection", color: "#f59e0b" },
  en_mediation: { label: "enMediation", color: "#7c3aed" },
  resolue: { label: "resolue", color: "#10b981" },
  classee: { label: "classee", color: "#6b7280" },
  contentieux: { label: "contentieux", color: "#ef4444" },
};

const PRIORITE_CONFIG: Record<ReclamationPriorite, { label: string; color: string }> = {
  urgente: { label: "urgente", color: "#dc2626" },
  haute: { label: "haute", color: "#ef4444" },
  normale: { label: "normale", color: "#f59e0b" },
  basse: { label: "basse", color: "#6b7280" },
};

const RECLAMATIONS: Reclamation[] = [
  {
    id: "r1",
    reference: "REC-2026-047",
    type: "salaire",
    statut: "en_instruction",
    priorite: "haute",
    titre: "Non-paiement des heures supplémentaires — Mars à Mai 2026",
    description: "Depuis mars 2026, mes heures supplémentaires (environ 24h/mois) ne sont pas intégrées dans le bulletin de paie. Malgré deux relances RH restées sans réponse, la situation perdure. Conformément à l'article 201 du Code du Travail, je sollicite le paiement de ces heures majorées à 25%.",
    membre: "Mohammed Alaoui",
    membreId: "1",
    service: "Département Informatique",
    dateDepot: "2026-06-10",
    dateEcheance: "2026-06-24",
    traitePar: "Fatima Zahra El Alami",
    documentsJoints: ["Relevé heures supplémentaires.pdf", "Bulletins de paie mars-mai.pdf"],
    etapes: [
      { date: "2026-06-10", action: "Réclamation déposée auprès du syndicat", auteur: "Mohammed Alaoui" },
      { date: "2026-06-11", action: "Accusé de réception envoyé au membre", auteur: "Système" },
      { date: "2026-06-12", action: "Dossier pris en charge — affectation délégué", auteur: "Fatima Zahra El Alami" },
      { date: "2026-06-15", action: "Courrier de mise en demeure transmis à la RH", auteur: "Fatima Zahra El Alami" },
    ],
    anonymous: false,
  },
  {
    id: "r2",
    reference: "REC-2026-046",
    type: "condition_travail",
    statut: "transmise_direction",
    priorite: "normale",
    titre: "Locaux de travail insalubres — Bâtiment C",
    description: "Le bâtiment C présente des problèmes d'humidité et de ventilation depuis octobre 2025. Plusieurs collègues ont développé des pathologies respiratoires. Le médecin du travail a été saisi mais aucune mesure corrective n'a été prise par l'employeur.",
    membre: "Khadija Tahiri",
    membreId: "2",
    service: "Administration",
    dateDepot: "2026-06-05",
    dateEcheance: "2026-06-30",
    traitePar: "Rachid Bennis",
    commentaireAdmin: "Courrier adressé à la direction le 8 juin. Réunion CHSCT prévue le 25 juin.",
    documentsJoints: ["Rapport médecin travail.pdf", "Photos locaux.pdf"],
    etapes: [
      { date: "2026-06-05", action: "Réclamation déposée", auteur: "Khadija Tahiri" },
      { date: "2026-06-08", action: "Dossier transmis à la direction", auteur: "Rachid Bennis" },
      { date: "2026-06-10", action: "Accusé de réception direction reçu", auteur: "Système" },
    ],
    anonymous: false,
  },
  {
    id: "r3",
    reference: "REC-2026-045",
    type: "harcelement",
    statut: "en_mediation",
    priorite: "urgente",
    titre: "Harcèlement moral — Comportement du chef de service",
    description: "Déclaration confidentielle relative à un comportement harcelant de la part d'un responsable hiérarchique direct. Pressions constantes, humiliations en public, surcharge de travail délibérée. Témoin disponible.",
    membre: "Anonyme",
    membreId: "anon",
    service: "Non communiqué",
    dateDepot: "2026-06-08",
    dateEcheance: "2026-06-22",
    traitePar: "Amina Tazi",
    documentsJoints: ["Témoignage écrit.pdf"],
    etapes: [
      { date: "2026-06-08", action: "Réclamation anonyme reçue", auteur: "Système" },
      { date: "2026-06-09", action: "Médiation interne engagée — Désignation médiateur", auteur: "Amina Tazi" },
      { date: "2026-06-12", action: "Première séance de médiation tenue", auteur: "Amina Tazi" },
    ],
    anonymous: true,
  },
  {
    id: "r4",
    reference: "REC-2026-041",
    type: "avancement",
    statut: "resolue",
    priorite: "normale",
    titre: "Blocage injustifié d'avancement — Grade A1",
    description: "Bloqué au même échelon depuis 4 ans sans motif officiel. Les critères d'avancement sont pourtant remplis : évaluations positives, ancienneté, formation professionnelle à jour.",
    membre: "Omar Lahlou",
    membreId: "7",
    service: "Production",
    dateDepot: "2026-05-15",
    dateCloture: "2026-06-03",
    traitePar: "Fatima Zahra El Alami",
    commentaireAdmin: "Résolu favorablement. La direction a accepté de régulariser l'avancement avec effet rétroactif au 01/01/2026.",
    documentsJoints: ["Fiche d'avancement.pdf"],
    etapes: [
      { date: "2026-05-15", action: "Réclamation déposée", auteur: "Omar Lahlou" },
      { date: "2026-05-20", action: "Courrier adressé au DRH", auteur: "Fatima Zahra El Alami" },
      { date: "2026-05-28", action: "Réunion bilatérale avec le DRH", auteur: "Fatima Zahra El Alami" },
      { date: "2026-06-03", action: "Avancement accordé — Réclamation résolue", auteur: "Fatima Zahra El Alami" },
    ],
    anonymous: false,
  },
  {
    id: "r5",
    reference: "REC-2026-039",
    type: "licenciement",
    statut: "contentieux",
    priorite: "urgente",
    titre: "Licenciement abusif sans cause réelle — Affaire Benali",
    description: "Licenciement prononcé sans motif réel ni sérieux le 12 mai 2026, sans respect de la procédure légale (absence d'entretien préalable). Demande de réintégration et/ou indemnités légales conformément aux articles 62 et suivants du Code du Travail.",
    membre: "Hassan Idrissi",
    membreId: "5",
    service: "Commercial",
    dateDepot: "2026-05-14",
    dateEcheance: "2026-07-14",
    traitePar: "Amina Tazi",
    commentaireAdmin: "Dossier transmis au cabinet d'avocats partenaire. Saisine du Tribunal du Travail de Casablanca prévue.",
    documentsJoints: ["Lettre de licenciement.pdf", "Contrat de travail.pdf", "Bulletins de paie.pdf"],
    etapes: [
      { date: "2026-05-14", action: "Réclamation urgente déposée", auteur: "Hassan Idrissi" },
      { date: "2026-05-15", action: "Consultation juridique d'urgence organisée", auteur: "Amina Tazi" },
      { date: "2026-05-20", action: "Mise en demeure transmise à l'employeur", auteur: "Amina Tazi" },
      { date: "2026-06-01", action: "Échec de la conciliation — Passage en contentieux", auteur: "Amina Tazi" },
    ],
    anonymous: false,
  },
  {
    id: "r6",
    reference: "REC-2026-038",
    type: "conge",
    statut: "resolue",
    priorite: "basse",
    titre: "Refus de congé de formation syndicale",
    description: "Demande de congé de 5 jours pour formation syndicale refusée par le responsable direct sans motif valable. L'article 457 du Code du Travail garantit ce droit.",
    membre: "Zineb Berrada",
    membreId: "6",
    service: "Logistique",
    dateDepot: "2026-05-10",
    dateCloture: "2026-05-22",
    traitePar: "Rachid Bennis",
    commentaireAdmin: "Congé accordé après intervention syndicale. Formation effectuée les 26-30 mai.",
    documentsJoints: ["Programme formation.pdf"],
    etapes: [
      { date: "2026-05-10", action: "Réclamation déposée", auteur: "Zineb Berrada" },
      { date: "2026-05-14", action: "Intervention auprès du DRH", auteur: "Rachid Bennis" },
      { date: "2026-05-22", action: "Congé accordé — Réclamation close", auteur: "Rachid Bennis" },
    ],
    anonymous: false,
  },
];

const TYPES_LIST = Object.entries(TYPE_CONFIG) as [ReclamationType, typeof TYPE_CONFIG[ReclamationType]][];

export default function ReclamationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const { lang } = useLanguage();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  const [filterStatut, setFilterStatut] = useState<ReclamationStatut | "all">("all");
  const [filterType, setFilterType] = useState<ReclamationType | "all">("all");
  const [filterPriorite, setFilterPriorite] = useState<ReclamationPriorite | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Reclamation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<ReclamationType>("autre");
  const [newAnon, setNewAnon] = useState(false);
  const [showEtapes, setShowEtapes] = useState(false);

  const filtered = RECLAMATIONS.filter((r) => {
    if (filterStatut !== "all" && r.statut !== filterStatut) return false;
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterPriorite !== "all" && r.priorite !== filterPriorite) return false;
    if (searchText && !r.titre.toLowerCase().includes(searchText.toLowerCase()) && !r.reference.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (!isAdmin && r.membreId !== "0" && r.membreId !== user?.id) return false;
    return true;
  });

  const stats = {
    total: RECLAMATIONS.length,
    enCours: RECLAMATIONS.filter((r) => ["deposee", "en_instruction", "transmise_direction", "en_mediation"].includes(r.statut)).length,
    resolues: RECLAMATIONS.filter((r) => r.statut === "resolue").length,
    urgentes: RECLAMATIONS.filter((r) => r.priorite === "urgente" && r.statut !== "resolue" && r.statut !== "classee").length,
  };

  const handleDeposer = () => {
    if (!newTitle.trim() || !newDesc.trim()) {
      Alert.alert(STRINGS.champsRequis[lang], STRINGS.veuillezRenseigner[lang]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowNew(false);
    setNewTitle("");
    setNewDesc("");
    setNewType("autre");
    setNewAnon(false);
    Alert.alert(STRINGS.reclamationDeposee[lang], STRINGS.reclamationEnregistree[lang]);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.foreground }]}>{STRINGS.screenTitle[lang]}</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            {isAdmin ? STRINGS.enCoursUrgentes[lang].replace("{urgentes}", stats.urgentes.toString()).replace("{enCours}", stats.enCours.toString()) : STRINGS.vosReclamations[lang]}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowNew(true); }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={s.newBtnText}>{STRINGS.deposer[lang]}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar — admin only */}
      {isAdmin && (
        <View style={[s.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {[
            { label: STRINGS.total[lang], value: stats.total, color: colors.foreground },
            { label: STRINGS.enCours[lang], value: stats.enCours, color: "#3b82f6" },
            { label: STRINGS.resolues[lang], value: stats.resolues, color: "#10b981" },
            { label: STRINGS.urgentesLabel[lang], value: stats.urgentes, color: "#ef4444" },
          ].map((st) => (
            <View key={st.label} style={s.statItem}>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{st.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder={STRINGS.rechercher[lang]}
            placeholderTextColor={colors.mutedForeground}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }} contentContainerStyle={s.filterRow}>
        {(["all", "deposee", "en_instruction", "transmise_direction", "en_mediation", "resolue", "contentieux"] as (ReclamationStatut | "all")[]).map((st) => {
          const cfg = st === "all" ? null : STATUT_CONFIG[st];
          const active = filterStatut === st;
          const count = st === "all" ? filtered.length : filtered.filter((r) => r.statut === st).length;
          return (
            <TouchableOpacity
              key={st}
              style={[s.chip, { backgroundColor: active ? (cfg?.color ?? colors.primary) : colors.card, borderColor: active ? (cfg?.color ?? colors.primary) : colors.border }]}
              onPress={() => { setFilterStatut(st); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[s.chipText, { color: active ? "#fff" : colors.foreground }]}>
                {st === "all" ? `${STRINGS.toutes[lang]} (${count})` : `${STRINGS[cfg?.label as keyof typeof STRINGS][lang]} (${count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="inbox" size={32} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>{STRINGS.aucuneReclamation[lang]}</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {isAdmin ? STRINGS.aucuneMatch[lang] : STRINGS.pasEncoreDepose[lang]}
            </Text>
          </View>
        )}

        {filtered.map((rec) => {
          const tc = TYPE_CONFIG[rec.type];
          const sc = STATUT_CONFIG[rec.statut];
          const pc = PRIORITE_CONFIG[rec.priorite];
          return (
            <TouchableOpacity
              key={rec.id}
              style={[s.card, { backgroundColor: colors.card, borderColor: rec.priorite === "urgente" ? "#ef444440" : colors.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelected(rec); setShowEtapes(false); }}
              activeOpacity={0.75}
            >
              <View style={s.cardTop}>
                <View style={[s.typeIcon, { backgroundColor: tc.color + "18" }]}>
                  <Feather name={tc.icon} size={18} color={tc.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.badgeRow}>
                    <View style={[s.badge, { backgroundColor: sc.color + "18" }]}>
                      <Text style={[s.badgeText, { color: sc.color }]}>{STRINGS[sc.label as keyof typeof STRINGS][lang]}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: pc.color + "18" }]}>
                      <Text style={[s.badgeText, { color: pc.color }]}>{STRINGS[pc.label as keyof typeof STRINGS][lang]}</Text>
                    </View>
                    {rec.anonymous && (
                      <View style={[s.badge, { backgroundColor: "#6b728018" }]}>
                        <Text style={[s.badgeText, { color: "#6b7280" }]}>{STRINGS.anonyme[lang]}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{rec.titre}</Text>
                  <Text style={[s.cardRef, { color: colors.mutedForeground }]}>{rec.reference} · {STRINGS[tc.label as keyof typeof STRINGS][lang]}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
              <View style={[s.cardFooter, { borderTopColor: colors.border }]}>
                <View style={s.metaItem}>
                  <Feather name="user" size={11} color={colors.mutedForeground} />
                  <Text style={[s.metaText, { color: colors.mutedForeground }]}>{rec.anonymous ? STRINGS.anonyme[lang] : rec.membre}</Text>
                </View>
                <View style={s.metaItem}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[s.metaText, { color: colors.mutedForeground }]}>{STRINGS.deposeeLe[lang]} {new Date(rec.dateDepot).toLocaleDateString(lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-MA" : "es-ES")}</Text>
                </View>
                {rec.etapes.length > 0 && (
                  <View style={s.metaItem}>
                    <Feather name="list" size={11} color={colors.mutedForeground} />
                    <Text style={[s.metaText, { color: colors.mutedForeground }]}>{rec.etapes.length} {STRINGS.etapesCount[lang]}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (() => {
          const tc = TYPE_CONFIG[selected.type];
          const sc = STATUT_CONFIG[selected.statut];
          const pc = PRIORITE_CONFIG[selected.priorite];
          return (
            <View style={[s.modal, { backgroundColor: colors.background }]}>
              <View style={[s.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <View style={[s.typeIcon, { backgroundColor: tc.color + "18" }]}>
                  <Feather name={tc.icon} size={20} color={tc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: colors.foreground }]} numberOfLines={2}>{selected.titre}</Text>
                  <Text style={[s.modalRef, { color: colors.mutedForeground }]}>{selected.reference}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                  <Feather name="x" size={22} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}>
                {/* Status & priority */}
                <View style={s.badgeRowLarge}>
                  <View style={[s.badgeLg, { backgroundColor: sc.color + "18", borderColor: sc.color + "30" }]}>
                    <View style={[s.dot, { backgroundColor: sc.color }]} />
                    <Text style={[s.badgeLgText, { color: sc.color }]}>{STRINGS[sc.label as keyof typeof STRINGS][lang]}</Text>
                  </View>
                  <View style={[s.badgeLg, { backgroundColor: pc.color + "18", borderColor: pc.color + "30" }]}>
                    <Text style={[s.badgeLgText, { color: pc.color }]}>{STRINGS.priorite[lang]} {STRINGS[pc.label as keyof typeof STRINGS][lang]}</Text>
                  </View>
                  <View style={[s.badgeLg, { backgroundColor: tc.color + "18", borderColor: tc.color + "30" }]}>
                    <Text style={[s.badgeLgText, { color: tc.color }]}>{STRINGS[tc.label as keyof typeof STRINGS][lang]}</Text>
                  </View>
                </View>

                {/* Description */}
                <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>{STRINGS.description[lang]}</Text>
                  <Text style={[s.sectionBody, { color: colors.mutedForeground }]}>{selected.description}</Text>
                </View>

                {/* Info grid */}
                <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>{STRINGS.informations[lang]}</Text>
                  {[
                    { label: STRINGS.membre[lang], value: selected.anonymous ? STRINGS.anonymeProtege[lang] : selected.membre, icon: "user" as const },
                    { label: STRINGS.service[lang], value: selected.service, icon: "briefcase" as const },
                    { label: STRINGS.dateDepot[lang], value: new Date(selected.dateDepot).toLocaleDateString(lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-MA" : "es-ES"), icon: "calendar" as const },
                    ...(selected.dateEcheance ? [{ label: STRINGS.echeance[lang], value: new Date(selected.dateEcheance).toLocaleDateString(lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-MA" : "es-ES"), icon: "clock" as const }] : []),
                    ...(selected.dateCloture ? [{ label: STRINGS.dateCloture[lang], value: new Date(selected.dateCloture).toLocaleDateString(lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-MA" : "es-ES"), icon: "check-circle" as const }] : []),
                    ...(selected.traitePar ? [{ label: STRINGS.traitePar[lang], value: selected.traitePar, icon: "user-check" as const }] : []),
                  ].map((info) => (
                    <View key={info.label} style={[s.infoRow, { borderTopColor: colors.border }]}>
                      <Feather name={info.icon} size={13} color={colors.mutedForeground} />
                      <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{info.label}</Text>
                      <Text style={[s.infoValue, { color: colors.foreground }]}>{info.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Admin comment */}
                {selected.commentaireAdmin && (
                  <View style={[s.section, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
                    <View style={s.sectionTitleRow}>
                      <Feather name="message-circle" size={14} color="#10b981" />
                      <Text style={[s.sectionTitle, { color: "#10b981" }]}>{STRINGS.noteDelegue[lang]}</Text>
                    </View>
                    <Text style={[s.sectionBody, { color: colors.foreground }]}>{selected.commentaireAdmin}</Text>
                  </View>
                )}

                {/* Documents */}
                {selected.documentsJoints.length > 0 && (
                  <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[s.sectionTitle, { color: colors.foreground }]}>{STRINGS.documentsJoints[lang]} ({selected.documentsJoints.length})</Text>
                    {selected.documentsJoints.map((doc, i) => (
                      <TouchableOpacity key={i} style={[s.docRow, { borderTopColor: colors.border }]} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                        <Feather name="file-text" size={14} color="#6366f1" />
                        <Text style={[s.docName, { color: "#6366f1" }]}>{doc}</Text>
                        <Feather name="download" size={14} color="#6366f1" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Timeline */}
                <TouchableOpacity
                  style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { setShowEtapes((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={[s.sectionTitleRow, { justifyContent: "space-between" }]}>
                    <View style={s.sectionTitleRow}>
                      <Feather name="list" size={14} color={colors.primary} />
                      <Text style={[s.sectionTitle, { color: colors.foreground }]}>{STRINGS.historique[lang]} ({selected.etapes.length} {STRINGS.etapesCount[lang]})</Text>
                    </View>
                    <Feather name={showEtapes ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>
                  {showEtapes && selected.etapes.map((etape, i) => (
                    <View key={i} style={[s.etapeRow, { borderTopColor: colors.border }]}>
                      <View style={[s.etapeDot, { backgroundColor: i === selected.etapes.length - 1 ? colors.primary : colors.border }]} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.etapeDate, { color: colors.mutedForeground }]}>{new Date(etape.date).toLocaleDateString(lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-MA" : "es-ES")} · {etape.auteur}</Text>
                        <Text style={[s.etapeAction, { color: colors.foreground }]}>{etape.action}</Text>
                      </View>
                    </View>
                  ))}
                </TouchableOpacity>

                {/* Admin actions */}
                {isAdmin && selected.statut !== "resolue" && selected.statut !== "classee" && (
                  <View style={s.actionsRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#10b981" }]}
                      onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert(STRINGS.resolue[lang], STRINGS.resolue[lang]); setSelected(null); }}
                    >
                      <Feather name="check-circle" size={14} color="#fff" />
                      <Text style={s.actionBtnText}>{STRINGS.marquerResolue[lang]}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#7c3aed" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert(STRINGS.mediation[lang], STRINGS.alertMediation[lang]); }}
                    >
                      <Feather name="users" size={14} color="#fff" />
                      <Text style={s.actionBtnText}>{STRINGS.mediation[lang]}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: "#ef4444" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); Alert.alert(STRINGS.contentieux[lang], STRINGS.alertContentieux[lang]); }}
                    >
                      <Feather name="alert-triangle" size={14} color="#fff" />
                      <Text style={s.actionBtnText}>{STRINGS.contentieux[lang]}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* New Reclamation Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNew(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Feather name="plus-circle" size={20} color={colors.primary} />
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{STRINGS.deposerReclamation[lang]}</Text>
            <TouchableOpacity onPress={() => setShowNew(false)} style={s.closeBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}>
            {/* Info */}
            <View style={[s.infoBox, { backgroundColor: "#3b82f610", borderColor: "#3b82f630" }]}>
              <Feather name="info" size={14} color="#3b82f6" />
              <Text style={[s.infoBoxText, { color: "#3b82f6" }]}>
                {STRINGS.infoBulleTraitement[lang]}
              </Text>
            </View>

            {/* Type */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>{STRINGS.typeReclamation[lang]}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TYPES_LIST.map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.typeChip, { backgroundColor: newType === key ? cfg.color : colors.card, borderColor: newType === key ? cfg.color : colors.border }]}
                    onPress={() => { setNewType(key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Feather name={cfg.icon} size={13} color={newType === key ? "#fff" : cfg.color} />
                    <Text style={[s.typeChipText, { color: newType === key ? "#fff" : colors.foreground }]}>{STRINGS[cfg.label as keyof typeof STRINGS][lang]}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Title */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>{STRINGS.titreReclamation[lang]}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder={STRINGS.titrePlaceholder[lang]}
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 8 }}>
              <Text style={[s.fieldLabel, { color: colors.foreground }]}>{STRINGS.descDetaille[lang]}</Text>
              <TextInput
                style={[s.textarea, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                placeholder={STRINGS.descPlaceholder[lang]}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
                value={newDesc}
                onChangeText={setNewDesc}
              />
            </View>

            {/* Anonymous toggle */}
            <TouchableOpacity
              style={[s.anonRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setNewAnon((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name={newAnon ? "eye-off" : "eye"} size={16} color={newAnon ? "#7c3aed" : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[s.anonTitle, { color: colors.foreground }]}>{STRINGS.reclamationAnonyme[lang]}</Text>
                <Text style={[s.anonDesc, { color: colors.mutedForeground }]}>{STRINGS.identitePasCommuniquee[lang]}</Text>
              </View>
              <View style={[s.toggle, { backgroundColor: newAnon ? "#7c3aed" : colors.border }]}>
                <View style={[s.toggleThumb, { marginLeft: newAnon ? 20 : 2 }]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary }]} onPress={handleDeposer} activeOpacity={0.85}>
              <Feather name="send" size={16} color="#fff" />
              <Text style={s.submitText}>{STRINGS.deposerLaReclamation[lang]}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  statsBar: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 16 },
  emptyIcon: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  typeIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  cardRef: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardFooter: { flexDirection: "row", gap: 14, flexWrap: "wrap", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, paddingTop: 24, borderBottomWidth: 1, gap: 12 },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  modalRef: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4 },
  badgeRowLarge: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badgeLg: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  badgeLgText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  infoLabel: { width: 110, fontSize: 12, fontFamily: "Inter_400Regular" },
  infoValue: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  docName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  etapeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  etapeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  etapeDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  etapeAction: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, minWidth: 100 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoBoxText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 19 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 120, textAlignVertical: "top" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  anonRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  anonTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  anonDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  toggle: { width: 42, height: 24, borderRadius: 12, justifyContent: "center" },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
