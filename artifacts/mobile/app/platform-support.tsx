/**
 * platform-support.tsx — Level-2 Platform Support
 *
 * Accessible by: super_admin, syndicate_admin
 * NOT accessible by: member, tenant (they escalate via the syndicate admin)
 *
 * Hierarchy:
 *   syndicate_admin → Platform Support (here) → Technical Team
 *   super_admin manages all platform tickets here
 *
 * Escalation path:
 *   syndicate_admin triggers escalation from /support screen → creates a platform ticket here
 *   syndicate_admin can also create platform tickets directly (Feature Requests, Bugs, etc.)
 */
import ScreenHeader from "@/components/ScreenHeader";
import { Feather } from "@/components/ui/Feather";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlatformCat = "bug" | "feature" | "acces" | "formation" | "autre";
type Priority    = "high" | "medium" | "low";
type Status      = "open" | "in_progress" | "resolved" | "closed";
type Filter      = "all" | "open" | "in_progress" | "resolved";

const STATE_COPY = {
  loadingTitle: {
    fr: "Chargement du support plateforme",
    en: "Loading platform support",
    ar: "جارٍ تحميل دعم المنصة",
    es: "Cargando soporte de plataforma",
  },
  loadingDescription: {
    fr: "Nous récupérons vos demandes et leur statut.",
    en: "We are retrieving your requests and their status.",
    ar: "نحن نسترجع طلباتك وحالتها.",
    es: "Estamos recuperando sus solicitudes y su estado.",
  },
  unavailableTitle: {
    fr: "Support plateforme indisponible",
    en: "Platform support unavailable",
    ar: "دعم المنصة غير متاح",
    es: "Soporte de plataforma no disponible",
  },
  unavailableDescription: {
    fr: "Les tickets ne sont pas disponibles pour le moment. Vérifiez votre connexion puis réessayez.",
    en: "Tickets are unavailable right now. Check your connection and try again.",
    ar: "التذاكر غير متاحة حالياً. تحقق من الاتصال ثم أعد المحاولة.",
    es: "Los tickets no están disponibles ahora. Compruebe su conexión e inténtelo de nuevo.",
  },
  detailUnavailableDescription: {
    fr: "La conversation de ce ticket n'est pas disponible. Réessayez pour charger les réponses.",
    en: "This ticket conversation is unavailable. Retry to load the replies.",
    ar: "محادثة هذه التذكرة غير متاحة. أعد المحاولة لتحميل الردود.",
    es: "La conversación de este ticket no está disponible. Reintente para cargar las respuestas.",
  },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  sentTitle: { fr: "Demande envoyée", en: "Request sent", ar: "تم إرسال الطلب", es: "Solicitud enviada" },
  sentMessage: {
    fr: "L'équipe plateforme a été notifiée.",
    en: "The platform team has been notified.",
    ar: "تم إخطار فريق المنصة.",
    es: "El equipo de plataforma ha sido notificado.",
  },
  sendError: {
    fr: "Impossible d'envoyer la demande.",
    en: "Unable to send the request.",
    ar: "تعذر إرسال الطلب.",
    es: "No se puede enviar la solicitud.",
  },
  replySent: { fr: "Réponse envoyée", en: "Reply sent", ar: "تم إرسال الرد", es: "Respuesta enviada" },
  replyError: {
    fr: "Impossible d'envoyer la réponse.",
    en: "Unable to send the reply.",
    ar: "تعذر إرسال الرد.",
    es: "No se puede enviar la respuesta.",
  },
  resolved: { fr: "Ticket résolu", en: "Ticket resolved", ar: "تم حل التذكرة", es: "Ticket resuelto" },
  resolveError: {
    fr: "Impossible de résoudre le ticket.",
    en: "Unable to resolve the ticket.",
    ar: "تعذر حل التذكرة.",
    es: "No se puede resolver el ticket.",
  },
} as const;

