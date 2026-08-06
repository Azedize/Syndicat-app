/**
 * template-editor.tsx — Template Editor & Version Manager
 *
 * Create/edit a template definition. Tabs: Info | Variables | Sections | Languages | Versions | Permissions
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { apiRequest as libApiRequest } from "@/lib/api";
import { LangCode, useLanguage } from "@/context/LanguageContext";
import { ErrorState, LoadingState } from "@/components/DataState";

// ─── Types ────────────────────────────────────────────────────────────────────

interface I18NField { fr: string; ar: string; en: string; es: string; }
const LANGS = ["fr", "ar", "en", "es"] as const;
const LANG_LABELS: Record<string, string> = { fr: "Français 🇫🇷", ar: "العربية 🇲🇦", en: "English 🇬🇧", es: "Español 🇪🇸" };

type VariableSource = "db_syndicate" | "db_property" | "db_office_holders" | "db_member" | "user_input" | "generated";
type VariableType   = "text" | "date" | "number" | "boolean" | "list";
type SectionType    = "text" | "table" | "signature" | "stamp" | "qr" | "image" | "chart" | "page_break";

interface VariableDef {
  name: string;
  label: I18NField;
  source: VariableSource;
  type: VariableType;
  required: boolean;
  example: string;
}

interface SectionDef {
  id: string;
  title: I18NField;
  content: I18NField;
  type: SectionType;
  required: boolean;
  order: number;
}

interface TemplateForm {
  slug: string;
  category: string;
  name: I18NField;
  description: I18NField;
  variables: VariableDef[];
  sections: SectionDef[];
  languages: string[];
  layoutConfig: {
    accentColor: string;
    headerStyle: "branded" | "minimal" | "none";
    footerStyle: "full" | "minimal" | "none";
    watermark: boolean;
    showQr: boolean;
    showStamp: boolean;
  };
}

interface VersionEntry {
  id: string;
  version: number;
  changeDescription: string | null;
  authorName: string | null;
  createdAt: string;
}

interface PermissionEntry {
  id: string;
  role: string;
  canUse: boolean;
  canEdit: boolean;
  canPublish: boolean;
}

type Localized = Record<LangCode, string>;
const TEXT = {
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  success: { fr: "Succès", en: "Success", ar: "نجاح", es: "Éxito" },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  delete: { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  edit: { fr: "Modifier", en: "Edit", ar: "تعديل", es: "Editar" },
  add: { fr: "Ajouter", en: "Add", ar: "إضافة", es: "Añadir" },
  create: { fr: "Créer", en: "Create", ar: "إنشاء", es: "Crear" },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  loadingTemplate: { fr: "Chargement du template", en: "Loading template", ar: "جارٍ تحميل القالب", es: "Cargando la plantilla" },
  loadingTemplateDesc: { fr: "Nous récupérons sa configuration et ses versions.", en: "We are retrieving its configuration and versions.", ar: "نسترجع إعداداته وإصداراته.", es: "Estamos recuperando su configuración y sus versiones." },
  templateUnavailable: { fr: "Template indisponible", en: "Template unavailable", ar: "القالب غير متاح", es: "Plantilla no disponible" },
  templateUnavailableDesc: { fr: "Le template ne peut pas être chargé pour le moment. Réessayez pour reprendre votre travail.", en: "The template cannot be loaded right now. Retry to resume your work.", ar: "لا يمكن تحميل القالب حالياً. أعد المحاولة لمتابعة عملك.", es: "La plantilla no se puede cargar ahora. Vuelva a intentarlo para continuar." },
  variables: { fr: "Variables", en: "Variables", ar: "المتغيرات", es: "Variables" },
  variablesDesc: { fr: "Données dynamiques injectées dans le template", en: "Dynamic data injected into the template", ar: "بيانات ديناميكية تُدرج في القالب", es: "Datos dinámicos insertados en la plantilla" },
  presets: { fr: "Variables prédéfinies disponibles", en: "Available predefined variables", ar: "المتغيرات المحددة مسبقاً المتاحة", es: "Variables predefinidas disponibles" },
  addCustomVariable: { fr: "Ajouter une variable personnalisée", en: "Add a custom variable", ar: "إضافة متغير مخصص", es: "Añadir una variable personalizada" },
  newVariable: { fr: "Nouvelle variable", en: "New variable", ar: "متغير جديد", es: "Nueva variable" },
  editVariable: { fr: "Modifier la variable", en: "Edit variable", ar: "تعديل المتغير", es: "Editar variable" },
  identifier: { fr: "Nom (identifiant)", en: "Name (identifier)", ar: "الاسم (المعرّف)", es: "Nombre (identificador)" },
  label: { fr: "Libellé", en: "Label", ar: "التسمية", es: "Etiqueta" },
  source: { fr: "Source", en: "Source", ar: "المصدر", es: "Origen" },
  type: { fr: "Type", en: "Type", ar: "النوع", es: "Tipo" },
  exampleValue: { fr: "Valeur d'exemple (prévisualisation)", en: "Example value (preview)", ar: "قيمة مثال (معاينة)", es: "Valor de ejemplo (vista previa)" },
  required: { fr: "Requis", en: "Required", ar: "مطلوب", es: "Obligatorio" },
  variableNameRequired: { fr: "Le nom de la variable est requis.", en: "The variable name is required.", ar: "اسم المتغير مطلوب.", es: "El nombre de la variable es obligatorio." },
  deleteVariable: { fr: "Supprimer cette variable ?", en: "Delete this variable?", ar: "هل تريد حذف هذا المتغير؟", es: "¿Eliminar esta variable?" },
  sections: { fr: "Sections", en: "Sections", ar: "الأقسام", es: "Secciones" },
  sectionsDesc: { fr: "Blocs de contenu composant le document", en: "Content blocks that compose the document", ar: "كتل المحتوى التي تكوّن الوثيقة", es: "Bloques de contenido que componen el documento" },
  addSection: { fr: "Ajouter une section", en: "Add a section", ar: "إضافة قسم", es: "Añadir una sección" },
  newSection: { fr: "Nouvelle section", en: "New section", ar: "قسم جديد", es: "Nueva sección" },
  editSection: { fr: "Modifier la section", en: "Edit section", ar: "تعديل القسم", es: "Editar sección" },
  sectionTitle: { fr: "Titre de section", en: "Section title", ar: "عنوان القسم", es: "Título de sección" },
  defaultContent: { fr: "Contenu par défaut", en: "Default content", ar: "المحتوى الافتراضي", es: "Contenido predeterminado" },
  blockType: { fr: "Type de bloc", en: "Block type", ar: "نوع الكتلة", es: "Tipo de bloque" },
  requiredSection: { fr: "Section obligatoire", en: "Required section", ar: "قسم إلزامي", es: "Sección obligatoria" },
  untitledSection: { fr: "Section sans titre", en: "Untitled section", ar: "قسم بدون عنوان", es: "Sección sin título" },
  emptyContent: { fr: "Contenu vide — à remplir dans l'éditeur", en: "Empty content — fill it in the editor", ar: "محتوى فارغ — املأه في المحرر", es: "Contenido vacío — complételo en el editor" },
  sectionTitleRequired: { fr: "Le titre de la section en français est requis.", en: "The French section title is required.", ar: "عنوان القسم بالفرنسية مطلوب.", es: "El título de la sección en francés es obligatorio." },
  deleteSection: { fr: "Supprimer cette section ?", en: "Delete this section?", ar: "هل تريد حذف هذا القسم؟", es: "¿Eliminar esta sección?" },
  versions: { fr: "Versions", en: "Versions", ar: "الإصدارات", es: "Versiones" },
  versionsHistory: { fr: "Historique des versions", en: "Version history", ar: "سجل الإصدارات", es: "Historial de versiones" },
  versionOne: { fr: "1 version enregistrée", en: "1 version saved", ar: "إصدار واحد محفوظ", es: "1 versión guardada" },
  versionsMany: { fr: "{count} versions enregistrées", en: "{count} versions saved", ar: "{count} versiones guardadas", es: "{count} versiones guardadas" },
  version: { fr: "Version", en: "Version", ar: "الإصدار", es: "Versión" },
  current: { fr: "Actuelle", en: "Current", ar: "الحالية", es: "Actual" },
  restore: { fr: "Restaurer", en: "Restore", ar: "استعادة", es: "Restaurar" },
  restoreVersion: { fr: "Restaurer la version", en: "Restore version", ar: "استعادة الإصدار", es: "Restaurar versión" },
  restoreMessage: { fr: "Restaurer v{version} « {description} » ? Cela créera une nouvelle version.", en: "Restore v{version} “{description}”? This will create a new version.", ar: "هل تريد استعادة الإصدار {version} « {description} »؟ سيؤدي ذلك إلى إنشاء إصدار جديد.", es: "¿Restaurar v{version} «{description}»? Esto creará una nueva versión." },
  restored: { fr: "Version restaurée.", en: "Version restored.", ar: "تمت استعادة الإصدار.", es: "Versión restaurada." },
  update: { fr: "Mise à jour", en: "Update", ar: "تحديث", es: "Actualización" },
  versionsUnavailable: { fr: "Impossible de charger les versions.", en: "Versions could not be loaded.", ar: "تعذر تحميل الإصدارات.", es: "No se pudieron cargar las versiones." },
  permissions: { fr: "Permissions", en: "Permissions", ar: "الصلاحيات", es: "Permisos" },
  accessByRole: { fr: "Contrôle d'accès par rôle", en: "Role-based access control", ar: "التحكم في الوصول حسب الدور", es: "Control de acceso por rol" },
  role: { fr: "Rôle", en: "Role", ar: "الدور", es: "Rol" },
  use: { fr: "Utiliser", en: "Use", ar: "استخدام", es: "Usar" },
  modify: { fr: "Modifier", en: "Edit", ar: "تعديل", es: "Modificar" },
  publish: { fr: "Publier", en: "Publish", ar: "نشر", es: "Publicar" },
  savePermissions: { fr: "Enregistrer les permissions", en: "Save permissions", ar: "حفظ الصلاحيات", es: "Guardar permisos" },
  permissionsUpdated: { fr: "Permissions mises à jour.", en: "Permissions updated.", ar: "تم تحديث الصلاحيات.", es: "Permisos actualizados." },
  permissionsUnavailable: { fr: "Impossible de charger les permissions.", en: "Permissions could not be loaded.", ar: "تعذر تحميل الصلاحيات.", es: "No se pudieron cargar los permisos." },
  layout: { fr: "Mise en page", en: "Layout", ar: "التخطيط", es: "Diseño" },
  layoutDesc: { fr: "Apparence et structure du document", en: "Document appearance and structure", ar: "مظهر الوثيقة وبنيتها", es: "Apariencia y estructura del documento" },
  accent: { fr: "Couleur d'accentuation", en: "Accent color", ar: "لون التمييز", es: "Color de acento" },
  headerStyle: { fr: "Style d'en-tête", en: "Header style", ar: "نمط الرأس", es: "Estilo del encabezado" },
  footerStyle: { fr: "Style de pied de page", en: "Footer style", ar: "نمط التذييل", es: "Estilo del pie de página" },
  branded: { fr: "Avec marque", en: "Branded", ar: "مع الهوية", es: "Con marca" },
  minimal: { fr: "Minimal", en: "Minimal", ar: "مبسط", es: "Minimal" },
  none: { fr: "Aucun", en: "None", ar: "بدون", es: "Ninguno" },
  full: { fr: "Complet", en: "Full", ar: "كامل", es: "Completo" },
  watermark: { fr: "Filigrane (brouillon)", en: "Watermark (draft)", ar: "علامة مائية (مسودة)", es: "Marca de agua (borrador)" },
  watermarkDesc: { fr: "Affiche « BROUILLON » en arrière-plan", en: "Shows “DRAFT” in the background", ar: "يعرض «مسودة» في الخلفية", es: "Muestra «BORRADOR» de fondo" },
  qrCode: { fr: "QR Code de vérification", en: "Verification QR code", ar: "رمز QR للتحقق", es: "Código QR de verificación" },
  qrCodeDesc: { fr: "Intègre un QR dans l'en-tête", en: "Adds a QR code to the header", ar: "يضيف رمز QR إلى الرأس", es: "Integra un QR en el encabezado" },
  officialStamp: { fr: "Bloc cachet officiel", en: "Official stamp block", ar: "كتلة الختم الرسمي", es: "Bloque de sello oficial" },
  officialStampDesc: { fr: "Cercle de cachet dans la signature", en: "Stamp circle in the signature", ar: "دائرة ختم في التوقيع", es: "Círculo de sello en la firma" },
  info: { fr: "Info", en: "Info", ar: "معلومات", es: "Info" },
  generalInfo: { fr: "Informations générales", en: "General information", ar: "معلومات عامة", es: "Información general" },
  slug: { fr: "Slug (identifiant unique)", en: "Slug (unique identifier)", ar: "المعرّف (معرّف فريد)", es: "Slug (identificador único)" },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  templateName: { fr: "Nom du template", en: "Template name", ar: "اسم القالب", es: "Nombre de la plantilla" },
  description: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  supportedLanguages: { fr: "Langues supportées", en: "Supported languages", ar: "اللغات المدعومة", es: "Idiomas compatibles" },
  saveFirst: { fr: "Sauvegardez d'abord le template", en: "Save the template first", ar: "احفظ القالب أولاً", es: "Guarde primero la plantilla" },
  newTemplate: { fr: "Nouveau template", en: "New template", ar: "قالب جديد", es: "Nueva plantilla" },
  editTemplate: { fr: "Éditer le template", en: "Edit template", ar: "تعديل القالب", es: "Editar plantilla" },
  saving: { fr: "Sauvegarde...", en: "Saving...", ar: "جارٍ الحفظ...", es: "Guardando..." },
  changeDescription: { fr: "Description de la modification", en: "Change description", ar: "وصف التعديل", es: "Descripción del cambio" },
  changeDescriptionHint: { fr: "Cette note sera enregistrée dans l'historique des versions.", en: "This note will be saved in the version history.", ar: "سيتم حفظ هذه الملاحظة في سجل الإصدارات.", es: "Esta nota se guardará en el historial de versiones." },
  slugAndNameRequired: { fr: "Le slug et le nom (FR) sont requis.", en: "The slug and French name are required.", ar: "المعرّف والاسم بالفرنسية مطلوبان.", es: "El slug y el nombre en francés son obligatorios." },
  templateSlugPrefix: { fr: "identifiant :", en: "slug:", ar: "المعرّف:", es: "identificador:" },
  created: { fr: "Template créé avec succès.", en: "Template created successfully.", ar: "تم إنشاء القالب بنجاح.", es: "Plantilla creada correctamente." },
  updated: { fr: "Template mis à jour.", en: "Template updated.", ar: "تم تحديث القالب.", es: "Plantilla actualizada." },
  duplicateSlug: { fr: "Ce slug existe déjà.", en: "This slug already exists.", ar: "هذا المعرّف موجود بالفعل.", es: "Este slug ya existe." },
  saveError: { fr: "Impossible d'enregistrer le template.", en: "The template could not be saved.", ar: "تعذر حفظ القالب.", es: "No se pudo guardar la plantilla." },
  variableNamePlaceholder: { fr: "ex. : syndicate_name", en: "e.g. syndicate_name", ar: "مثال: syndicate_name", es: "ej.: syndicate_name" },
  exampleValuePlaceholder: { fr: "ex. : M. Ahmed Benali", en: "e.g. Mr Ahmed Benali", ar: "مثال: أحمد بنعلي", es: "ej.: Sr. Ahmed Benali" },
  slugPlaceholder: { fr: "ex. : attestation_v2", en: "e.g. attestation_v2", ar: "مثال: attestation_v2", es: "ej.: attestation_v2" },
  changePlaceholder: { fr: "ex. : Ajout de la variable president_name", en: "e.g. Added the president_name variable", ar: "مثال: إضافة المتغير president_name", es: "ej.: Añadir la variable president_name" },
} satisfies Record<string, Localized>;

function tr(key: keyof typeof TEXT, lang: LangCode, replacements?: Record<string, string>): string {
  let value = (TEXT[key] as Localized)[lang];
  Object.entries(replacements ?? {}).forEach(([name, replacement]) => {
    value = value.replace(`{${name}}`, replacement);
  });
  return value;
}

const CATEGORY_LABELS: Record<string, Localized> = {
  meeting_minutes: { fr: "Procès-verbaux", en: "Meeting minutes", ar: "محاضر الاجتماعات", es: "Actas" },
  financial: { fr: "Finance", en: "Finance", ar: "المالية", es: "Finanzas" },
  legal: { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Legal" },
  elections: { fr: "Élections", en: "Elections", ar: "الانتخابات", es: "Elecciones" },
  contracts: { fr: "Contrats", en: "Contracts", ar: "العقود", es: "Contratos" },
  certificates: { fr: "Certificats", en: "Certificates", ar: "الشهادات", es: "Certificados" },
  regulations: { fr: "Règlements", en: "Regulations", ar: "اللوائح", es: "Reglamentos" },
  administrative: { fr: "Administratif", en: "Administrative", ar: "إداري", es: "Administrativo" },
  maintenance: { fr: "Maintenance", en: "Maintenance", ar: "الصيانة", es: "Mantenimiento" },
  insurance: { fr: "Assurance", en: "Insurance", ar: "التأمين", es: "Seguros" },
};

const SOURCE_LABELS: Record<VariableSource, Localized> = {
  db_syndicate: { fr: "Syndicat (DB)", en: "Syndicate (DB)", ar: "النقابة (قاعدة البيانات)", es: "Sindicato (BD)" },
  db_property: { fr: "Résidence (DB)", en: "Property (DB)", ar: "العقار (قاعدة البيانات)", es: "Residencia (BD)" },
  db_office_holders: { fr: "Élus (DB)", en: "Office holders (DB)", ar: "المسؤولون (قاعدة البيانات)", es: "Cargos electos (BD)" },
  db_member: { fr: "Membre (DB)", en: "Member (DB)", ar: "العضو (قاعدة البيانات)", es: "Miembro (BD)" },
  user_input: { fr: "Saisie utilisateur", en: "User input", ar: "إدخال المستخدم", es: "Entrada del usuario" },
  generated: { fr: "Généré auto", en: "Auto-generated", ar: "مولّد تلقائياً", es: "Generado automáticamente" },
};

const SECTION_LABELS: Record<SectionType, Localized> = {
  text: { fr: "Texte", en: "Text", ar: "نص", es: "Texto" },
  table: { fr: "Tableau", en: "Table", ar: "جدول", es: "Tabla" },
  signature: { fr: "Signature", en: "Signature", ar: "توقيع", es: "Firma" },
  stamp: { fr: "Cachet", en: "Stamp", ar: "ختم", es: "Sello" },
  qr: { fr: "QR Code", en: "QR code", ar: "رمز QR", es: "Código QR" },
  image: { fr: "Image", en: "Image", ar: "صورة", es: "Imagen" },
  chart: { fr: "Graphique", en: "Chart", ar: "رسم بياني", es: "Gráfico" },
  page_break: { fr: "Saut de page", en: "Page break", ar: "فاصل صفحة", es: "Salto de página" },
};

const ROLE_LABELS: Record<string, Localized> = {
  super_admin: { fr: "Super Admin", en: "Super Admin", ar: "المشرف العام", es: "Superadministrador" },
  syndicate_admin: { fr: "Admin Syndicat", en: "Syndicate admin", ar: "مشرف النقابة", es: "Administrador del sindicato" },
  member: { fr: "Membre", en: "Member", ar: "عضو", es: "Miembro" },
  tenant: { fr: "Locataire", en: "Tenant", ar: "مكتري", es: "Inquilino" },
  all: { fr: "Tous les rôles", en: "All roles", ar: "كل الأدوار", es: "Todos los roles" },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "meeting_minutes" },
  { key: "financial" },
  { key: "legal" },
  { key: "elections" },
  { key: "contracts" },
  { key: "certificates" },
  { key: "regulations" },
  { key: "administrative" },
  { key: "maintenance" },
  { key: "insurance" },
];

const VARIABLE_SOURCES: { key: VariableSource; color: string }[] = [
  { key: "db_syndicate", color: "#2563EB" },
  { key: "db_property", color: "#3b82f6" },
  { key: "db_office_holders", color: "#10b981" },
  { key: "db_member", color: "#f59e0b" },
  { key: "user_input", color: "#0891b2" },
  { key: "generated", color: "#6b7280" },
];

const SECTION_TYPES: { key: SectionType; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "text", icon: "type" },
  { key: "table", icon: "grid" },
  { key: "signature", icon: "pen-tool" },
  { key: "stamp", icon: "circle" },
  { key: "qr", icon: "grid" },
  { key: "image", icon: "image" },
  { key: "chart", icon: "bar-chart-2" },
  { key: "page_break", icon: "minus" },
];

const ROLES = [
  { key: "super_admin" },
  { key: "syndicate_admin" },
  { key: "member" },
  { key: "tenant" },
  { key: "all" },
];

const PRESET_VARIABLES: VariableDef[] = [
  { name: "syndicate_name",    label: { fr: "Nom du syndicat",      ar: "اسم النقابة",          en: "Syndicate name",      es: "Nombre del sindicato"    }, source: "db_syndicate",      type: "text", required: true,  example: "Résidence Les Roses" },
  { name: "syndicate_address", label: { fr: "Adresse du syndicat",  ar: "عنوان النقابة",         en: "Syndicate address",   es: "Dirección del sindicato" }, source: "db_syndicate",      type: "text", required: false, example: "123 Rue Mohammed V, Casablanca" },
  { name: "president_name",    label: { fr: "Nom du président",     ar: "اسم الرئيس",            en: "President name",      es: "Nombre del presidente"   }, source: "db_office_holders", type: "text", required: false, example: "M. Ahmed Benali" },
  { name: "treasurer_name",    label: { fr: "Nom du trésorier",     ar: "اسم أمين المال",         en: "Treasurer name",      es: "Nombre del tesorero"     }, source: "db_office_holders", type: "text", required: false, example: "Mme. Fatima Zahra" },
  { name: "member_name",       label: { fr: "Nom du membre",        ar: "اسم العضو",             en: "Member name",         es: "Nombre del miembro"      }, source: "db_member",         type: "text", required: false, example: "M. Khalid Alaoui" },
  { name: "building_name",     label: { fr: "Nom de la résidence",  ar: "اسم العقار",            en: "Building name",       es: "Nombre del edificio"     }, source: "db_property",       type: "text", required: false, example: "Résidence Al Fath" },
  { name: "lot_number",        label: { fr: "Numéro de lot",        ar: "رقم الوحدة",            en: "Lot number",          es: "Número de unidad"        }, source: "db_property",       type: "text", required: false, example: "A-12" },
  { name: "document_number",   label: { fr: "Numéro de document",   ar: "رقم الوثيقة",           en: "Document number",     es: "Número de documento"     }, source: "generated",         type: "text", required: true,  example: "ATT-2026-0001" },
  { name: "issue_date",        label: { fr: "Date d'émission",      ar: "تاريخ الإصدار",          en: "Issue date",          es: "Fecha de emisión"        }, source: "generated",         type: "date", required: true,  example: "16 juillet 2026" },
];

const emptyI18N = (): I18NField => ({ fr: "", ar: "", en: "", es: "" });

const defaultForm = (): TemplateForm => ({
  slug: "",
  category: "administrative",
  name: emptyI18N(),
  description: emptyI18N(),
  variables: [],
  sections: [
    { id: crypto.randomUUID?.() ?? String(Date.now()), title: { fr: "Contenu", ar: "المحتوى", en: "Content", es: "Contenido" }, content: emptyI18N(), type: "text", required: true, order: 0 },
  ],
  languages: ["fr"],
  layoutConfig: { accentColor: "#2563EB", headerStyle: "branded", footerStyle: "full", watermark: false, showQr: true, showStamp: true },
});

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiReq(path: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: object) {
  // Strip leading /api prefix — libApiRequest already prepends /api internally
  return libApiRequest(path.replace(/^\/api/, ""), method, body);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}{required && <Text style={{ color: "#ef4444" }}> *</Text>}</Text>
      {children}
    </View>
  );
}

function TInput({ value, onChangeText, placeholder, multiline, mono }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean; mono?: boolean;
}) {
  return (
    <TextInput
      style={[s.input, multiline && s.inputMulti, mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#475569"
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      textAlignVertical={multiline ? "top" : "center"}
    />
  );
}

function I18NEditor({ value, onChange, label, multiline }: {
  value: I18NField; onChange: (v: I18NField) => void; label: string; multiline?: boolean;
}) {
  const [activeLang, setActiveLang] = useState<"fr" | "ar" | "en" | "es">("fr");
  return (
    <View style={s.i18nWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.i18nTabs}>
        {LANGS.map((l) => (
          <TouchableOpacity key={l} style={[s.i18nTab, activeLang === l && s.i18nTabActive]}
            onPress={() => setActiveLang(l)}>
            <Text style={[s.i18nTabText, activeLang === l && s.i18nTabTextActive]}>{l.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={[s.input, multiline && s.inputMulti, activeLang === "ar" && { textAlign: "right" }]}
        value={value[activeLang]}
        onChangeText={(t) => onChange({ ...value, [activeLang]: t })}
        placeholder={`${label} en ${LANG_LABELS[activeLang]?.split(" ")[0] ?? activeLang}`}
        placeholderTextColor="#475569"
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

// ─── Variable Editor ──────────────────────────────────────────────────────────

function VariableEditor({ variables, onChange }: { variables: VariableDef[]; onChange: (v: VariableDef[]) => void }) {
  const { lang } = useLanguage();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<VariableDef | null>(null);

  const openEdit = (idx: number) => { setEditingIdx(idx); setDraft({ ...variables[idx] }); };
  const openNew  = () => { setEditingIdx(-1); setDraft({ name: "", label: emptyI18N(), source: "user_input", type: "text", required: false, example: "" }); };
  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) { Alert.alert(tr("error", lang), tr("variableNameRequired", lang)); return; }
    const updated = [...variables];
    if (editingIdx === -1) updated.push(draft);
    else updated[editingIdx!] = draft;
    onChange(updated);
    setEditingIdx(null);
    setDraft(null);
  };
  const remove = (idx: number) => Alert.alert(tr("delete", lang), tr("deleteVariable", lang), [
    { text: tr("cancel", lang), style: "cancel" },
    { text: tr("delete", lang), style: "destructive", onPress: () => onChange(variables.filter((_, i) => i !== idx)) },
  ]);

  return (
    <View>
      <SectionHeader title={tr("variables", lang)} subtitle={tr("variablesDesc", lang)} />

      {/* Preset quick-add */}
      <Text style={s.sectionSub2}>{tr("presets", lang)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
          {PRESET_VARIABLES.filter((p) => !variables.find((v) => v.name === p.name)).map((preset) => {
            const src = VARIABLE_SOURCES.find((s2) => s2.key === preset.source);
            return (
              <TouchableOpacity key={preset.name}
                style={[s.presetChip, { borderColor: src?.color + "44" }]}
                onPress={() => onChange([...variables, preset])}
              >
                <Text style={[s.presetChipText, { color: src?.color }]}>{"{{" + preset.name + "}}"}</Text>
                <Feather name="plus" size={11} color={src?.color} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Variable list */}
      {variables.map((v, idx) => {
        const src = VARIABLE_SOURCES.find((s2) => s2.key === v.source);
        return (
          <View key={v.name} style={s.varCard}>
            <View style={[s.varSourceDot, { backgroundColor: src?.color ?? "#6b7280" }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.varName}>{"{{" + v.name + "}}"}</Text>
              <Text style={s.varLabel}>{v.label[lang] || "—"}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <View style={[s.varTag, { backgroundColor: (src?.color ?? "#6b7280") + "22" }]}>
                  <Text style={[s.varTagText, { color: src?.color ?? "#6b7280" }]}>{src ? tr("source", lang) === tr("source", lang) ? SOURCE_LABELS[v.source][lang] : v.source : v.source}</Text>
                </View>
                <View style={[s.varTag, { backgroundColor: "#33415522" }]}>
                  <Text style={[s.varTagText, { color: "#64748b" }]}>{v.type}</Text>
                </View>
                {v.required && (
                  <View style={[s.varTag, { backgroundColor: "#ef444422" }]}>
                    <Text style={[s.varTagText, { color: "#ef4444" }]}>{tr("required", lang)}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <TouchableOpacity onPress={() => openEdit(idx)} style={s.varAction}>
                <Feather name="edit-2" size={14} color="#94a3b8" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(idx)} style={s.varAction}>
                <Feather name="trash-2" size={14} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={s.addBtn} onPress={openNew}>
        <Feather name="plus" size={16} color="#2563EB" />
        <Text style={s.addBtnText}>{tr("addCustomVariable", lang)}</Text>
      </TouchableOpacity>

      {/* Edit Modal */}
      <Modal visible={editingIdx !== null} transparent animationType="slide" onRequestClose={() => setEditingIdx(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{editingIdx === -1 ? tr("newVariable", lang) : tr("editVariable", lang)}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {draft && (
                <>
                  <Field label={tr("identifier", lang)} required>
                    <TInput value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t.toLowerCase().replace(/\s/g, "_") })} placeholder={tr("variableNamePlaceholder", lang)} mono />
                  </Field>
                  <I18NEditor value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} label={tr("label", lang)} />
                  <Field label={tr("source", lang)}>
                    <View style={s.pickerWrap}>
                      {VARIABLE_SOURCES.map((src) => (
                        <TouchableOpacity key={src.key} style={[s.pickerChip, draft.source === src.key && { backgroundColor: src.color + "22", borderColor: src.color }]}
                          onPress={() => setDraft({ ...draft, source: src.key })}>
                          <Text style={[s.pickerChipText, draft.source === src.key && { color: src.color }]}>{SOURCE_LABELS[src.key][lang]}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                  <Field label={tr("type", lang)}>
                    <View style={s.pickerWrap}>
                      {(["text", "date", "number", "boolean", "list"] as VariableType[]).map((type) => (
                        <TouchableOpacity key={type} style={[s.pickerChip, draft.type === type && s.pickerChipActive]}
                          onPress={() => setDraft({ ...draft, type })}>
                          <Text style={[s.pickerChipText, draft.type === type && s.pickerChipTextActive]}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                  <Field label={tr("exampleValue", lang)}>
                    <TInput value={draft.example} onChangeText={(t) => setDraft({ ...draft, example: t })} placeholder={tr("exampleValuePlaceholder", lang)} />
                  </Field>
                  <View style={s.switchRow}>
                    <Text style={s.fieldLabel}>{tr("required", lang)}</Text>
                    <Switch value={draft.required} onValueChange={(v) => setDraft({ ...draft, required: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
                  </View>
                </>
              )}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setEditingIdx(null)}>
                <Text style={s.modalCancelText}>{tr("cancel", lang)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={save}>
                <Text style={s.modalSaveText}>{tr("save", lang)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Section Editor ───────────────────────────────────────────────────────────

function SectionEditor({ sections, onChange }: { sections: SectionDef[]; onChange: (s: SectionDef[]) => void }) {
  const { lang } = useLanguage();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<SectionDef | null>(null);

  const openEdit = (idx: number) => { setEditingIdx(idx); setDraft({ ...sections[idx] }); };
  const openNew  = () => {
    setEditingIdx(-1);
    setDraft({ id: String(Date.now()), title: emptyI18N(), content: emptyI18N(), type: "text", required: false, order: sections.length });
  };
  const save = () => {
    if (!draft) return;
    if (!draft.title.fr.trim()) { Alert.alert(tr("error", lang), tr("sectionTitleRequired", lang)); return; }
    const updated = [...sections];
    if (editingIdx === -1) updated.push(draft);
    else updated[editingIdx!] = draft;
    onChange(updated);
    setEditingIdx(null); setDraft(null);
  };
  const remove = (idx: number) => Alert.alert(tr("delete", lang), tr("deleteSection", lang), [
    { text: tr("cancel", lang), style: "cancel" },
    { text: tr("delete", lang), style: "destructive", onPress: () => onChange(sections.filter((_, i) => i !== idx)) },
  ]);
  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= sections.length) return;
    const arr = [...sections];
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    arr.forEach((s, i) => s.order = i);
    onChange(arr);
  };

  return (
    <View>
      <SectionHeader title={tr("sections", lang)} subtitle={tr("sectionsDesc", lang)} />
      {sections.map((sec, idx) => {
        const typeInfo = SECTION_TYPES.find((t) => t.key === sec.type);
        return (
          <View key={sec.id} style={s.secCard}>
            <View style={s.secOrderBtns}>
              <TouchableOpacity onPress={() => move(idx, -1)} disabled={idx === 0} style={[s.secOrderBtn, idx === 0 && { opacity: 0.3 }]}>
                <Feather name="chevron-up" size={14} color="#94a3b8" />
              </TouchableOpacity>
              <Text style={s.secOrder}>{idx + 1}</Text>
              <TouchableOpacity onPress={() => move(idx, 1)} disabled={idx === sections.length - 1} style={[s.secOrderBtn, idx === sections.length - 1 && { opacity: 0.3 }]}>
                <Feather name="chevron-down" size={14} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Feather name={typeInfo?.icon ?? "file"} size={13} color="#2563EB" />
                <Text style={s.secTitle}>{sec.title[lang] || tr("untitledSection", lang)}</Text>
              </View>
              {sec.content?.[lang] ? (
                <Text style={s.secContent} numberOfLines={2}>{sec.content[lang]}</Text>
              ) : (
                <Text style={s.secContentEmpty}>{tr("emptyContent", lang)}</Text>
              )}
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <View style={s.varTag}>
                  <Text style={s.varTagText}>{SECTION_LABELS[sec.type][lang]}</Text>
                </View>
                {sec.required && <View style={[s.varTag, { backgroundColor: "#ef444422" }]}><Text style={[s.varTagText, { color: "#ef4444" }]}>{tr("required", lang)}</Text></View>}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => openEdit(idx)} style={s.varAction}><Feather name="edit-2" size={14} color="#94a3b8" /></TouchableOpacity>
              <TouchableOpacity onPress={() => remove(idx)} style={s.varAction}><Feather name="trash-2" size={14} color="#ef4444" /></TouchableOpacity>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={s.addBtn} onPress={openNew}>
        <Feather name="plus" size={16} color="#2563EB" />
        <Text style={s.addBtnText}>{tr("addSection", lang)}</Text>
      </TouchableOpacity>

      <Modal visible={editingIdx !== null} transparent animationType="slide" onRequestClose={() => setEditingIdx(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{editingIdx === -1 ? tr("newSection", lang) : tr("editSection", lang)}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {draft && (
                <>
                  <I18NEditor value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} label={tr("sectionTitle", lang)} />
                  <I18NEditor value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} label={tr("defaultContent", lang)} multiline />
                  <Field label={tr("blockType", lang)}>
                    <View style={s.pickerWrap}>
                      {SECTION_TYPES.map((t) => (
                        <TouchableOpacity key={t.key} style={[s.pickerChip, draft.type === t.key && s.pickerChipActive]}
                          onPress={() => setDraft({ ...draft, type: t.key })}>
                          <Feather name={t.icon} size={12} color={draft.type === t.key ? "#2563EB" : "#64748b"} />
                          <Text style={[s.pickerChipText, draft.type === t.key && s.pickerChipTextActive]}>{SECTION_LABELS[t.key][lang]}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                  <View style={s.switchRow}>
                    <Text style={s.fieldLabel}>{tr("requiredSection", lang)}</Text>
                    <Switch value={draft.required} onValueChange={(v) => setDraft({ ...draft, required: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
                  </View>
                </>
              )}
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setEditingIdx(null)}><Text style={s.modalCancelText}>{tr("cancel", lang)}</Text></TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={save}><Text style={s.modalSaveText}>{tr("save", lang)}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Versions Tab ─────────────────────────────────────────────────────────────

function VersionsTab({ templateId }: { templateId: string }) {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiReq(`/api/template-studio/templates/${templateId}/versions`)
      .then((r) => setVersions(r.data ?? []))
      .catch(() => showToast({ type: "error", message: tr("versionsUnavailable", lang) }))
      .finally(() => setLoading(false));
  }, [templateId]);

  const restore = (ver: VersionEntry) => {
    Alert.alert(
      tr("restoreVersion", lang),
      tr("restoreMessage", lang, { version: String(ver.version), description: ver.changeDescription ?? "" }),
      [
        { text: tr("cancel", lang), style: "cancel" },
        {
          text: tr("restore", lang), onPress: async () => {
            try {
              await apiReq(`/api/template-studio/templates/${templateId}/versions/${ver.id}/restore`, "POST");
              showToast({ type: "success", message: tr("restored", lang) });
              const r = await apiReq(`/api/template-studio/templates/${templateId}/versions`);
              setVersions(r.data ?? []);
            } catch { showToast({ type: "error", message: tr("versionsUnavailable", lang) }); }
          },
        },
      ],
    );
  };

  if (loading) return <LoadingState title={tr("versions", lang)} description={tr("loadingTemplateDesc", lang)} accentColor="#2563EB" />;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <SectionHeader title={tr("versionsHistory", lang)} subtitle={versions.length === 1 ? tr("versionOne", lang) : tr("versionsMany", lang, { count: String(versions.length) })} />
      {versions.map((ver, idx) => (
        <View key={ver.id} style={s.verCard}>
          <View style={[s.verDot, idx === 0 && { backgroundColor: "#2563EB" }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[s.verVersion, idx === 0 && { color: "#a78bfa" }]}>{tr("version", lang)} {ver.version}</Text>
              {idx === 0 && <View style={s.verCurrentBadge}><Text style={s.verCurrentText}>{tr("current", lang)}</Text></View>}
            </View>
            <Text style={s.verDesc}>{ver.changeDescription ?? tr("update", lang)}</Text>
            <Text style={s.verMeta}>{ver.authorName ?? "—"} · {new Date(ver.createdAt).toLocaleDateString(lang === "ar" ? "ar-MA" : lang === "es" ? "es-MA" : lang === "en" ? "en-MA" : "fr-MA", { dateStyle: "medium" })}</Text>
          </View>
          {idx > 0 && (
            <TouchableOpacity onPress={() => restore(ver)} style={s.verRestoreBtn}>
              <Feather name="refresh-cw" size={14} color="#2563EB" />
              <Text style={s.verRestoreText}>{tr("restore", lang)}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab({ templateId }: { templateId: string }) {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const [perms, setPerms] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiReq(`/api/template-studio/templates/${templateId}/permissions`)
      .then((r) => {
        const existing = r.data ?? [];
        // Fill missing roles with defaults
        const merged = ROLES.map((role) => {
          const found = existing.find((p: PermissionEntry) => p.role === role.key);
          return found ?? { id: "", role: role.key, canUse: role.key === "super_admin", canEdit: role.key === "super_admin", canPublish: role.key === "super_admin" };
        });
        setPerms(merged);
      })
      .catch(() => showToast({ type: "error", message: tr("permissionsUnavailable", lang) }))
      .finally(() => setLoading(false));
  }, [templateId]);

  const toggle = (idx: number, field: "canUse" | "canEdit" | "canPublish") => {
    const updated = [...perms];
    updated[idx] = { ...updated[idx], [field]: !updated[idx][field] };
    setPerms(updated);
  };

  const save = async () => {
    try {
      setSaving(true);
      await apiReq(`/api/template-studio/templates/${templateId}/permissions`, "PUT", { permissions: perms });
      showToast({ type: "success", message: tr("permissionsUpdated", lang) });
    } catch { showToast({ type: "error", message: tr("saveError", lang) }); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState title={tr("permissions", lang)} description={tr("loadingTemplateDesc", lang)} accentColor="#2563EB" />;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <SectionHeader title={tr("permissions", lang)} subtitle={tr("accessByRole", lang)} />
      <View style={s.permHeader}>
        <Text style={[s.permLabel, { flex: 1 }]}>{tr("role", lang)}</Text>
        <Text style={s.permCol}>{tr("use", lang)}</Text>
        <Text style={s.permCol}>{tr("modify", lang)}</Text>
        <Text style={s.permCol}>{tr("publish", lang)}</Text>
      </View>
      {perms.map((perm, idx) => {
        const role = ROLES.find((r) => r.key === perm.role);
        const isSuperAdmin = perm.role === "super_admin";
        return (
          <View key={perm.role} style={s.permRow}>
            <Text style={[s.permLabel, { flex: 1 }]}>{ROLE_LABELS[perm.role]?.[lang] ?? perm.role}</Text>
            {(["canUse", "canEdit", "canPublish"] as const).map((field) => (
              <View key={field} style={s.permColView}>
                <Switch
                  value={perm[field]}
                  onValueChange={() => { if (!isSuperAdmin) toggle(idx, field); }}
                  disabled={isSuperAdmin}
                  trackColor={{ false: "#334155", true: "#2563EB" }}
                  thumbColor={perm[field] ? "#a78bfa" : "#64748b"}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>
            ))}
          </View>
        );
      })}
      <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="save" size={16} color="#fff" /><Text style={s.saveBtnText}>{tr("savePermissions", lang)}</Text></>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Layout Tab ───────────────────────────────────────────────────────────────

function LayoutTab({ config, onChange }: { config: TemplateForm["layoutConfig"]; onChange: (c: TemplateForm["layoutConfig"]) => void }) {
  const { lang } = useLanguage();
  const ACCENT_PRESETS = ["#2563EB", "#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#0891b2", "#ec4899", "#1e293b"];
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <SectionHeader title={tr("layout", lang)} subtitle={tr("layoutDesc", lang)} />
      <Field label={tr("accent", lang)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
          {ACCENT_PRESETS.map((c) => (
            <TouchableOpacity key={c} style={[s.colorSwatch, { backgroundColor: c }, config.accentColor === c && s.colorSwatchActive]}
              onPress={() => onChange({ ...config, accentColor: c })} />
          ))}
        </View>
        <TInput value={config.accentColor} onChangeText={(t) => onChange({ ...config, accentColor: t })} placeholder="#2563EB" mono />
      </Field>
      <Field label={tr("headerStyle", lang)}>
        <View style={s.pickerWrap}>
          {(["branded", "minimal", "none"] as const).map((k) => (
            <TouchableOpacity key={k} style={[s.pickerChip, config.headerStyle === k && s.pickerChipActive]}
              onPress={() => onChange({ ...config, headerStyle: k })}>
              <Text style={[s.pickerChipText, config.headerStyle === k && s.pickerChipTextActive]}>{tr(k, lang)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <Field label={tr("footerStyle", lang)}>
        <View style={s.pickerWrap}>
          {(["full", "minimal", "none"] as const).map((k) => (
            <TouchableOpacity key={k} style={[s.pickerChip, config.footerStyle === k && s.pickerChipActive]}
              onPress={() => onChange({ ...config, footerStyle: k })}>
              <Text style={[s.pickerChipText, config.footerStyle === k && s.pickerChipTextActive]}>{tr(k, lang)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <View style={s.switchRow}>
        <View><Text style={s.fieldLabel}>{tr("watermark", lang)}</Text><Text style={s.fieldSub}>{tr("watermarkDesc", lang)}</Text></View>
        <Switch value={config.watermark} onValueChange={(v) => onChange({ ...config, watermark: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
      </View>
      <View style={s.switchRow}>
        <View><Text style={s.fieldLabel}>{tr("qrCode", lang)}</Text><Text style={s.fieldSub}>{tr("qrCodeDesc", lang)}</Text></View>
        <Switch value={config.showQr} onValueChange={(v) => onChange({ ...config, showQr: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
      </View>
      <View style={s.switchRow}>
        <View><Text style={s.fieldLabel}>{tr("officialStamp", lang)}</Text><Text style={s.fieldSub}>{tr("officialStampDesc", lang)}</Text></View>
        <Switch value={config.showStamp} onValueChange={(v) => onChange({ ...config, showStamp: v })} trackColor={{ false: "#334155", true: "#2563EB" }} />
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "info", icon: "info" as const },
  { key: "variables", icon: "code" as const },
  { key: "sections", icon: "layout" as const },
  { key: "layout", icon: "sliders" as const },
  { key: "versions", icon: "clock" as const },
  { key: "permissions", icon: "key" as const },
];

function TemplateEditorContent() {
  const params = useLocalSearchParams<{ id?: string; mode?: string; tab?: string }>();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isNew = params.mode === "create" || !params.id;

  const [form, setForm] = useState<TemplateForm>(defaultForm());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState(params.tab ?? "info");
  const [changeDesc, setChangeDesc] = useState("");
  const [showChangeModal, setShowChangeModal] = useState(false);

  // Load existing template
  useEffect(() => {
    if (isNew || !params.id) return;
    setLoadError(false);
    apiReq(`/api/template-studio/templates/${params.id}`)
      .then((r) => {
        const d = r.data;
        setForm({
          slug:         d.slug ?? "",
          category:     d.category ?? "administrative",
          name:         (typeof d.name === "object" ? d.name : {}) as I18NField,
          description:  (typeof d.description === "object" ? d.description : {}) as I18NField,
          variables:    Array.isArray(d.variables) ? d.variables : [],
          sections:     Array.isArray(d.sections) ? d.sections : [],
          languages:    Array.isArray(d.languages) ? d.languages : ["fr"],
          layoutConfig: typeof d.layoutConfig === "object" && d.layoutConfig
            ? { ...defaultForm().layoutConfig, ...d.layoutConfig }
            : defaultForm().layoutConfig,
        });
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [params.id, isNew]);

  const doSave = async (desc: string) => {
    if (!form.slug.trim() || !form.name.fr.trim()) {
      showToast({ type: "error", message: tr("slugAndNameRequired", lang) }); return;
    }
    try {
      setSaving(true);
      const payload = { ...form, changeDescription: desc || undefined };
      if (isNew) {
        await apiReq("/api/template-studio/templates", "POST", payload);
        showToast({ type: "success", message: tr("created", lang) });
        router.back();
      } else {
        await apiReq(`/api/template-studio/templates/${params.id}`, "PUT", payload);
        showToast({ type: "success", message: tr("updated", lang) });
      }
    } catch (err: any) {
      showToast({ type: "error", message: err?.message?.includes("slug") ? tr("duplicateSlug", lang) : tr("saveError", lang) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!isNew) {
      setShowChangeModal(true);
    } else {
      doSave("");
    }
  };

  if (loading) {
    return (
      <View style={s.root}>
        <LoadingState title={tr("loadingTemplate", lang)} description={tr("loadingTemplateDesc", lang)} accentColor="#2563EB" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={s.root}>
        <ErrorState
          title={tr("templateUnavailable", lang)}
          description={tr("templateUnavailableDesc", lang)}
          retryLabel={tr("retry", lang)}
          onRetry={() => {
            setLoading(true);
            setLoadError(false);
            if (params.id) {
              apiReq(`/api/template-studio/templates/${params.id}`)
                .then((r) => {
                  const d = r.data;
                  setForm({
                    slug: d.slug ?? "",
                    category: d.category ?? "administrative",
                    name: (typeof d.name === "object" ? d.name : {}) as I18NField,
                    description: (typeof d.description === "object" ? d.description : {}) as I18NField,
                    variables: Array.isArray(d.variables) ? d.variables : [],
                    sections: Array.isArray(d.sections) ? d.sections : [],
                    languages: Array.isArray(d.languages) ? d.languages : ["fr"],
                    layoutConfig: typeof d.layoutConfig === "object" && d.layoutConfig
                      ? { ...defaultForm().layoutConfig, ...d.layoutConfig }
                      : defaultForm().layoutConfig,
                  });
                })
                .catch(() => setLoadError(true))
                .finally(() => setLoading(false));
            }
          }}
          accentColor="#ef4444"
        />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: "#0f172a" }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{isNew ? tr("newTemplate", lang) : (form.name[lang] || tr("editTemplate", lang))}</Text>
           {!isNew && <Text style={s.headerSub}>{tr("templateSlugPrefix", lang)} {form.slug}</Text>}
        </View>
        <TouchableOpacity
          style={[s.saveBtn2, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Feather name="save" size={15} color="#fff" /><Text style={s.saveBtnText2}>{isNew ? tr("create", lang) : tr("save", lang)}</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabsContent}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}>
            <Feather name={tab.icon} size={13} color={activeTab === tab.key ? "#a78bfa" : "#64748b"} />
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tr(tab.key as keyof typeof TEXT, lang)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {activeTab === "info" && (
          <View style={{ padding: 20, gap: 4 }}>
            <SectionHeader title={tr("generalInfo", lang)} />
            <Field label={tr("slug", lang)} required>
              <TInput value={form.slug} onChangeText={(t) => setForm({ ...form, slug: t.toLowerCase().replace(/\s/g, "_") })} placeholder={tr("slugPlaceholder", lang)} mono />
            </Field>
            <Field label={tr("category", lang)} required>
              <View style={s.pickerWrap}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c.key} style={[s.pickerChip, form.category === c.key && s.pickerChipActive]}
                    onPress={() => setForm({ ...form, category: c.key })}>
                    <Text style={[s.pickerChipText, form.category === c.key && s.pickerChipTextActive]}>{CATEGORY_LABELS[c.key][lang]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>
            <I18NEditor value={form.name} onChange={(v) => setForm({ ...form, name: v })} label={tr("templateName", lang)} />
            <I18NEditor value={form.description} onChange={(v) => setForm({ ...form, description: v })} label={tr("description", lang)} multiline />
            <Field label={tr("supportedLanguages", lang)}>
              <View style={s.pickerWrap}>
                {LANGS.map((l) => {
                  const active = form.languages.includes(l);
                  return (
                    <TouchableOpacity key={l} style={[s.pickerChip, active && s.pickerChipActive]}
                      onPress={() => {
                        const next = active ? form.languages.filter((x) => x !== l) : [...form.languages, l];
                        if (next.length === 0) return;
                        setForm({ ...form, languages: next });
                      }}>
                      <Text style={[s.pickerChipText, active && s.pickerChipTextActive]}>{LANG_LABELS[l]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
          </View>
        )}
        {activeTab === "variables" && (
          <View style={{ padding: 20 }}>
            <VariableEditor variables={form.variables} onChange={(v) => setForm({ ...form, variables: v })} />
          </View>
        )}
        {activeTab === "sections" && (
          <View style={{ padding: 20 }}>
            <SectionEditor sections={form.sections} onChange={(v) => setForm({ ...form, sections: v })} />
          </View>
        )}
        {activeTab === "layout" && (
          <LayoutTab config={form.layoutConfig} onChange={(v) => setForm({ ...form, layoutConfig: v })} />
        )}
        {activeTab === "versions" && !isNew && params.id && (
          <VersionsTab templateId={params.id} />
        )}
        {activeTab === "permissions" && !isNew && params.id && (
          <PermissionsTab templateId={params.id} />
        )}
        {(activeTab === "versions" || activeTab === "permissions") && isNew && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Feather name="info" size={32} color="#334155" />
            <Text style={{ color: "#64748b", marginTop: 12 }}>{tr("saveFirst", lang)}</Text>
          </View>
        )}
        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* Change description modal (on update) */}
      <Modal visible={showChangeModal} transparent animationType="fade" onRequestClose={() => setShowChangeModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: 300 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{tr("changeDescription", lang)}</Text>
            <Text style={{ color: "#64748b", marginBottom: 12, fontSize: 13 }}>{tr("changeDescriptionHint", lang)}</Text>
            <TextInput
              style={[s.input, { marginBottom: 20 }]}
              value={changeDesc}
              onChangeText={setChangeDesc}
              placeholder={tr("changePlaceholder", lang)}
              placeholderTextColor="#475569"
            />
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowChangeModal(false)}>
                <Text style={s.modalCancelText}>{tr("cancel", lang)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSave} onPress={() => { setShowChangeModal(false); doSave(changeDesc); }}>
                <Text style={s.modalSaveText}>{tr("save", lang)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function TemplateEditor() {
  return (
    <RoleGuard allow={["super_admin"]}>
      <TemplateEditorContent />
    </RoleGuard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: "#0f172a" },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
                      borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 12 },
  backBtn:          { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" },
  headerTitle:      { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  headerSub:        { fontSize: 11, color: "#475569", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  saveBtn2:         { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563EB",
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  saveBtnText2:     { color: "#fff", fontWeight: "700", fontSize: 13 },

  tabsScroll:       { borderBottomWidth: 1, borderBottomColor: "#1e293b", maxHeight: 50 },
  tabsContent:      { paddingHorizontal: 12, gap: 4, flexDirection: "row", alignItems: "center" },
  tab:              { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12,
                      paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive:        { borderBottomColor: "#2563EB" },
  tabText:          { fontSize: 12, color: "#64748b", fontWeight: "500" },
  tabTextActive:    { color: "#a78bfa", fontWeight: "700" },

  sectionHeader:    { marginBottom: 16, marginTop: 8 },
  sectionTitle:     { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  sectionSub:       { fontSize: 12, color: "#64748b", marginTop: 3 },
  sectionSub2:      { fontSize: 11, color: "#475569", fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },

  field:            { marginBottom: 16 },
  fieldLabel:       { fontSize: 12, color: "#94a3b8", fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldSub:         { fontSize: 11, color: "#475569", marginTop: 2 },
  input:            { backgroundColor: "#1e293b", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                      color: "#f1f5f9", fontSize: 14, borderWidth: 1, borderColor: "#334155" },
  inputMulti:       { minHeight: 90, paddingTop: 12 },

  i18nWrap:         { marginBottom: 16 },
  i18nTabs:         { flexDirection: "row", gap: 4, marginBottom: 8 },
  i18nTab:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  i18nTabActive:    { backgroundColor: "#2563EB22", borderColor: "#2563EB" },
  i18nTabText:      { fontSize: 11, color: "#64748b", fontWeight: "600" },
  i18nTabTextActive:{ color: "#a78bfa" },

  pickerWrap:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  pickerChip:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7,
                      borderRadius: 8, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  pickerChipActive: { backgroundColor: "#2563EB22", borderColor: "#2563EB" },
  pickerChipText:   { fontSize: 12, color: "#64748b", fontWeight: "500" },
  pickerChipTextActive: { color: "#a78bfa", fontWeight: "700" },

  switchRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1e293b", marginBottom: 4 },

  // Variables
  presetChip:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10,
                      paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: "#1e293b" },
  presetChipText:   { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  varCard:          { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1e293b",
                      borderRadius: 12, padding: 12, marginBottom: 8, gap: 10,
                      borderWidth: 1, borderColor: "#334155" },
  varSourceDot:     { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  varName:          { fontSize: 12, color: "#a78bfa", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 2 },
  varLabel:         { fontSize: 13, color: "#e2e8f0", fontWeight: "500" },
  varTag:           { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#33415522" },
  varTagText:       { fontSize: 10, color: "#64748b", fontWeight: "600" },
  varAction:        { width: 28, height: 28, borderRadius: 8, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },

  addBtn:           { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14,
                      borderWidth: 1.5, borderColor: "#2563EB44", borderStyle: "dashed",
                      borderRadius: 12, justifyContent: "center", marginTop: 8 },
  addBtnText:       { color: "#a78bfa", fontWeight: "600", fontSize: 14 },

  // Sections
  secCard:          { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#1e293b",
                      borderRadius: 12, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: "#334155" },
  secOrderBtns:     { alignItems: "center", gap: 4 },
  secOrderBtn:      { width: 24, height: 24, borderRadius: 6, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  secOrder:         { fontSize: 11, color: "#64748b", fontWeight: "700", minWidth: 16, textAlign: "center" },
  secTitle:         { fontSize: 13, color: "#e2e8f0", fontWeight: "700" },
  secContent:       { fontSize: 12, color: "#64748b", lineHeight: 18 },
  secContentEmpty:  { fontSize: 11, color: "#334155", fontStyle: "italic" },

  // Versions
  verCard:          { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14,
                      borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  verDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: "#334155", marginTop: 4 },
  verVersion:       { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  verCurrentBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#2563EB22" },
  verCurrentText:   { fontSize: 10, color: "#a78bfa", fontWeight: "700" },
  verDesc:          { fontSize: 13, color: "#e2e8f0", marginTop: 2 },
  verMeta:          { fontSize: 11, color: "#64748b", marginTop: 4 },
  verRestoreBtn:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10,
                      paddingVertical: 6, borderRadius: 8, backgroundColor: "#2563EB22",
                      borderWidth: 1, borderColor: "#2563EB44" },
  verRestoreText:   { fontSize: 11, color: "#a78bfa", fontWeight: "600" },

  // Permissions
  permHeader:       { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#334155", marginBottom: 4 },
  permRow:          { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  permLabel:        { fontSize: 13, color: "#94a3b8", fontWeight: "500" },
  permCol:          { width: 68, textAlign: "center", fontSize: 11, color: "#64748b", fontWeight: "600" },
  permColView:      { width: 68, alignItems: "center" },

  // Save button
  saveBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  saveBtnText:      { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Color swatches
  colorSwatch:      { width: 34, height: 34, borderRadius: 10 },
  colorSwatchActive:{ borderWidth: 2.5, borderColor: "#fff" },

  // Modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet:       { backgroundColor: "#1e293b", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                      maxHeight: "92%", paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12,
                      borderWidth: 1, borderBottomWidth: 0, borderColor: "#334155" },
  modalHandle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155", alignSelf: "center", marginBottom: 20 },
  modalTitle:       { fontSize: 17, fontWeight: "700", color: "#f1f5f9", marginBottom: 20 },
  modalFooter:      { flexDirection: "row", gap: 10, paddingTop: 12 },
  modalCancel:      { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center",
                      backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155" },
  modalCancelText:  { color: "#94a3b8", fontWeight: "600" },
  modalSave:        { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: "#2563EB" },
  modalSaveText:    { color: "#fff", fontWeight: "700" },
});
