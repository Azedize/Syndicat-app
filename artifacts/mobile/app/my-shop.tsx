import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { LangCode, useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { marketplace } from "@/services/api";
import { ErrorState, LoadingState } from "@/components/DataState";

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  originalPrice?: string | null;
  category: string;
  condition: string;
  brand?: string | null;
  model?: string | null;
  purchaseYear?: string | null;
  sellingReason?: string | null;
  negotiable?: boolean;
  contactPreferences?: string;
  location: string;
  building?: string | null;
  block?: string | null;
  floor?: string | null;
  stock: number;
  status: string;
  rejectionReason: string | null;
  moderationNote?: string | null;
  viewCount: number;
  createdAt: string;
  boosted?: boolean;
  boostType?: string | null;
  boostExpiresAt?: string | null;
  reservedByName?: string | null;
  soldAt?: string | null;
};

type Promotion = {
  id: string;
  productId: string;
  type: string;
  status: string;
  amount: string;
  startDate: string;
  endDate: string;
  rejectionReason?: string | null;
};

type Localized = Record<LangCode, string>;

const SHOP_TEXTS = {
  publishedOne: { fr: "1 publiée", en: "1 published", ar: "إعلان منشور واحد", es: "1 publicada" },
  publishedMany: { fr: "{count} publiées", en: "{count} published", ar: "{count} إعلانات منشورة", es: "{count} publicadas" },
  reservedOne: { fr: "1 réservée", en: "1 reserved", ar: "محجوزة واحدة", es: "1 reservada" },
  reservedMany: { fr: "{count} réservées", en: "{count} reserved", ar: "{count} محجوزة", es: "{count} reservadas" },
  total: { fr: "Total", en: "Total", ar: "المجموع", es: "Total" },
  published: { fr: "Publiées", en: "Published", ar: "منشورة", es: "Publicadas" },
  reserved: { fr: "Réservées", en: "Reserved", ar: "محجوزة", es: "Reservadas" },
  sold: { fr: "Vendues", en: "Sold", ar: "مباعة", es: "Vendidas" },
  views: { fr: "Vues", en: "Views", ar: "المشاهدات", es: "Vistas" },
  viewCount: { fr: "vue(s)", en: "view(s)", ar: "مشاهدة", es: "vista(s)" },
  reservedBy: { fr: "Réservée par", en: "Reserved by", ar: "محجوزة من طرف", es: "Reservada por" },
  resident: { fr: "un résident", en: "a resident", ar: "أحد السكان", es: "un residente" },
  soldOn: { fr: "Vendue le", en: "Sold on", ar: "بيعت في", es: "Vendida el" },
  view: { fr: "Voir", en: "View", ar: "عرض", es: "Ver" },
  soldAction: { fr: "Vendu", en: "Sold", ar: "تم البيع", es: "Vendida" },
  sponsor: { fr: "Sponsoriser", en: "Promote", ar: "ترويج", es: "Patrocinar" },
  deleteConfirm: { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  markSoldTitle: { fr: "Marquer comme vendu", en: "Mark as sold", ar: "وضع علامة تم البيع", es: "Marcar como vendida" },
  markSoldMessage: { fr: "Confirmez que « {name} » a été vendu. La vente sera archivée.", en: "Confirm that “{name}” was sold. The sale will be archived.", ar: "أكد أن « {name} » تم بيعه. سيتم أرشفة عملية البيع.", es: "Confirme que « {name} » se ha vendido. La venta se archivará." },
  archiveSuccessTitle: { fr: "Vendu !", en: "Sold", ar: "تم البيع", es: "Vendida" },
  archiveSuccessMessage: { fr: "Votre annonce est maintenant archivée comme vendue.", en: "Your listing is now archived as sold.", ar: "تمت أرشفة إعلانك كمباع.", es: "Su anuncio está archivado como vendido." },
  markSoldError: { fr: "Impossible de marquer cette annonce comme vendue.", en: "This listing could not be marked as sold.", ar: "تعذر وضع علامة البيع على هذا الإعلان.", es: "No se pudo marcar el anuncio como vendido." },
  deleteMessage: { fr: "Supprimer « {name} » ?", en: "Delete “{name}”?", ar: "هل تريد حذف « {name} »؟", es: "¿Eliminar « {name} »?" },
  deleteError: { fr: "Impossible de supprimer cette annonce.", en: "This listing could not be deleted.", ar: "تعذر حذف هذا الإعلان.", es: "No se pudo eliminar el anuncio." },
  uploadError: { fr: "Impossible de téléverser le fichier. Réessayez.", en: "The file could not be uploaded. Try again.", ar: "تعذر رفع الملف. أعد المحاولة.", es: "No se pudo subir el archivo. Inténtelo de nuevo." },
  promotionSentTitle: { fr: "Demande envoyée", en: "Request sent", ar: "تم إرسال الطلب", es: "Solicitud enviada" },
  promotionSentMessage: { fr: "Votre demande de sponsorisation est en attente de validation du paiement.", en: "Your promotion request is awaiting payment validation.", ar: "طلب الترويج في انتظار التحقق من الدفع.", es: "Su solicitud de promoción espera la validación del pago." },
  promotionError: { fr: "Impossible d'envoyer la demande de sponsorisation.", en: "The promotion request could not be sent.", ar: "تعذر إرسال طلب الترويج.", es: "No se pudo enviar la solicitud de promoción." },
  durationError: { fr: "La durée doit être comprise entre 1 et 90 jours.", en: "The duration must be between 1 and 90 days.", ar: "يجب أن تتراوح المدة بين يوم واحد و90 يوماً.", es: "La duración debe estar entre 1 y 90 días." },
  paymentMethodRequired: { fr: "Indiquez le mode de paiement utilisé.", en: "Enter the payment method used.", ar: "أدخل طريقة الدفع المستخدمة.", es: "Indique el método de pago utilizado." },
  proofRequired: { fr: "Ajoutez une capture du paiement effectué.", en: "Add proof of the completed payment.", ar: "أضف صورة لإثبات الدفع المنجز.", es: "Añada un comprobante del pago realizado." },
  productRequired: { fr: "Le titre et le prix sont obligatoires.", en: "The title and price are required.", ar: "العنوان والسعر مطلوبان.", es: "El título y el precio son obligatorios." },
  invalidPrice: { fr: "Saisissez un prix supérieur à zéro.", en: "Enter a price greater than zero.", ar: "أدخل سعراً أكبر من صفر.", es: "Introduzca un precio superior a cero." },
  contactRequired: { fr: "Sélectionnez au moins un mode de contact.", en: "Select at least one contact method.", ar: "اختر وسيلة اتصال واحدة على الأقل.", es: "Seleccione al menos un medio de contacto." },
  imagesPending: { fr: "Attendez la fin du téléversement des images.", en: "Wait for the images to finish uploading.", ar: "انتظر حتى يكتمل رفع الصور.", es: "Espere a que terminen de subirse las imágenes." },
  saveError: { fr: "Impossible d'enregistrer l'annonce.", en: "The listing could not be saved.", ar: "تعذر حفظ الإعلان.", es: "No se pudo guardar el anuncio." },
  createSuccess: { fr: "Votre annonce a été créée et envoyée pour validation.", en: "Your listing was created and sent for review.", ar: "تم إنشاء إعلانك وإرساله للتحقق.", es: "Su anuncio se creó y se envió para validación." },
  updateSuccess: { fr: "Votre annonce a été mise à jour.", en: "Your listing was updated.", ar: "تم تحديث إعلانك.", es: "Su anuncio se ha actualizado." },
  maximumPhotos: { fr: "Vous pouvez ajouter au maximum 5 photos.", en: "You can add up to 5 photos.", ar: "يمكنك إضافة 5 صور كحد أقصى.", es: "Puede añadir un máximo de 5 fotos." },
  loadingTitle: { fr: "Chargement de votre boutique", en: "Loading your shop", ar: "جارٍ تحميل متجرك", es: "Cargando su tienda" },
  loadingDescription: { fr: "Nous récupérons vos annonces et vos promotions.", en: "We are retrieving your listings and promotions.", ar: "نسترجع إعلاناتك وعروضك الترويجية.", es: "Estamos cargando sus anuncios y promociones." },
  loadErrorTitle: { fr: "Votre boutique est indisponible", en: "Your shop is unavailable", ar: "متجرك غير متاح", es: "Su tienda no está disponible" },
  loadErrorDescription: { fr: "Vos annonces ne peuvent pas être chargées pour le moment. Vérifiez votre connexion puis réessayez.", en: "Your listings cannot be loaded right now. Check your connection and try again.", ar: "لا يمكن تحميل إعلاناتك حالياً. تحقق من الاتصال ثم أعد المحاولة.", es: "Sus anuncios no se pueden cargar ahora. Compruebe la conexión e inténtelo de nuevo." },
  noProductsDescription: { fr: "Publiez votre premier produit et touchez les résidents de votre plateforme.", en: "Publish your first product and reach residents on your platform.", ar: "انشر منتجك الأول وتواصل مع سكان منصتك.", es: "Publique su primer producto y llegue a los residentes de su plataforma." },
  productInfo: { fr: "INFORMATIONS DU PRODUIT", en: "PRODUCT INFORMATION", ar: "معلومات المنتج", es: "INFORMACIÓN DEL PRODUCTO" },
  listingTitle: { fr: "Titre de l'annonce", en: "Listing title", ar: "عنوان الإعلان", es: "Título del anuncio" },
  titlePlaceholder: { fr: "Ex. : Machine à laver Samsung 8 kg", en: "E.g. Samsung 8 kg washing machine", ar: "مثال: غسالة سامسونج 8 كغ", es: "Ej.: lavadora Samsung de 8 kg" },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  condition: { fr: "État", en: "Condition", ar: "الحالة", es: "Estado" },
  brand: { fr: "Marque", en: "Brand", ar: "العلامة التجارية", es: "Marca" },
  model: { fr: "Modèle", en: "Model", ar: "الطراز", es: "Modelo" },
  purchaseYear: { fr: "Année d'achat", en: "Purchase year", ar: "سنة الشراء", es: "Año de compra" },
  description: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  descriptionPlaceholder: { fr: "Décrivez l'état, les caractéristiques et l'historique d'utilisation...", en: "Describe the condition, features and usage history...", ar: "صف الحالة والخصائص وتاريخ الاستخدام...", es: "Describa el estado, las características y el historial de uso..." },
  sellingReason: { fr: "Raison de la vente", en: "Reason for selling", ar: "سبب البيع", es: "Motivo de la venta" },
  sellingReasonPlaceholder: { fr: "Déménagement, remplacement, usage terminé...", en: "Moving, replacement, no longer used...", ar: "الانتقال، الاستبدال، لم يعد مستخدماً...", es: "Mudanza, sustitución, ya no se usa..." },
  priceSection: { fr: "PRIX", en: "PRICE", ar: "السعر", es: "PRECIO" },
  salePrice: { fr: "Prix de vente (MAD)", en: "Sale price (MAD)", ar: "سعر البيع (درهم)", es: "Precio de venta (MAD)" },
  originalPrice: { fr: "Prix original (MAD)", en: "Original price (MAD)", ar: "السعر الأصلي (درهم)", es: "Precio original (MAD)" },
  negotiable: { fr: "Prix négociable", en: "Negotiable price", ar: "السعر قابل للتفاوض", es: "Precio negociable" },
  negotiableDescription: { fr: "Autorisez les acheteurs à vous faire une offre.", en: "Allow buyers to make you an offer.", ar: "اسمح للمشترين بتقديم عرض لك.", es: "Permita que los compradores le hagan una oferta." },
  locationSection: { fr: "LOCALISATION", en: "LOCATION", ar: "الموقع", es: "UBICACIÓN" },
  building: { fr: "Bâtiment", en: "Building", ar: "المبنى", es: "Edificio" },
  block: { fr: "Bloc", en: "Block", ar: "العمارة", es: "Bloque" },
  floor: { fr: "Étage", en: "Floor", ar: "الطابق", es: "Planta" },
  address: { fr: "Adresse", en: "Address", ar: "العنوان", es: "Dirección" },
  contactSection: { fr: "MODES DE CONTACT", en: "CONTACT METHODS", ar: "وسائل الاتصال", es: "MEDIOS DE CONTACTO" },
  internalChat: { fr: "Messagerie interne", en: "Internal messaging", ar: "المراسلة الداخلية", es: "Mensajería interna" },
  phone: { fr: "Téléphone", en: "Phone", ar: "الهاتف", es: "Teléfono" },
  email: { fr: "Email", en: "Email", ar: "البريد الإلكتروني", es: "Correo electrónico" },
  photosSection: { fr: "PHOTOS (5 maximum)", en: "PHOTOS (up to 5)", ar: "الصور (5 كحد أقصى)", es: "FOTOS (máximo 5)" },
  addPhoto: { fr: "Ajouter", en: "Add", ar: "إضافة", es: "Añadir" },
  moderationNote: { fr: "Votre annonce sera soumise à validation avant d'être publiée sur le marketplace.", en: "Your listing will be reviewed before it is published on the marketplace.", ar: "سيتم التحقق من إعلانك قبل نشره في السوق.", es: "Su anuncio se revisará antes de publicarlo en el mercado." },
  sponsorTitle: { fr: "Sponsoriser l'annonce", en: "Promote listing", ar: "ترويج الإعلان", es: "Patrocinar el anuncio" },
  sponsorDescription: { fr: "Choisissez la mise en avant, réglez le montant, puis téléversez le justificatif. Votre annonce sera sponsorisée après validation par l'administration.", en: "Choose the promotion, pay the amount, then upload proof. Your listing will be promoted after administrative validation.", ar: "اختر الترويج وادفع المبلغ ثم ارفع الإثبات. سيتم ترويج إعلانك بعد تحقق الإدارة.", es: "Elija la promoción, pague el importe y suba el comprobante. Su anuncio se promocionará tras la validación administrativa." },
  promotionType: { fr: "Type de sponsorisation", en: "Promotion type", ar: "نوع الترويج", es: "Tipo de promoción" },
  duration: { fr: "Durée (jours)", en: "Duration (days)", ar: "المدة (بالأيام)", es: "Duración (días)" },
  amountDue: { fr: "Montant à régler", en: "Amount due", ar: "المبلغ المستحق", es: "Importe a pagar" },
  paymentMethod: { fr: "Mode de paiement", en: "Payment method", ar: "طريقة الدفع", es: "Método de pago" },
  paymentPlaceholder: { fr: "Ex. : virement bancaire, espèces à l'accueil...", en: "E.g. bank transfer, cash at reception...", ar: "مثال: تحويل بنكي، نقداً في الاستقبال...", es: "Ej.: transferencia bancaria, efectivo en recepción..." },
  paymentProof: { fr: "Justificatif de paiement", en: "Payment proof", ar: "إثبات الدفع", es: "Comprobante de pago" },
  promoTopSearch: { fr: "Priorité recherche", en: "Search priority", ar: "أولوية البحث", es: "Prioridad en búsquedas" },
  promoFeatured: { fr: "En vedette", en: "Featured", ar: "مميز", es: "Destacado" },
  promoHomepage: { fr: "Page d'accueil", en: "Homepage", ar: "الصفحة الرئيسية", es: "Página de inicio" },
  conditionNew: { fr: "Neuf", en: "New", ar: "جديد", es: "Nuevo" },
  conditionGood: { fr: "Bon état", en: "Good condition", ar: "حالة جيدة", es: "Buen estado" },
  conditionAcceptable: { fr: "État acceptable", en: "Acceptable condition", ar: "حالة مقبولة", es: "Estado aceptable" },
  conditionPoor: { fr: "Mauvais état", en: "Poor condition", ar: "حالة سيئة", es: "Mal estado" },
  loadPromotionsError: { fr: "Les promotions ne sont pas disponibles pour le moment.", en: "Promotions are unavailable right now.", ar: "العروض الترويجية غير متاحة حالياً.", es: "Las promociones no están disponibles ahora." },
  statusApproved: { fr: "Publiée", en: "Published", ar: "منشورة", es: "Publicada" },
  statusPending: { fr: "En validation", en: "Under review", ar: "قيد التحقق", es: "En validación" },
  statusRejected: { fr: "Rejetée", en: "Rejected", ar: "مرفوضة", es: "Rechazada" },
  statusModification: { fr: "Modifications requises", en: "Changes required", ar: "التعديلات مطلوبة", es: "Modificaciones necesarias" },
  statusSoldOut: { fr: "Épuisée", en: "Sold out", ar: "نفد المخزون", es: "Agotada" },
  statusReserved: { fr: "Réservée", en: "Reserved", ar: "محجوزة", es: "Reservada" },
  statusSold: { fr: "Vendue", en: "Sold", ar: "مباعة", es: "Vendida" },
  promoPending: { fr: "Sponsorisation en attente", en: "Promotion pending", ar: "الترويج قيد الانتظار", es: "Promoción pendiente" },
  promoActive: { fr: "Sponsorisé", en: "Promoted", ar: "تم الترويج", es: "Patrocinado" },
  promoRejected: { fr: "Sponsorisation rejetée", en: "Promotion rejected", ar: "رُفض الترويج", es: "Promoción rechazada" },
  until: { fr: "jusqu'au", en: "until", ar: "حتى", es: "hasta" },
  paymentPending: { fr: "en attente", en: "pending", ar: "قيد الانتظار", es: "pendiente" },
} satisfies Record<string, Localized>;

const shopText = (key: keyof typeof SHOP_TEXTS, lang: LangCode): string =>
  (SHOP_TEXTS[key] as Localized)[lang];

const PROMO_TYPES = [
  { value: "top_search", labelKey: "promoTopSearch" as const, ratePerDay: 15 },
  { value: "featured", labelKey: "promoFeatured" as const, ratePerDay: 25 },
  { value: "homepage", labelKey: "promoHomepage" as const, ratePerDay: 40 },
];

function formatMAD(price: string | number | null | undefined, lang: LangCode): string {
  const n = Number(price ?? 0);
  if (isNaN(n)) return "0";
  try {
    const locale = lang === "ar" ? "ar-MA" : lang === "es" ? "es-MA" : lang === "en" ? "en-MA" : "fr-MA";
    return n.toLocaleString(locale, { maximumFractionDigits: 2 });
  } catch { return String(Math.round(n)); }
}

const CATS = ["Électroménager", "Meubles", "Vêtements", "Électronique", "Sport", "Livres", "Autre"];
const CATEGORY_LABELS: Record<string, Localized> = {
  "Électroménager": { fr: "Électroménager", en: "Appliances", ar: "الأجهزة المنزلية", es: "Electrodomésticos" },
  Meubles: { fr: "Meubles", en: "Furniture", ar: "الأثاث", es: "Muebles" },
  Vêtements: { fr: "Vêtements", en: "Clothing", ar: "الملابس", es: "Ropa" },
  "Électronique": { fr: "Électronique", en: "Electronics", ar: "الإلكترونيات", es: "Electrónica" },
  Sport: { fr: "Sport", en: "Sports", ar: "الرياضة", es: "Deportes" },
  Livres: { fr: "Livres", en: "Books", ar: "الكتب", es: "Libros" },
  Autre: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
};
const CONDITIONS = [
  { value: "neuf", labelKey: "conditionNew" as const },
  { value: "bon", labelKey: "conditionGood" as const },
  { value: "acceptable", labelKey: "conditionAcceptable" as const },
  { value: "mauvais", labelKey: "conditionPoor" as const },
];

const STATUS_CONFIG: Record<string, { color: string; labelKey: keyof typeof SHOP_TEXTS }> = {
  approved:               { color: "#22c55e", labelKey: "statusApproved" },
  pending_review:         { color: "#f59e0b", labelKey: "statusPending" },
  rejected:               { color: "#ef4444", labelKey: "statusRejected" },
  modification_requested: { color: "#f97316", labelKey: "statusModification" },
  sold_out:               { color: "#94a3b8", labelKey: "statusSoldOut" },
  reserved:               { color: "#6366f1", labelKey: "statusReserved" },
  sold:                   { color: "#94a3b8", labelKey: "statusSold" },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, lang } = useLanguage();
  const { showToast } = useToast();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [markingSold, setMarkingSold] = useState<string | null>(null);

  // Form state — basic
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [category, setCategory] = useState(CATS[0]!);
  const [condition, setCondition] = useState("bon");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [purchaseYear, setPurchaseYear] = useState("");
  const [sellingReason, setSellingReason] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [contactPrefs, setContactPrefs] = useState<string[]>(["chat"]);
  const [location, setLocation] = useState("");
  const [building, setBuilding] = useState("");
  const [block, setBlock] = useState("");
  const [floor, setFloor] = useState("");
  const [imageLocalUris, setImageLocalUris] = useState<string[]>([]);
  const [imageObjectPaths, setImageObjectPaths] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Promotions
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sponsorProduct, setSponsorProduct] = useState<Product | null>(null);
  const [sponsorType, setSponsorType] = useState(PROMO_TYPES[0]!.value);
  const [sponsorDays, setSponsorDays] = useState("7");
  const [sponsorPaymentMethod, setSponsorPaymentMethod] = useState("virement");
  const [sponsorProofLocalUri, setSponsorProofLocalUri] = useState<string | null>(null);
  const [sponsorProofObjectPath, setSponsorProofObjectPath] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submittingPromo, setSubmittingPromo] = useState(false);

  // ─── Fetch ───────────────────────────────────────────────────────────

  const fetchListings = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setLoadError(false);
      }
      const [listingsRes, promoRes] = await Promise.all([
        marketplace.myListings(),
        marketplace.myPromotions().catch(() => ({ data: [] })),
      ]);
      setProducts((listingsRes.data as Product[]) ?? []);
      setPromotions((promoRes.data as Promotion[]) ?? []);
    } catch {
      if (!silent) setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  const onRefresh = () => { setRefreshing(true); fetchListings(true); };

  const latestPromoForProduct = (productId: string): Promotion | undefined =>
    promotions
      .filter((pr) => pr.productId === productId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  const openSponsor = (p: Product) => {
    setSponsorProduct(p);
    setSponsorType(PROMO_TYPES[0]!.value);
    setSponsorDays("7");
    setSponsorPaymentMethod("virement");
    setSponsorProofLocalUri(null);
    setSponsorProofObjectPath(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Mark as sold ─────────────────────────────────────────────────────

  const handleMarkSold = (id: string, productName: string) => {
    Alert.alert(
      shopText("markSoldTitle", lang),
      shopText("markSoldMessage", lang).replace("{name}", productName),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: shopText("markSoldTitle", lang),
          onPress: async () => {
            setMarkingSold(id);
            try {
              await marketplace.markSold(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: shopText("archiveSuccessTitle", lang), message: shopText("archiveSuccessMessage", lang) });
              await fetchListings();
            } catch (e: any) {
              Alert.alert(t("error"), shopText("markSoldError", lang));
            } finally {
              setMarkingSold(null);
            }
          },
        },
      ],
    );
  };

  // ─── Promotion helpers ────────────────────────────────────────────────

  const pickSponsorProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setSponsorProofLocalUri(uri);
    setUploadingProof(true);
    const objectPath = await uploadImageUri(uri, token ?? undefined);
    setUploadingProof(false);
    if (objectPath) {
      setSponsorProofObjectPath(objectPath);
    } else {
      setSponsorProofLocalUri(null);
      Alert.alert(t("error"), shopText("uploadError", lang));
    }
  };

  const submitSponsorRequest = async () => {
    if (!sponsorProduct) return;
    const days = parseInt(sponsorDays, 10);
    if (!days || days < 1 || days > 90) { Alert.alert(t("error"), shopText("durationError", lang)); return; }
    if (!sponsorPaymentMethod.trim()) { Alert.alert(t("error"), shopText("paymentMethodRequired", lang)); return; }
    if (!sponsorProofObjectPath) { Alert.alert(shopText("paymentProof", lang), shopText("proofRequired", lang)); return; }
    setSubmittingPromo(true);
    try {
      await marketplace.requestPromotion(sponsorProduct.id, { type: sponsorType, durationDays: days, paymentMethod: sponsorPaymentMethod.trim(), proofUrl: sponsorProofObjectPath });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(shopText("promotionSentTitle", lang), shopText("promotionSentMessage", lang));
      setSponsorProduct(null);
      await fetchListings();
    } catch (e: any) {
      Alert.alert(t("error"), shopText("promotionError", lang));
    } finally {
      setSubmittingPromo(false);
    }
  };

  const selectedPromoType = PROMO_TYPES.find((p) => p.value === sponsorType) ?? PROMO_TYPES[0]!;
  const sponsorEstimatedAmount = (parseInt(sponsorDays, 10) || 0) * selectedPromoType.ratePerDay;

  // ─── Form helpers ─────────────────────────────────────────────────────

  const resetForm = () => {
    setName(""); setDesc(""); setPrice(""); setOriginalPrice(""); setStock("1");
    setCategory(CATS[0]!); setCondition("bon");
    setBrand(""); setModel(""); setPurchaseYear(""); setSellingReason("");
    setNegotiable(false); setContactPrefs(["chat"]);
    setLocation(""); setBuilding(""); setBlock(""); setFloor("");
    setImageLocalUris([]); setImageObjectPaths([]);
    setEditingId(null);
  };

  const openAdd = () => { resetForm(); setShowForm(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setDesc(p.description);
    setPrice(String(Number(p.price)));
    setOriginalPrice(p.originalPrice ? String(Number(p.originalPrice)) : "");
    setStock(String(p.stock));
    setCategory(p.category);
    setCondition(p.condition);
    setBrand(p.brand ?? "");
    setModel(p.model ?? "");
    setPurchaseYear(p.purchaseYear ?? "");
    setSellingReason(p.sellingReason ?? "");
    setNegotiable(p.negotiable ?? false);
    try { setContactPrefs(JSON.parse(p.contactPreferences ?? '["chat"]')); } catch { setContactPrefs(["chat"]); }
    setLocation(p.location ?? "");
    setBuilding(p.building ?? "");
    setBlock(p.block ?? "");
    setFloor(p.floor ?? "");
    setImageLocalUris([]); setImageObjectPaths([]);
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleContactPref = (pref: string) => {
    setContactPrefs((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref],
    );
  };

  // ─── Image picker ──────────────────────────────────────────────────────

  const uploadImageUri = async (uri: string, authToken?: string): Promise<string | null> => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const baseUrl = domain
      ? `https://${domain}/api`
      : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
    try {
      const fileRes = await fetch(uri);
      if (!fileRes.ok) return null;
      const blob = await fileRes.blob();
      const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
      const ct = ext === "png" ? "image/png" : "image/jpeg";
      const form = new FormData();
      form.append("file", blob, `product-${Date.now()}.${ext === "png" ? "png" : "jpg"}`);
      const res = await fetch(`${baseUrl}/storage/uploads`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: form,
      });
      if (!res.ok) return null;
      const { objectPath } = await res.json();
      return objectPath as string;
    } catch { return null; }
  };

  const pickProductImage = async () => {
    if (imageLocalUris.length >= 5) { Alert.alert(t("warning"), shopText("maximumPhotos", lang)); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setImageLocalUris((prev) => [...prev, uri]);
    Haptics.selectionAsync();
    setUploadingImages(true);
    const objectPath = await uploadImageUri(uri, token ?? undefined);
    setUploadingImages(false);
    if (objectPath) {
      setImageObjectPaths((prev) => [...prev, objectPath]);
    } else {
      setImageLocalUris((prev) => prev.filter((u) => u !== uri));
      Alert.alert(t("error"), shopText("uploadError", lang));
    }
  };

  const removeImage = (idx: number) => {
    setImageLocalUris((prev) => prev.filter((_, i) => i !== idx));
    setImageObjectPaths((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) { Alert.alert(t("required"), shopText("productRequired", lang)); return; }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) { Alert.alert(t("error"), shopText("invalidPrice", lang)); return; }
    if (contactPrefs.length === 0) { Alert.alert(t("error"), shopText("contactRequired", lang)); return; }
    if (uploadingImages) { Alert.alert(t("info"), shopText("imagesPending", lang)); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: desc.trim(),
        price: parsedPrice,
        stock: parseInt(stock) || 1,
        category,
        condition,
        contactPreferences: contactPrefs,
        location: location.trim(),
        imageUrls: imageObjectPaths,
        negotiable,
      };
      if (originalPrice.trim()) payload.originalPrice = parseFloat(originalPrice);
      if (brand.trim()) payload.brand = brand.trim();
      if (model.trim()) payload.model = model.trim();
      if (purchaseYear.trim()) payload.purchaseYear = purchaseYear.trim();
      if (sellingReason.trim()) payload.sellingReason = sellingReason.trim();
      if (building.trim()) payload.building = building.trim();
      if (block.trim()) payload.block = block.trim();
      if (floor.trim()) payload.floor = floor.trim();

      const wasEditing = Boolean(editingId);
      if (editingId) {
        await marketplace.updateProduct(editingId, payload);
      } else {
        await marketplace.addProduct(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({
        type: "success",
        title: t("success"),
        message: shopText(wasEditing ? "updateSuccess" : "createSuccess", lang),
      });
      setShowForm(false);
      resetForm();
      await fetchListings();
    } catch (e: any) {
      Alert.alert(t("error"), shopText("saveError", lang));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, productName: string) => {
    Alert.alert(shopText("deleteConfirm", lang), shopText("deleteMessage", lang).replace("{name}", productName), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          setDeleting(id);
          try {
            await marketplace.deleteProduct(id);
            setProducts((prev) => prev.filter((p) => p.id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert(t("error"), shopText("deleteError", lang));
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
  };

  // ─── Stats ────────────────────────────────────────────────────────────

  const approved = products.filter((p) => p.status === "approved");
  const reserved = products.filter((p) => p.status === "reserved");
  const sold = products.filter((p) => p.status === "sold");
  const totalViews = products.reduce((s, p) => s + (p.viewCount ?? 0), 0);

  // ─── Render ───────────────────────────────────────────────────────────

  const PROMO_STATUS_CONFIG: Record<string, { color: string; labelKey: keyof typeof SHOP_TEXTS }> = {
    pending_payment: { color: "#f59e0b", labelKey: "promoPending" },
    active:          { color: "#8b5cf6", labelKey: "promoActive" },
    rejected:        { color: "#ef4444", labelKey: "promoRejected" },
  };

  const renderItem = ({ item: p }: { item: Product }) => {
    const sc = STATUS_CONFIG[p.status] ?? { color: colors.mutedForeground, labelKey: "statusPending" as const };
    const promo = latestPromoForProduct(p.id);
    const promoSc = promo ? PROMO_STATUS_CONFIG[promo.status] : undefined;
    const canSell = ["approved", "reserved"].includes(p.status);
    return (
      <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productName, { color: colors.foreground }]}>{p.name}</Text>
            <Text style={[styles.productPrice, { color: colors.primary }]}>{formatMAD(p.price, lang)} {lang === "ar" ? "د.م." : "MAD"}</Text>
            <Text style={[styles.productMeta, { color: colors.mutedForeground }]}>
              {CATEGORY_LABELS[p.category]?.[lang] ?? p.category} · {p.viewCount ?? 0} {shopText("viewCount", lang)}
              {p.status === "reserved" ? ` · ${shopText("reservedBy", lang)} ${p.reservedByName ?? shopText("resident", lang)}` : ""}
              {p.status === "sold" && p.soldAt ? ` · ${shopText("soldOn", lang)} ${new Date(p.soldAt).toLocaleDateString(lang === "fr" ? "fr-MA" : lang === "ar" ? "ar-MA" : lang)}` : ""}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: sc.color + "20" }]}>
              <Text style={[styles.statusText, { color: sc.color }]}>{shopText(sc.labelKey, lang)}</Text>
          </View>
        </View>

        {p.rejectionReason && (
          <View style={[styles.rejectionBox, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "30" }]}>
            <Feather name="alert-circle" size={12} color={colors.destructive} />
            <Text style={[styles.rejectionText, { color: colors.destructive }]}>{p.rejectionReason}</Text>
          </View>
        )}

        {promoSc && (
          <View style={[styles.rejectionBox, { backgroundColor: promoSc.color + "10", borderColor: promoSc.color + "30" }]}>
            <Feather name="zap" size={12} color={promoSc.color} />
            <Text style={[styles.rejectionText, { color: promoSc.color }]}>
              {shopText(promoSc.labelKey, lang)}
              {promo?.status === "active" ? ` ${shopText("until", lang)} ${new Date(promo.endDate).toLocaleDateString(lang === "fr" ? "fr-MA" : lang === "ar" ? "ar-MA" : lang)}` : ""}
              {promo?.status === "rejected" && promo.rejectionReason ? ` — ${promo.rejectionReason}` : ""}
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          {p.status !== "sold" && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "12" }]} onPress={() => openEdit(p)}>
              <Feather name="edit-2" size={14} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t("edit")}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => { router.push({ pathname: "/product-detail", params: { id: p.id } } as any); }}>
            <Feather name="eye" size={14} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>{shopText("view", lang)}</Text>
          </TouchableOpacity>
          {canSell && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success + "12" }]}
              onPress={() => handleMarkSold(p.id, p.name)}
              disabled={markingSold === p.id}
            >
              {markingSold === p.id ? (
                <ActivityIndicator size="small" color={colors.success} />
              ) : (
                <>
                  <Feather name="check-circle" size={14} color={colors.success} />
                  <Text style={[styles.actionBtnText, { color: colors.success }]}>{shopText("soldAction", lang)}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {p.status === "approved" && promo?.status !== "pending_payment" && promo?.status !== "active" && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#8b5cf612" }]} onPress={() => openSponsor(p)}>
              <Feather name="zap" size={14} color="#8b5cf6" />
              <Text style={[styles.actionBtnText, { color: "#8b5cf6" }]}>{shopText("sponsor", lang)}</Text>
            </TouchableOpacity>
          )}
          {p.status !== "sold" && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.destructive + "12" }]} onPress={() => handleDelete(p.id, p.name)} disabled={deleting === p.id}>
              {deleting === p.id ? <ActivityIndicator size="small" color={colors.destructive} /> : (
                <>
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                  <Text style={[styles.actionBtnText, { color: colors.destructive }]}>{t("delete")}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginStart: 10 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>{t("myShop")}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {approved.length === 1
                ? shopText("publishedOne", lang)
                : shopText("publishedMany", lang).replace("{count}", String(approved.length))}
              {" · "}
              {reserved.length === 1
                ? shopText("reservedOne", lang)
                : shopText("reservedMany", lang).replace("{count}", String(reserved.length))}
            </Text>
          </View>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>{t("add")}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { key: "total", label: shopText("total", lang), value: products.length },
            { key: "published", label: shopText("published", lang), value: approved.length },
            { key: "reserved", label: shopText("reserved", lang), value: reserved.length },
            { key: "sold", label: shopText("sold", lang), value: sold.length },
            { key: "views", label: shopText("views", lang), value: totalViews },
          ].map((s) => (
            <View key={s.key} style={[styles.statBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <LoadingState title={shopText("loadingTitle", lang)} description={shopText("loadingDescription", lang)} accentColor={colors.primary} />
      ) : loadError ? (
        <ErrorState
          title={shopText("loadErrorTitle", lang)}
          description={shopText("loadErrorDescription", lang)}
          retryLabel={t("retry")}
          onRetry={() => fetchListings()}
          accentColor={colors.primary}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="package" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noProducts")}</Text>
               <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{shopText("noProductsDescription", lang)}</Text>
              <TouchableOpacity style={[styles.emptyAction, { backgroundColor: colors.primary }]} onPress={openAdd}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyActionText}>{t("newPublication")}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add / Edit modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingId ? t("edit") : t("newPublication")}</Text>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: saving ? colors.secondary : colors.primary }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{t("save")}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>

            {/* ── Section: Produit ──────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>{shopText("productInfo", lang)}</Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("listingTitle", lang)} *</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={shopText("titlePlaceholder", lang)} placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} maxLength={200} />

            {/* Category */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("category", lang)} *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATS.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, { borderColor: colors.border, backgroundColor: category === c ? colors.primary : colors.card }]} onPress={() => setCategory(c)}>
                    <Text style={[styles.chipText, { color: category === c ? "#fff" : colors.foreground }]}>{CATEGORY_LABELS[c]?.[lang] ?? c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Condition */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("condition", lang)} *</Text>
            <View style={styles.conditionRow}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity key={c.value} style={[styles.conditionChip, { borderColor: condition === c.value ? colors.primary : colors.border }, condition === c.value && { backgroundColor: colors.primary + "15" }]} onPress={() => setCondition(c.value)}>
                  <Text style={[styles.conditionChipText, { color: condition === c.value ? colors.primary : colors.foreground }]}>{shopText(c.labelKey, lang)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Brand / Model / Year */}
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("brand", lang)}</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="Samsung" placeholderTextColor={colors.mutedForeground} value={brand} onChangeText={setBrand} maxLength={100} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("model", lang)}</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="WW70T4020EX" placeholderTextColor={colors.mutedForeground} value={model} onChangeText={setModel} maxLength={100} />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("purchaseYear", lang)}</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="2021" placeholderTextColor={colors.mutedForeground} value={purchaseYear} onChangeText={setPurchaseYear} keyboardType="numeric" maxLength={4} />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("description", lang)}</Text>
            <TextInput style={[styles.textarea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={shopText("descriptionPlaceholder", lang)} placeholderTextColor={colors.mutedForeground} value={desc} onChangeText={setDesc} multiline maxLength={2000} textAlignVertical="top" />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("sellingReason", lang)}</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={shopText("sellingReasonPlaceholder", lang)} placeholderTextColor={colors.mutedForeground} value={sellingReason} onChangeText={setSellingReason} maxLength={500} />

            {/* ── Section: Prix ─────────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>{shopText("priceSection", lang)}</Text>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("salePrice", lang)} *</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="500" placeholderTextColor={colors.mutedForeground} value={price} onChangeText={setPrice} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("originalPrice", lang)}</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="800" placeholderTextColor={colors.mutedForeground} value={originalPrice} onChangeText={setOriginalPrice} keyboardType="numeric" />
              </View>
            </View>

            <View style={[styles.switchRow, { borderColor: colors.border }]}>
              <View>
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>{shopText("negotiable", lang)}</Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>{shopText("negotiableDescription", lang)}</Text>
              </View>
              <Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ true: colors.primary }} />
            </View>

            {/* ── Section: Localisation ─────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>{shopText("locationSection", lang)}</Text>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("building", lang)}</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={lang === "ar" ? "المبنى أ" : lang === "en" ? "Building A" : lang === "es" ? "Edificio A" : "Bâtiment A"} placeholderTextColor={colors.mutedForeground} value={building} onChangeText={setBuilding} maxLength={100} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("block", lang)}</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={lang === "ar" ? "العمارة 2" : lang === "en" ? "Block 2" : lang === "es" ? "Bloque 2" : "Bloc 2"} placeholderTextColor={colors.mutedForeground} value={block} onChangeText={setBlock} maxLength={100} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("floor", lang)}</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="3" placeholderTextColor={colors.mutedForeground} value={floor} onChangeText={setFloor} maxLength={20} keyboardType="numeric" />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("address", lang)} ({t("optional").toLowerCase()})</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={lang === "ar" ? "حي الرياض، الرباط" : lang === "en" ? "Hay Riad, Rabat" : lang === "es" ? "Hay Riad, Rabat" : "Hay Riad, Rabat"} placeholderTextColor={colors.mutedForeground} value={location} onChangeText={setLocation} maxLength={200} />

            {/* ── Section: Contact ──────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>{shopText("contactSection", lang)}</Text>

            {[{ key: "chat", labelKey: "internalChat" as const, icon: "message-circle" as const }, { key: "phone", labelKey: "phone" as const, icon: "phone" as const }, { key: "email", labelKey: "email" as const, icon: "mail" as const }].map((opt) => (
              <TouchableOpacity key={opt.key} style={[styles.contactRow, { borderColor: contactPrefs.includes(opt.key) ? colors.primary : colors.border, backgroundColor: contactPrefs.includes(opt.key) ? colors.primary + "10" : colors.card }]} onPress={() => toggleContactPref(opt.key)}>
                <Feather name={opt.icon} size={16} color={contactPrefs.includes(opt.key) ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.contactLabel, { color: contactPrefs.includes(opt.key) ? colors.primary : colors.foreground }]}>{shopText(opt.labelKey, lang)}</Text>
                {contactPrefs.includes(opt.key) && <Feather name="check" size={16} color={colors.primary} style={{ marginStart: "auto" }} />}
              </TouchableOpacity>
            ))}

            {/* ── Section: Photos ───────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>{shopText("photosSection", lang)}</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {imageLocalUris.map((uri, idx) => (
                <View key={uri} style={{ position: "relative" }}>
                  <Image source={{ uri }} style={{ width: 76, height: 76, borderRadius: 10, resizeMode: "cover" }} />
                  <TouchableOpacity style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#ef4444", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }} onPress={() => removeImage(idx)}>
                    <Feather name="x" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {imageLocalUris.length < 5 && (
                <TouchableOpacity style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4 }} onPress={pickProductImage} disabled={uploadingImages}>
                  {uploadingImages
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <><Feather name="camera" size={20} color={colors.mutedForeground} /><Text style={{ fontSize: 10, color: colors.mutedForeground }}>{shopText("addPhoto", lang)}</Text></>}
                </TouchableOpacity>
              )}
            </View>

            {!editingId && (
              <View style={[styles.infoBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>{shopText("moderationNote", lang)}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Sponsor / boost listing modal */}
      <Modal visible={!!sponsorProduct} animationType="slide" onRequestClose={() => setSponsorProduct(null)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: topPad }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSponsorProduct(null)} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{shopText("sponsorTitle", lang)}</Text>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#8b5cf6" }, (submittingPromo || uploadingProof) && { opacity: 0.6 }]} onPress={submitSponsorRequest} disabled={submittingPromo || uploadingProof}>
              {submittingPromo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{t("send")}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 0 }]}>{sponsorProduct?.name}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>
              {shopText("sponsorDescription", lang)}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("promotionType", lang)}</Text>
            <View style={styles.conditionRow}>
              {PROMO_TYPES.map((pt) => (
                <TouchableOpacity key={pt.value} style={[styles.conditionChip, { borderColor: sponsorType === pt.value ? "#8b5cf6" : colors.border }, sponsorType === pt.value && { backgroundColor: "#8b5cf615" }]} onPress={() => setSponsorType(pt.value)}>
                  <Text style={[styles.conditionChipText, { color: sponsorType === pt.value ? "#8b5cf6" : colors.foreground }]}>{shopText(pt.labelKey, lang)} · {pt.ratePerDay} MAD/j</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("duration", lang)}</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} keyboardType="number-pad" value={sponsorDays} onChangeText={setSponsorDays} maxLength={2} />

            <View style={[styles.infoBox, { backgroundColor: "#8b5cf610", borderColor: "#8b5cf630" }]}>
              <Feather name="tag" size={14} color="#8b5cf6" />
              <Text style={[styles.infoText, { color: "#8b5cf6" }]}>{shopText("amountDue", lang)} : {formatMAD(sponsorEstimatedAmount, lang)} {lang === "ar" ? "د.م." : "MAD"}</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("paymentMethod", lang)}</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={shopText("paymentPlaceholder", lang)} placeholderTextColor={colors.mutedForeground} value={sponsorPaymentMethod} onChangeText={setSponsorPaymentMethod} maxLength={200} />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{shopText("paymentProof", lang)}</Text>
            {sponsorProofLocalUri ? (
              <View style={{ position: "relative", alignSelf: "flex-start" }}>
                <Image source={{ uri: sponsorProofLocalUri }} style={{ width: 100, height: 100, borderRadius: 10, resizeMode: "cover" }} />
                {uploadingProof && (
                  <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                <TouchableOpacity style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#ef4444", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }} onPress={() => { setSponsorProofLocalUri(null); setSponsorProofObjectPath(null); }}>
                  <Feather name="x" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={{ width: 100, height: 100, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4 }} onPress={pickSponsorProof}>
                <Feather name="upload" size={20} color={colors.mutedForeground} />
                <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{shopText("addPhoto", lang)}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 6 },
  statBox: { flex: 1, borderRadius: 8, borderWidth: 1, padding: 8, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 9, marginTop: 1, textAlign: "center" },
  list: { padding: 12, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60, padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  emptyActionText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  productCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  productName: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  productPrice: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  productMeta: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  rejectionBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 8, borderRadius: 8, borderWidth: 1 },
  rejectionText: { fontSize: 11, flex: 1, lineHeight: 16 },
  cardActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  // Modal
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  modalBody: { padding: 16, gap: 4, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: 16, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 120 },
  rowFields: { flexDirection: "row", gap: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "600" },
  conditionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  conditionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  conditionChipText: { fontSize: 13, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 8 },
  switchLabel: { fontSize: 14, fontWeight: "600" },
  switchSub: { fontSize: 11, marginTop: 2 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, borderWidth: 1.5, padding: 12, marginBottom: 6 },
  contactLabel: { fontSize: 14, fontWeight: "600" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  infoText: { fontSize: 13, flex: 1, lineHeight: 18 },
});