const PLATFORM_COPY = {
  categoryBug: { fr: "Bug technique", en: "Technical bug", ar: "خلل تقني", es: "Error técnico" },
  categoryFeature: { fr: "Demande de fonctionnalité", en: "Feature request", ar: "طلب ميزة", es: "Solicitud de función" },
  categoryAccess: { fr: "Accès / Compte", en: "Access / Account", ar: "الوصول / الحساب", es: "Acceso / Cuenta" },
  categoryTraining: { fr: "Formation", en: "Training", ar: "التدريب", es: "Formación" },
  categoryOther: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
  categoryBugDescription: { fr: "Dysfonctionnement, erreur, panne", en: "Malfunction, error, outage", ar: "خلل أو خطأ أو عطل", es: "Fallo, error o interrupción" },
  categoryFeatureDescription: { fr: "Nouvelle fonctionnalité souhaitée", en: "Requested new functionality", ar: "وظيفة جديدة مطلوبة", es: "Nueva funcionalidad solicitada" },
  categoryAccessDescription: { fr: "Problème de connexion ou de droits", en: "Sign-in or permission issue", ar: "مشكلة في الدخول أو الصلاحيات", es: "Problema de acceso o permisos" },
  categoryTrainingDescription: { fr: "Question sur l'utilisation du produit", en: "Question about using the product", ar: "سؤال حول استخدام المنتج", es: "Pregunta sobre el uso del producto" },
  categoryOtherDescription: { fr: "Toute autre demande", en: "Any other request", ar: "أي طلب آخر", es: "Cualquier otra solicitud" },
  priorityCritical: { fr: "Critique", en: "Critical", ar: "حرجة", es: "Crítica" },
  priorityNormal: { fr: "Normal", en: "Normal", ar: "عادية", es: "Normal" },
  priorityLow: { fr: "Faible", en: "Low", ar: "منخفضة", es: "Baja" },
  statusOpen: { fr: "Ouvert", en: "Open", ar: "مفتوحة", es: "Abierta" },
  statusInProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  statusResolved: { fr: "Résolu", en: "Resolved", ar: "محلولة", es: "Resuelto" },
  statusClosed: { fr: "Fermé", en: "Closed", ar: "مغلقة", es: "Cerrado" },
  title: { fr: "Support Plateforme", en: "Platform Support", ar: "دعم المنصة", es: "Soporte de plataforma" },
  level: { fr: "Niveau 2", en: "Level 2", ar: "المستوى 2", es: "Nivel 2" },
  pending: { fr: "ticket(s) plateforme en attente", en: "platform ticket(s) pending", ar: "تذكرة منصة قيد الانتظار", es: "ticket(s) de plataforma pendientes" },
  open: { fr: "ouvert(s)", en: "open", ar: "مفتوحة", es: "abiertos" },
  technicalSubtitle: { fr: "Support technique & fonctionnel", en: "Technical & functional support", ar: "الدعم التقني والوظيفي", es: "Soporte técnico y funcional" },
  residents: { fr: "Résidents", en: "Residents", ar: "السكان", es: "Residentes" },
  syndicate: { fr: "Syndicat", en: "Syndicate", ar: "النقابة", es: "Sindicato" },
  platform: { fr: "Plateforme", en: "Platform", ar: "المنصة", es: "Plataforma" },
  technical: { fr: "Technique", en: "Technical", ar: "تقني", es: "Técnico" },
  all: { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  openFilter: { fr: "Ouverts", en: "Open", ar: "مفتوحة", es: "Abiertos" },
  inProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  resolved: { fr: "Résolus", en: "Resolved", ar: "محلولة", es: "Resueltos" },
  total: { fr: "Total", en: "Total", ar: "الإجمالي", es: "Total" },
  contact: { fr: "Contacter le support plateforme", en: "Contact platform support", ar: "التواصل مع دعم المنصة", es: "Contactar con soporte de plataforma" },
  shortcutDescription: { fr: "Bug, demande de fonctionnalité, problème de compte…", en: "Bugs, feature requests, account issues…", ar: "أخطاء أو طلبات ميزات أو مشاكل الحساب…", es: "Errores, solicitudes de funciones, problemas de cuenta…" },
  noPlatformTickets: { fr: "Aucun ticket plateforme", en: "No platform tickets", ar: "لا توجد تذاكر منصة", es: "No hay tickets de plataforma" },
  noRequests: { fr: "Aucune demande envoyée", en: "No requests sent", ar: "لم يتم إرسال أي طلب", es: "No se han enviado solicitudes" },
  allProcessed: { fr: "Tous les tickets ont été traités.", en: "All tickets have been handled.", ar: "تمت معالجة جميع التذاكر.", es: "Todos los tickets han sido tratados." },
  useChannel: { fr: "Utilisez ce canal pour signaler des bugs ou demander de nouvelles fonctionnalités.", en: "Use this channel to report bugs or request new features.", ar: "استخدم هذه القناة للإبلاغ عن الأخطاء أو طلب ميزات جديدة.", es: "Usa este canal para informar de errores o solicitar funciones." },
  escalated: { fr: "Escaladé depuis le syndicat", en: "Escalated from syndicate", ar: "تم التصعيد من النقابة", es: "Escalado desde el sindicato" },
  submittedBy: { fr: "Soumis par", en: "Submitted by", ar: "مقدم الطلب", es: "Enviado por" },
  date: { fr: "Date", en: "Date", ar: "التاريخ", es: "Fecha" },
  description: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  conversation: { fr: "Conversation", en: "Conversation", ar: "المحادثة", es: "Conversación" },
  platformTeam: { fr: "Équipe Plateforme", en: "Platform Team", ar: "فريق المنصة", es: "Equipo de plataforma" },
  teamReply: { fr: "Réponse de l'équipe plateforme", en: "Platform team reply", ar: "رد فريق المنصة", es: "Respuesta del equipo de plataforma" },
  addInformation: { fr: "Ajouter des informations", en: "Add information", ar: "إضافة معلومات", es: "Añadir información" },
  replyPlaceholder: { fr: "Répondez au ticket de l'administrateur…", en: "Reply to the administrator's ticket…", ar: "الرد على تذكرة المسؤول…", es: "Responde al ticket del administrador…" },
  detailsPlaceholder: { fr: "Fournissez des précisions supplémentaires…", en: "Provide additional details…", ar: "قدم تفاصيل إضافية…", es: "Proporciona más detalles…" },
  send: { fr: "Envoyer", en: "Send", ar: "إرسال", es: "Enviar" },
  resolvedBanner: { fr: "Ce ticket a été traité par l'équipe plateforme.", en: "This ticket has been handled by the platform team.", ar: "تمت معالجة هذه التذكرة من قبل فريق المنصة.", es: "Este ticket ha sido tratado por el equipo de plataforma." },
  newModalTitle: { fr: "Contacter le Support Plateforme", en: "Contact Platform Support", ar: "التواصل مع دعم المنصة", es: "Contactar con soporte de plataforma" },
  administrator: { fr: "Administrateur", en: "Administrator", ar: "المسؤول", es: "Administrador" },
  requestType: { fr: "Type de demande", en: "Request type", ar: "نوع الطلب", es: "Tipo de solicitud" },
  criticality: { fr: "Criticité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  subject: { fr: "Sujet", en: "Subject", ar: "الموضوع", es: "Asunto" },
  detailedDescription: { fr: "Description détaillée", en: "Detailed description", ar: "الوصف التفصيلي", es: "Descripción detallada" },
  bugSubject: { fr: "Ex : Les signatures électroniques ne fonctionnent plus", en: "E.g. Electronic signatures no longer work", ar: "مثال: لم تعد التوقيعات الإلكترونية تعمل", es: "Ej.: Las firmas electrónicas ya no funcionan" },
  featureSubject: { fr: "Ex : Badges visiteurs avec QR code", en: "E.g. Visitor badges with QR code", ar: "مثال: شارات الزوار برمز QR", es: "Ej.: Insignias de visitantes con código QR" },
  accessSubject: { fr: "Ex : Impossible de se connecter depuis l'application", en: "E.g. Unable to sign in from the app", ar: "مثال: لا يمكن تسجيل الدخول من التطبيق", es: "Ej.: No se puede iniciar sesión desde la aplicación" },
  trainingSubject: { fr: "Ex : Comment configurer les appels de fonds automatiques ?", en: "E.g. How do I configure automatic charge calls?", ar: "مثال: كيف أضبط طلبات التحصيل التلقائية؟", es: "Ej.: ¿Cómo configuro las cuotas automáticas?" },
  otherSubject: { fr: "Décrivez brièvement votre demande", en: "Briefly describe your request", ar: "صف طلبك باختصار", es: "Describe brevemente tu solicitud" },
  bugDescription: { fr: "Décrivez le problème : quand est-il apparu ? Quels utilisateurs sont affectés ? Quels appareils ?", en: "Describe the issue: when did it appear? Which users and devices are affected?", ar: "صف المشكلة: متى ظهرت؟ ما المستخدمون والأجهزة المتأثرة؟", es: "Describe el problema: ¿cuándo apareció? ¿Qué usuarios y dispositivos están afectados?" },
  requestDescription: { fr: "Décrivez votre besoin en détail. Précisez le contexte métier et l'impact attendu.", en: "Describe your need in detail. Include the business context and expected impact.", ar: "صف احتياجك بالتفصيل. اذكر سياق العمل والأثر المتوقع.", es: "Describe tu necesidad en detalle. Indica el contexto y el impacto esperado." },
  privacyNote: { fr: "Ce ticket est envoyé directement à l'équipe technique de la plateforme. Les résidents ne peuvent pas accéder à ce canal.", en: "This ticket is sent directly to the platform technical team. Residents cannot access this channel.", ar: "تُرسل هذه التذكرة مباشرة إلى الفريق التقني للمنصة. لا يمكن للسكان الوصول إلى هذه القناة.", es: "Este ticket se envía directamente al equipo técnico de la plataforma. Los residentes no pueden acceder a este canal." },
  sending: { fr: "Envoi en cours…", en: "Sending…", ar: "جارٍ الإرسال…", es: "Enviando…" },
  sendToSupport: { fr: "Envoyer au support plateforme", en: "Send to platform support", ar: "إرسال إلى دعم المنصة", es: "Enviar al soporte de plataforma" },
} as const;

const CATEGORY_COPY_KEYS = {
  bug: ["categoryBug", "categoryBugDescription"],
  feature: ["categoryFeature", "categoryFeatureDescription"],
  acces: ["categoryAccess", "categoryAccessDescription"],
  formation: ["categoryTraining", "categoryTrainingDescription"],
  autre: ["categoryOther", "categoryOtherDescription"],
} as const;

const PRIORITY_COPY_KEYS = {
  high: "priorityCritical",
  medium: "priorityNormal",
  low: "priorityLow",
} as const;

const STATUS_COPY_KEYS = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  resolved: "statusResolved",
  closed: "statusClosed",
} as const;

interface PlatformTicket {
  id:              string;
  title:           string;
  description:     string;
  submittedBy:     string;
  submittedById?:  string;
  syndicateId?:    string;
  priority:        Priority;
  status:          Status;
  date:            string;
  category:        PlatformCat;
  escalatedFrom?:  string;
  replies?:        Reply[];
}

interface Reply {
  id:         string;
  authorName: string;
  authorId:   string;
  text:       string;
  createdAt:  string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Texts of the ticket list, detail and form (fr · en · ar · es).
const PS: Record<string, Record<"fr" | "en" | "ar" | "es", string>> = {
  cat_bug: { fr: "Bug technique", en: "Technical bug", ar: "خلل تقني", es: "Error técnico" },
  cat_feature: { fr: "Demande de fonction", en: "Feature request", ar: "طلب ميزة", es: "Solicitud de función" },
  cat_acces: { fr: "Accès / Compte", en: "Access / Account", ar: "الدخول / الحساب", es: "Acceso / Cuenta" },
  cat_formation: { fr: "Formation", en: "Training", ar: "تكوين", es: "Formación" },
  cat_autre: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
  catDesc_bug: { fr: "Dysfonctionnement, erreur, panne", en: "Malfunction, error, outage", ar: "عطل، خطأ، توقف", es: "Fallo, error, avería" },
  catDesc_feature: { fr: "Nouvelle fonctionnalité souhaitée", en: "A new feature you need", ar: "ميزة جديدة مطلوبة", es: "Nueva funcionalidad deseada" },
  catDesc_acces: { fr: "Problème de connexion ou de droits", en: "Sign-in or permission problem", ar: "مشكلة في الدخول أو الصلاحيات", es: "Problema de conexión o de permisos" },
  catDesc_formation: { fr: "Question sur l'utilisation du produit", en: "Question about using the product", ar: "سؤال حول استعمال التطبيق", es: "Pregunta sobre el uso del producto" },
  catDesc_autre: { fr: "Toute autre demande", en: "Any other request", ar: "أي طلب آخر", es: "Cualquier otra solicitud" },
  pri_high: { fr: "Critique", en: "Critical", ar: "حرجة", es: "Crítica" },
  pri_medium: { fr: "Normal", en: "Normal", ar: "عادية", es: "Normal" },
  pri_low: { fr: "Faible", en: "Low", ar: "منخفضة", es: "Baja" },
  shortcutTitle: { fr: "Contacter le support plateforme", en: "Contact platform support", ar: "التواصل مع دعم المنصة", es: "Contactar con el soporte de la plataforma" },
  shortcutSub: { fr: "Bug, demande de fonctionnalité, problème de compte…", en: "Bug, feature request, account problem…", ar: "خلل، طلب ميزة، مشكلة في الحساب…", es: "Error, solicitud de función, problema de cuenta…" },
  emptyAdmin: { fr: "Aucun ticket plateforme", en: "No platform tickets", ar: "لا توجد تذاكر للمنصة", es: "Ningún ticket de plataforma" },
  emptyUser: { fr: "Aucune demande envoyée", en: "No request sent", ar: "لم يُرسَل أي طلب", es: "Ninguna solicitud enviada" },
  emptyAdminSub: { fr: "Tous les tickets ont été traités.", en: "Every ticket has been handled.", ar: "تمت معالجة جميع التذاكر.", es: "Todos los tickets se han tratado." },
  emptyUserSub: { fr: "Utilisez ce canal pour signaler des bugs ou demander de nouvelles fonctionnalités.", en: "Use this channel to report bugs or ask for new features.", ar: "استعمل هذه القناة للإبلاغ عن الأخطاء أو طلب ميزات جديدة.", es: "Use este canal para informar de errores o pedir nuevas funciones." },
  escalated: { fr: "Escaladé depuis le syndicat", en: "Escalated by the syndic", ar: "مُحال من السانديك", es: "Escalado por el administrador" },
  ticket: { fr: "Ticket #{id}", en: "Ticket #{id}", ar: "تذكرة #{id}", es: "Ticket #{id}" },
  resolve: { fr: "Résoudre", en: "Resolve", ar: "حلّ", es: "Resolver" },
  escalationNotice: { fr: "Ce ticket a été escaladé depuis le support syndicat. Ticket d'origine : #{id}", en: "This ticket was escalated from the syndic's support. Original ticket: #{id}", ar: "أُحيلت هذه التذكرة من دعم السانديك. التذكرة الأصلية: #{id}", es: "Este ticket se escaló desde el soporte del administrador. Ticket original: #{id}" },
  submittedBy: { fr: "Soumis par", en: "Submitted by", ar: "مقدَّم من", es: "Enviado por" },
  description: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  conversation: { fr: "Conversation ({n})", en: "Conversation ({n})", ar: "المحادثة ({n})", es: "Conversación ({n})" },
  platformTeam: { fr: " · Équipe plateforme", en: " · Platform team", ar: " · فريق المنصة", es: " · Equipo de la plataforma" },
  replyAdmin: { fr: "Réponse de l'équipe plateforme", en: "Platform team reply", ar: "رد فريق المنصة", es: "Respuesta del equipo de la plataforma" },
  replyUser: { fr: "Ajouter des informations", en: "Add information", ar: "إضافة معلومات", es: "Añadir información" },
  replyAdminPh: { fr: "Répondez au ticket de l'administrateur…", en: "Reply to the administrator's ticket…", ar: "ردّ على تذكرة المسؤول…", es: "Responda al ticket del administrador…" },
  replyUserPh: { fr: "Fournissez des précisions supplémentaires…", en: "Give more details…", ar: "قدّم تفاصيل إضافية…", es: "Aporte más detalles…" },
  send: { fr: "Envoyer", en: "Send", ar: "إرسال", es: "Enviar" },
  resolvedBanner: { fr: "Ce ticket a été traité par l'équipe plateforme.", en: "The platform team has handled this ticket.", ar: "عالج فريق المنصة هذه التذكرة.", es: "El equipo de la plataforma ha tratado este ticket." },
  newTitle: { fr: "Contacter le support plateforme", en: "Contact platform support", ar: "التواصل مع دعم المنصة", es: "Contactar con el soporte de la plataforma" },
  admin: { fr: "Administrateur : ", en: "Administrator: ", ar: "المسؤول: ", es: "Administrador: " },
  requestType: { fr: "Type de demande *", en: "Type of request *", ar: "نوع الطلب *", es: "Tipo de solicitud *" },
  criticality: { fr: "Criticité", en: "Severity", ar: "درجة الأهمية", es: "Gravedad" },
  subject: { fr: "Sujet *", en: "Subject *", ar: "الموضوع *", es: "Asunto *" },
  subjectPh_bug: { fr: "Ex : Les signatures électroniques ne fonctionnent plus", en: "E.g. Electronic signatures no longer work", ar: "مثال: التوقيعات الإلكترونية لم تعد تعمل", es: "Ej.: Las firmas electrónicas ya no funcionan" },
  subjectPh_feature: { fr: "Ex : Badges visiteurs avec QR code", en: "E.g. Visitor badges with a QR code", ar: "مثال: شارات الزوار برمز QR", es: "Ej.: Credenciales de visitante con código QR" },
  subjectPh_acces: { fr: "Ex : Impossible de se connecter depuis l'application", en: "E.g. Cannot sign in from the app", ar: "مثال: تعذّر الدخول من التطبيق", es: "Ej.: No es posible iniciar sesión desde la aplicación" },
  subjectPh_formation: { fr: "Ex : Comment configurer les appels de fonds automatiques ?", en: "E.g. How do I set up automatic calls for funds?", ar: "مثال: كيف أضبط نداءات الأموال التلقائية؟", es: "Ej.: ¿Cómo configuro las derramas automáticas?" },
  subjectPh_autre: { fr: "Décrivez brièvement votre demande", en: "Describe your request briefly", ar: "صف طلبك باختصار", es: "Describa brevemente su solicitud" },
  details: { fr: "Description détaillée *", en: "Detailed description *", ar: "وصف مفصّل *", es: "Descripción detallada *" },
  detailsPhBug: { fr: "Décrivez le problème : quand est-il apparu ? Quels utilisateurs sont affectés ? Quels appareils ?", en: "Describe the problem: when did it start? Which users are affected? Which devices?", ar: "صف المشكلة: متى ظهرت؟ من المستخدمون المتأثرون؟ ما الأجهزة؟", es: "Describa el problema: ¿cuándo apareció? ¿Qué usuarios están afectados? ¿Qué dispositivos?" },
  detailsPh: { fr: "Décrivez votre besoin en détail. Précisez le contexte métier et l'impact attendu.", en: "Describe your need in detail, with the business context and the expected impact.", ar: "صف حاجتك بالتفصيل، مع السياق والأثر المنتظر.", es: "Describa su necesidad en detalle, con el contexto y el impacto esperado." },
  note: { fr: "Ce ticket est envoyé directement à l'équipe technique de la plateforme. Les résidents ne peuvent pas accéder à ce canal.", en: "This ticket goes straight to the platform's technical team. Residents cannot access this channel.", ar: "تُرسَل هذه التذكرة مباشرة إلى الفريق التقني للمنصة. لا يمكن للسكان الوصول إلى هذه القناة.", es: "Este ticket se envía directamente al equipo técnico de la plataforma. Los residentes no tienen acceso a este canal." },
  sending: { fr: "Envoi en cours…", en: "Sending…", ar: "جارٍ الإرسال…", es: "Enviando…" },
  submit: { fr: "Envoyer au support plateforme", en: "Send to platform support", ar: "إرسال إلى دعم المنصة", es: "Enviar al soporte de la plataforma" },
};


const CATEGORIES: { key: PlatformCat; labelFr: string; desc: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { key: "bug",      labelFr: "Bug Technique",         desc: "Dysfonctionnement, erreur, panne",       icon: "alert-octagon",  color: "#C8323C" },
  { key: "feature",  labelFr: "Demande de Fonction",   desc: "Nouvelle fonctionnalité souhaitée",      icon: "zap",            color: "#1F8A9A" },
  { key: "acces",    labelFr: "Accès / Compte",        desc: "Problème de connexion ou de droits",     icon: "lock",           color: "#C98511" },
  { key: "formation",labelFr: "Formation",              desc: "Question sur l'utilisation du produit",  icon: "book-open",      color: "#5A4AD6" },
  { key: "autre",    labelFr: "Autre",                  desc: "Toute autre demande",                    icon: "help-circle",    color: "#6A6680" },
];

const PRIORITIES: { key: Priority; labelFr: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { key: "high",   labelFr: "Critique", icon: "alert-circle",   color: "#C8323C" },
  { key: "medium", labelFr: "Normal",   icon: "alert-triangle", color: "#C98511" },
  { key: "low",    labelFr: "Faible",   icon: "info",           color: "#5A4AD6" },
];

const STATUS_CFG = {
  open:        { color: "#C8323C", icon: "alert-circle"  as const, label: "Ouvert" },
  in_progress: { color: "#C98511", icon: "clock"         as const, label: "En cours" },
  resolved:    { color: "#13976C", icon: "check-circle"  as const, label: "Résolu" },
  closed:      { color: "#6A6680", icon: "x-circle"      as const, label: "Fermé" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function catCfg(c: string) { return CATEGORIES.find((x) => x.key === c) ?? CATEGORIES[4]; }
function priCfg(p: string) { return PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[1]; }
function stCfg (s: string) { return STATUS_CFG[s as keyof typeof STATUS_CFG] ?? STATUS_CFG.open; }
function fmtDate(d: string, lang: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d.slice(0, 10);
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
  return dt.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Main Component ───────────────────────────────────────────────────────────

function PlatformSupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const ps = (k: string, vars?: Record<string, string | number>) => {
    let out = PS[k]?.[lang as "fr"] ?? PS[k]?.fr ?? k;
    for (const [n, v] of Object.entries(vars ?? {})) out = out.split(`{${n}}`).join(String(v));
    return out;
  };
  const { showToast } = useToast();
  const { isWide } = useBreakpoints();

  const isSuperAdmin     = user?.role === "super_admin";
  const isSyndicateAdmin = user?.role === "syndicate_admin";
  const topPad           = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const rowDirection = "row";

  // ── List state ──
  const [tickets,  setTickets]  = useState<PlatformTicket[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter,   setFilter]   = useState<Filter>("all");

  // ── Detail state ──
  const [selected,  setSelected]  = useState<PlatformTicket | null>(null);
  const [replies,   setReplies]   = useState<Reply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying,  setReplying]  = useState(false);

  // ── New ticket state ──
  const [showNew,    setShowNew]    = useState(false);
  const [newTitle,   setNewTitle]   = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newPri,     setNewPri]     = useState<Priority>("medium");
  const [newCat,     setNewCat]     = useState<PlatformCat>("bug");
  const [submitting, setSubmitting] = useState(false);

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // super_admin: GET /support always returns platform tickets
      // syndicate_admin: GET /support?scope=platform returns their platform tickets
      const url = isSuperAdmin ? "/support" : "/support?scope=platform";
      const res = await apiRequest(url, "GET", undefined, token);
      const rows: any[] = res?.data ?? res?.items ?? [];
      setTickets(rows.map((r: any) => ({
        id:            String(r.id),
        title:         String(r.title ?? ""),
        description:   String(r.description ?? ""),
        submittedBy:   String(r.submittedByName ?? r.submittedBy ?? ""),
        submittedById: String(r.submittedById ?? ""),
        syndicateId:   String(r.syndicateId ?? ""),
        priority:      (r.priority ?? "medium") as Priority,
        status:        (r.status ?? "open") as Status,
        date:          String(r.createdAt ?? r.date ?? ""),
        category:      (r.category ?? "autre") as PlatformCat,
        escalatedFrom: r.escalatedFrom ? String(r.escalatedFrom) : undefined,
      })));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token, isSuperAdmin]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // ─── Fetch detail / replies ────────────────────────────────────────────────

  const fetchReplies = useCallback(async () => {
    if (!selected) {
      setReplies([]);
      setRepliesError(false);
      return;
    }
    setRepliesLoading(true);
    setRepliesError(false);
    try {
      const res: any = await apiRequest(`/support/${selected.id}`, "GET", undefined, token);
      setReplies(res?.data?.replies ?? []);
    } catch {
      setRepliesError(true);
    } finally {
      setRepliesLoading(false);
    }
  }, [selected?.id, token]);

  useEffect(() => { void fetchReplies(); }, [fetchReplies]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("/support", "POST", {
        title:       newTitle.trim(),
        description: newDesc.trim(),
        priority:    newPri,
        category:    newCat,
        scope:       "platform",
      }, token);
      showToast({ type: "success", title: STATE_COPY.sentTitle[lang], message: STATE_COPY.sentMessage[lang] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNew(false);
      setNewTitle(""); setNewDesc(""); setNewPri("medium"); setNewCat("bug");
      fetchTickets();
    } catch {
      showToast({ type: "error", title: STATE_COPY.error[lang], message: STATE_COPY.sendError[lang] });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selected) return;
    setReplying(true);
    try {
      await apiRequest(`/support/${selected.id}/replies`, "POST", { text: replyText.trim() }, token);
      setReplyText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: STATE_COPY.replySent[lang] });
      const res: any = await apiRequest(`/support/${selected.id}`, "GET", undefined, token);
      setReplies(res?.data?.replies ?? []);
      setTickets((prev) => prev.map((tk) => tk.id === selected.id ? { ...tk, status: "in_progress" } : tk));
    } catch {
      showToast({ type: "error", title: STATE_COPY.error[lang], message: STATE_COPY.replyError[lang] });
    } finally {
      setReplying(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await apiRequest(`/support/${id}/resolve`, "PUT", undefined, token);
      showToast({ type: "success", title: STATE_COPY.resolved[lang] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      fetchTickets();
    } catch {
      showToast({ type: "error", title: STATE_COPY.error[lang], message: STATE_COPY.resolveError[lang] });
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const filtered = tickets.filter((tk) => filter === "all" || tk.status === filter);
  const openCount = tickets.filter((tk) => tk.status === "open").length;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",         label: PLATFORM_COPY.all[lang] },
    { key: "open",        label: PLATFORM_COPY.openFilter[lang] },
    { key: "in_progress", label: PLATFORM_COPY.inProgress[lang] },
    { key: "resolved",    label: PLATFORM_COPY.resolved[lang] },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      {/* ── Header ── */}
      <ScreenHeader
        title={`${t("supportPlateforme")} · ${PLATFORM_COPY.level[lang]}`}
        subtitle={isSuperAdmin ? `${openCount} ${PLATFORM_COPY.pending[lang]}` : `${PLATFORM_COPY.technicalSubtitle[lang]} · ${openCount} ${PLATFORM_COPY.open[lang]}`}
        action={isSyndicateAdmin ? { icon: "plus", label: t("newItem"), onPress: () => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } } : undefined}
      />

      {/* ── Hierarchy info banner ── */}
      <View style={[styles.hierarchyBanner, { flexDirection: rowDirection, backgroundColor: "#5A4AD6" + "09", borderBottomColor: colors.border }]}>
        <View style={styles.hierarchyStep}>
          <Feather name="users" size={13} color={colors.mutedForeground} />
          <Text style={[styles.hierarchyTxt, { color: colors.mutedForeground }]}>{PLATFORM_COPY.residents[lang]}</Text>
        </View>
        <Feather name="arrow-right" size={12} color={colors.mutedForeground} />
        <View style={styles.hierarchyStep}>
          <Feather name="home" size={13} color={colors.warning} />
          <Text style={[styles.hierarchyTxt, { color: colors.warning }]}>{PLATFORM_COPY.syndicate[lang]}</Text>
        </View>
        <Feather name="arrow-right" size={12} color={colors.mutedForeground} />
        <View style={styles.hierarchyStep}>
          <Feather name="life-buoy" size={13} color="#5A4AD6" />
          <Text style={[styles.hierarchyTxt, { color: "#5A4AD6", fontFamily: "Inter_700Bold" }]}>{PLATFORM_COPY.platform[lang]} {isRTL ? "◀" : "▶"}</Text>
        </View>
        <Feather name="arrow-right" size={12} color={colors.mutedForeground} />
        <View style={styles.hierarchyStep}>
          <Feather name="code" size={13} color={colors.mutedForeground} />
          <Text style={[styles.hierarchyTxt, { color: colors.mutedForeground }]}>{PLATFORM_COPY.technical[lang]}</Text>
        </View>
      </View>

      {/* ── Stats strip ── */}
      <View style={[styles.statsStrip, { flexDirection: rowDirection, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: PLATFORM_COPY.openFilter[lang], count: tickets.filter((t) => t.status === "open").length, color: colors.danger },
          { label: PLATFORM_COPY.inProgress[lang], count: tickets.filter((t) => t.status === "in_progress").length, color: colors.warning },
          { label: PLATFORM_COPY.resolved[lang], count: tickets.filter((t) => t.status === "resolved").length, color: colors.success },
          { label: PLATFORM_COPY.total[lang], count: tickets.length, color: "#5A4AD6" },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <View style={[styles.statDiv, { backgroundColor: colors.border }]} />}
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.count}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Filters ── */}
      <View style={[styles.filterRow, { flexDirection: rowDirection, borderBottomColor: colors.border }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, { backgroundColor: filter === f.key ? "#5A4AD6" : "transparent" }]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterLbl, { color: filter === f.key ? "#fff" : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── List ── */}
      {loading ? (
        <LoadingState
          title={STATE_COPY.loadingTitle[lang]}
          description={STATE_COPY.loadingDescription[lang]}
          accentColor="#5A4AD6"
        />
      ) : loadError ? (
        <ErrorState
          title={STATE_COPY.unavailableTitle[lang]}
          description={STATE_COPY.unavailableDescription[lang]}
          retryLabel={STATE_COPY.retry[lang]}
          onRetry={() => void fetchTickets()}
          accentColor="#5A4AD6"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(tk) => tk.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isSyndicateAdmin ? (
              /* Shortcut card for syndicate admin */
              <TouchableOpacity
                style={[styles.shortcutCard, { backgroundColor: "#5A4AD6" + "0D", borderColor: "#5A4AD6" + "30" }]}
                onPress={() => { setShowNew(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: "#5A4AD6" }]}>
                  <Feather name="send" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shortcutTitle, { color: "#5A4AD6" }]}>{ps("shortcutTitle")}</Text>
                  <Text style={[styles.shortcutSub, { color: colors.mutedForeground }]}>
                    {ps("shortcutSub")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#5A4AD6" />
              </TouchableOpacity>
            ) : undefined
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: "#5A4AD6" + "12" }]}>
                <Feather name="life-buoy" size={36} color="#5A4AD6" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {isSuperAdmin ? ps("emptyAdmin") : ps("emptyUser")}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {isSuperAdmin
                  ? ps("emptyAdminSub")
                  : ps("emptyUserSub")}
              </Text>
            </View>
          }
          renderItem={({ item: ticket }) => {
            const pc = priCfg(ticket.priority);
            const sc = stCfg(ticket.status);
            const cc = catCfg(ticket.category);
            return (
              <TouchableOpacity
                style={[styles.card, {
                  backgroundColor: colors.card,
                  borderColor:     colors.border,
                  borderLeftColor: pc.color,
                }]}
                onPress={() => { setSelected(ticket); setReplyText(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                {/* Escalation origin badge */}
                {ticket.escalatedFrom && (
                  <View style={[styles.escalatedBadge, { backgroundColor: colors.danger + "12" }]}>
                    <Feather name="trending-up" size={10} color={colors.danger} />
                    <Text style={[styles.escalatedTxt, { color: colors.danger }]}>{ps("escalated")}</Text>
                  </View>
                )}
                <View style={styles.cardTop}>
                  <View style={[styles.cardIcon, { backgroundColor: cc.color + "15" }]}>
                    <Feather name={cc.icon} size={18} color={cc.color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ticket.title}
                    </Text>
                    <View style={styles.cardMeta}>
                      <Text style={[styles.cardBy, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {ticket.submittedBy}
                      </Text>
                      <Text style={[styles.dot, { color: colors.mutedForeground }]}>•</Text>
                      <Text style={[styles.cardCat, { color: cc.color }]}>{ps(`cat_${cc.key}`)}</Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <View style={[styles.badge, { backgroundColor: pc.color + "15" }]}>
                      <Feather name={pc.icon} size={9} color={pc.color} />
                      <Text style={[styles.badgeTxt, { color: pc.color }]}>{ps(`pri_${pc.key}`)}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sc.color + "15" }]}>
                      <Feather name={sc.icon} size={9} color={sc.color} />
                      <Text style={[styles.badgeTxt, { color: sc.color }]}>{PLATFORM_COPY[STATUS_COPY_KEYS[ticket.status]][lang]}</Text>
                    </View>
                  </View>
                </View>
                <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>{fmtDate(ticket.date, lang)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TICKET DETAIL MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <KeyboardAvoidingView
            style={[styles.modal, { backgroundColor: colors.background }]}
            behavior="padding"
          >
            {/* Modal header */}
            <View style={[styles.modalHdr, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                {ps("ticket", { id: selected.id.slice(-6).toUpperCase() })}
              </Text>
              {isSuperAdmin && selected.status !== "resolved" ? (
                <TouchableOpacity
                  style={[styles.resolveBtn, { backgroundColor: colors.success }]}
                  onPress={() => handleResolve(selected.id)}
                >
                  <Feather name="check" size={12} color="#fff" />
                  <Text style={styles.resolveBtnTxt}>{ps("resolve")}</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 72 }} />}
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Escalation origin notice */}
              {selected.escalatedFrom && (
                <View style={[styles.escalationNotice, { backgroundColor: colors.danger + "0C", borderColor: colors.danger + "30" }]}>
                  <Feather name="trending-up" size={14} color={colors.danger} />
                  <Text style={[styles.escalationNoticeTxt, { color: colors.danger }]}>
                    {ps("escalationNotice", { id: selected.escalatedFrom.slice(-6).toUpperCase() })}
                  </Text>
                </View>
              )}

              {/* Title */}
              <Text style={[styles.detailTitle, { color: colors.foreground }]}>{selected.title}</Text>

              {/* Badge row */}
              <View style={styles.badgeRow}>
                <View style={[styles.chip, { backgroundColor: priCfg(selected.priority).color + "15" }]}>
                  <Feather name={priCfg(selected.priority).icon} size={11} color={priCfg(selected.priority).color} />
                  <Text style={[styles.chipTxt, { color: priCfg(selected.priority).color }]}>{ps(`pri_${selected.priority}`)}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: stCfg(selected.status).color + "15" }]}>
                  <Feather name={stCfg(selected.status).icon} size={11} color={stCfg(selected.status).color} />
                  <Text style={[styles.chipTxt, { color: stCfg(selected.status).color }]}>{PLATFORM_COPY[STATUS_COPY_KEYS[selected.status]][lang]}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: catCfg(selected.category).color + "15" }]}>
                  <Feather name={catCfg(selected.category).icon} size={11} color={catCfg(selected.category).color} />
                  <Text style={[styles.chipTxt, { color: catCfg(selected.category).color }]}>{ps(`cat_${catCfg(selected.category).key}`)}</Text>
                </View>
              </View>

              {/* Info grid */}
              <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: ps("submittedBy"), value: selected.submittedBy },
                  { label: PLATFORM_COPY.date[lang], value: fmtDate(selected.date, lang) },
                ].map((row, i) => (
                  <View key={row.label}>
                    {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLbl, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.infoVal, { color: colors.foreground }]}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Description */}
              <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.descLbl, { color: colors.foreground }]}>{ps("description")}</Text>
                <Text style={[styles.descTxt, { color: colors.mutedForeground }]}>{selected.description}</Text>
              </View>

              {/* ── Reply thread ── */}
              {repliesLoading ? (
                <LoadingState
                  title={STATE_COPY.loadingTitle[lang]}
                  description={STATE_COPY.loadingDescription[lang]}
                  accentColor="#5A4AD6"
                />
              ) : repliesError ? (
                <ErrorState
                  title={STATE_COPY.unavailableTitle[lang]}
                  description={STATE_COPY.detailUnavailableDescription[lang]}
                  retryLabel={STATE_COPY.retry[lang]}
                  onRetry={() => void fetchReplies()}
                  accentColor="#5A4AD6"
                />
              ) : replies.length > 0 && (
                <View style={{ gap: 10 }}>
                  <Text style={[styles.threadLbl, { color: colors.foreground }]}>
                    {ps("conversation", { n: replies.length })}
                  </Text>
                  {replies.map((rp) => {
                    const fromPlatform = rp.authorId !== selected.submittedById;
                    return (
                      <View
                        key={rp.id}
                        style={[
                          styles.bubble,
                          fromPlatform
                            ? [styles.bubblePlatform, { backgroundColor: "#5A4AD6" + "10", borderColor: "#5A4AD6" + "30" }]
                            : [styles.bubbleUser,     { backgroundColor: colors.card, borderColor: colors.border }],
                        ]}
                      >
                        <View style={styles.bubbleHdr}>
                          <Text style={[styles.bubbleAuthor, { color: fromPlatform ? "#5A4AD6" : colors.foreground }]}>
                            {rp.authorName}{fromPlatform ? ps("platformTeam") : ""}
                          </Text>
                          <Text style={[styles.bubbleDate, { color: colors.mutedForeground }]}>{fmtDate(rp.createdAt, lang)}</Text>
                        </View>
                        <Text style={[styles.bubbleTxt, { color: colors.foreground }]}>{rp.text}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── Reply input ── */}
              {selected.status !== "resolved" && selected.status !== "closed" && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.replyLbl, { color: colors.foreground }]}>
                    {isSuperAdmin ? ps("replyAdmin") : ps("replyUser")}
                  </Text>
                  <TextInput
                    style={[styles.replyInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    placeholder={isSuperAdmin ? ps("replyAdminPh") : ps("replyUserPh")}
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    numberOfLines={4}
                    value={replyText}
                    onChangeText={setReplyText}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, {
                      backgroundColor: replyText.trim() && !replying ? "#5A4AD6" : colors.muted,
                    }]}
                    disabled={!replyText.trim() || replying}
                    onPress={handleReply}
                  >
                    {replying
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Feather name="send" size={14} color={replyText.trim() ? "#fff" : colors.mutedForeground} />
                    }
                    <Text style={[styles.sendBtnTxt, { color: replyText.trim() && !replying ? "#fff" : colors.mutedForeground }]}>
                      {ps("send")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Resolved banner ── */}
              {(selected.status === "resolved" || selected.status === "closed") && (
                <View style={[styles.resolvedBanner, { backgroundColor: colors.success + "12", borderColor: colors.success + "30" }]}>
                  <Feather name="check-circle" size={18} color={colors.success} />
                  <Text style={[styles.resolvedTxt, { color: colors.success }]}>
                    {ps("resolvedBanner")}
                  </Text>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════
          NEW TICKET MODAL (syndicate_admin only)
      ═══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[styles.modal, { backgroundColor: colors.background }]}
          behavior="padding"
        >
          <View style={[styles.modalHdr, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{ps("newTitle")}</Text>
            <TouchableOpacity onPress={() => setShowNew(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Submitter info */}
            <View style={[styles.prefilledCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="user" size={14} color="#5A4AD6" />
              <Text style={[styles.prefilledTxt, { color: colors.foreground }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{ps("admin")}</Text>
                {user?.name}
              </Text>
            </View>

            {/* Category selector */}
            <View style={{ gap: 10 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{ps("requestType")}</Text>
              {CATEGORIES.map((c) => {
                const active = newCat === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.catCard, {
                      backgroundColor: active ? c.color + "15" : colors.card,
                      borderColor:     active ? c.color        : colors.border,
                    }]}
                    onPress={() => setNewCat(c.key)}
                  >
                    <View style={[styles.catCardIcon, { backgroundColor: active ? c.color : c.color + "15" }]}>
                      <Feather name={c.icon} size={18} color={active ? "#fff" : c.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catCardTitle, { color: active ? c.color : colors.foreground }]}>{ps(`cat_${c.key}`)}</Text>
                      <Text style={[styles.catCardDesc,  { color: colors.mutedForeground }]}>{ps(`catDesc_${c.key}`)}</Text>
                    </View>
                    {active && <Feather name="check-circle" size={18} color={c.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Priority */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{ps("criticality")}</Text>
              <View style={styles.chipRow}>
                {PRIORITIES.map((p) => {
                  const active = newPri === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.selectChip, {
                        flex:            1,
                        backgroundColor: active ? p.color : colors.card,
                        borderColor:     active ? p.color : colors.border,
                      }]}
                      onPress={() => setNewPri(p.key)}
                    >
                      <Feather name={p.icon} size={13} color={active ? "#fff" : p.color} />
                      <Text style={[styles.selectChipTxt, { color: active ? "#fff" : p.color }]}>{ps(`pri_${p.key}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Subject */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{ps("subject")}</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder={ps(`subjectPh_${newCat}`)}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLbl, { color: colors.foreground }]}>{ps("details")}</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder={
                  newCat === "bug" ? ps("detailsPhBug") : ps("detailsPh")
                }
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
              />
            </View>

            {/* Note */}
            <View style={[styles.noteBox, { backgroundColor: "#5A4AD6" + "0D", borderColor: "#5A4AD6" + "25" }]}>
              <Feather name="shield" size={14} color="#5A4AD6" />
              <Text style={[styles.noteTxt, { color: "#5A4AD6" }]}>
                {ps("note")}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, {
                backgroundColor: newTitle.trim() && newDesc.trim() && !submitting
                  ? "#5A4AD6" : colors.muted,
              }]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || !newDesc.trim() || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="send" size={16} color={newTitle.trim() && newDesc.trim() ? "#fff" : colors.mutedForeground} />
              }
              <Text style={[styles.submitBtnTxt, {
                color: newTitle.trim() && newDesc.trim() && !submitting ? "#fff" : colors.mutedForeground,
              }]}>
                {submitting ? ps("sending") : ps("submit")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Entry point with RoleGuard ───────────────────────────────────────────────

export default function PlatformSupportEntry() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <PlatformSupportScreen />
    </RoleGuard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  loadingTxt:      { fontSize: 13, fontFamily: "Inter_400Regular" },
  header:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn:         { padding: 4 },
  title:           { fontSize: 20, fontFamily: "Fraunces_600SemiBold" },
  subtitle:        { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  newBtn:          { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  level2Badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  level2BadgeTxt:  { fontSize: 10, fontFamily: "Inter_700Bold" },
  hierarchyBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1 },
  hierarchyStep:   { flexDirection: "row", alignItems: "center", gap: 4 },
  hierarchyTxt:    { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statsStrip:      { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1 },
  statItem:        { flex: 1, alignItems: "center", gap: 2 },
  statVal:         { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLbl:         { fontSize: 10, fontFamily: "Inter_400Regular" },
  statDiv:         { width: 1 },
  filterRow:       { flexDirection: "row", padding: 10, paddingHorizontal: 16, gap: 8, borderBottomWidth: 1 },
  filterBtn:       { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  filterLbl:       { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  shortcutCard:    { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  shortcutIcon:    { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  shortcutTitle:   { fontSize: 14, fontFamily: "Inter_700Bold" },
  shortcutSub:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty:           { alignItems: "center", gap: 12, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:       { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle:      { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub:        { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  card:            { borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 8 },
  escalatedBadge:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  escalatedTxt:    { fontSize: 10, fontFamily: "Inter_700Bold" },
  cardTop:         { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon:        { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle:       { fontSize: 13, fontFamily: "Inter_700Bold" },
  cardMeta:        { flexDirection: "row", alignItems: "center", gap: 4 },
  cardBy:          { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardCat:         { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dot:             { fontSize: 10 },
  cardRight:       { alignItems: "flex-end", gap: 5 },
  badge:           { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  badgeTxt:        { fontSize: 9, fontFamily: "Inter_700Bold" },
  cardDate:        { fontSize: 11, fontFamily: "Inter_400Regular", marginStart: 54 },
  // Detail modal
  modal:           { flex: 1 },
  modalHdr:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle:      { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", marginHorizontal: 8 },
  resolveBtn:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  resolveBtnTxt:   { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  escalationNotice:{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  escalationNoticeTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1, lineHeight: 17 },
  detailTitle:     { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24 },
  badgeRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:            { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  chipTxt:         { fontSize: 11, fontFamily: "Inter_700Bold" },
  infoBox:         { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sep:             { height: 1 },
  infoRow:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  infoLbl:         { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoVal:         { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  descBox:         { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  descLbl:         { fontSize: 13, fontFamily: "Inter_700Bold" },
  descTxt:         { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  threadLbl:       { fontSize: 13, fontFamily: "Inter_700Bold" },
  bubble:          { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  bubblePlatform:  {},
  bubbleUser:      {},
  bubbleHdr:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bubbleAuthor:    { fontSize: 12, fontFamily: "Inter_700Bold" },
  bubbleDate:      { fontSize: 10, fontFamily: "Inter_400Regular" },
  bubbleTxt:       { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  replyLbl:        { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyInput:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", minHeight: 100, textAlignVertical: "top" },
  sendBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  sendBtnTxt:      { fontSize: 14, fontFamily: "Inter_700Bold" },
  resolvedBanner:  { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  resolvedTxt:     { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  // New ticket modal
  prefilledCard:   { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  prefilledTxt:    { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  fieldLbl:        { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  textArea:        { minHeight: 110, textAlignVertical: "top" },
  chipRow:         { flexDirection: "row", gap: 8 },
  selectChip:      { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  selectChipTxt:   { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  catCard:         { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  catCardIcon:     { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catCardTitle:    { fontSize: 14, fontFamily: "Inter_700Bold" },
  catCardDesc:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  noteBox:         { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  noteTxt:         { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  submitBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitBtnTxt:    { fontSize: 15, fontFamily: "Inter_700Bold" },
});
