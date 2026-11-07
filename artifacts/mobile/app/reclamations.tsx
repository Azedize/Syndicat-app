import { Feather } from "@/components/ui/Feather";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Linking,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import type { ViewInstance, ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { captureAndUploadPhoto, pickAndUploadPhoto } from "@/lib/upload";
import { ticketedUrl } from "@/services/api";
import { claims, type ClaimCard, type ClaimDetail, type ClaimStatus } from "@/features/claims/api";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";
import EmptyState from "@/components/EmptyState";
import { SearchField, Skeleton, StatusBadge, type StatusTone } from "@/components/ui";
import { localeOf } from "@/hooks/useFormat";
import { RADIUS } from "@/constants/spacing";

/**
 * Claims & incidents. Residents report a problem and follow it; the team
 * works on a board whose columns are the workflow states. Every move is a
 * server operation: the board changes only once the server has saved it.
 */
type Lang = "fr" | "en" | "ar" | "es";
type L4 = Record<Lang, string>;
const S = {
  title: { fr: "Réclamations", en: "Claims", ar: "الشكايات", es: "Reclamaciones" },
  mine: { fr: "Mes réclamations", en: "My claims", ar: "شكاياتي", es: "Mis reclamaciones" },
  board: { fr: "Tableau", en: "Board", ar: "اللوحة", es: "Tablero" },
  list: { fr: "Liste", en: "List", ar: "القائمة", es: "Lista" },
  report: { fr: "Signaler un problème", en: "Report a problem", ar: "الإبلاغ عن مشكل", es: "Informar un problema" },
  empty: { fr: "Aucune réclamation.", en: "No claim.", ar: "لا توجد شكايات.", es: "Ninguna reclamación." },
  loadError: { fr: "Impossible de charger les réclamations.", en: "Could not load claims.", ar: "تعذر التحميل.", es: "No se pudo cargar." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  send: { fr: "Envoyer", en: "Send", ar: "إرسال", es: "Enviar" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  claimTitle: { fr: "Titre *", en: "Title *", ar: "العنوان *", es: "Título *" },
  description: { fr: "Description *", en: "Description *", ar: "الوصف *", es: "Descripción *" },
  location: { fr: "Où ? (ex. hall B, 2e étage) *", en: "Where? *", ar: "أين؟ *", es: "¿Dónde? *" },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  where: { fr: "Concerne", en: "Concerns", ar: "يتعلق بـ", es: "Afecta a" },
  common: { fr: "Parties communes", en: "Common areas", ar: "الأجزاء المشتركة", es: "Zonas comunes" },
  unit: { fr: "Mon lot", en: "My unit", ar: "وحدتي", es: "Mi unidad" },
  photos: { fr: "Photos", en: "Photos", ar: "صور", es: "Fotos" },
  takePhoto: { fr: "Prendre", en: "Camera", ar: "التقاط", es: "Cámara" },
  pickPhoto: { fr: "Galerie", en: "Gallery", ar: "المعرض", es: "Galería" },
  required: { fr: "Titre, description (10 caractères), lieu et lot sont obligatoires.", en: "Title, description, location required.", ar: "حقول إلزامية.", es: "Campos obligatorios." },
  saved: { fr: "Réclamation enregistrée", en: "Claim saved", ar: "تم التسجيل", es: "Guardada" },
  history: { fr: "Historique", en: "History", ar: "السجل", es: "Historial" },
  attachments: { fr: "Pièces jointes", en: "Attachments", ar: "المرفقات", es: "Adjuntos" },
  message: { fr: "Message", en: "Message", ar: "رسالة", es: "Mensaje" },
  internal: { fr: "Note interne (équipe)", en: "Internal note", ar: "ملاحظة داخلية", es: "Nota interna" },
  answer: { fr: "Répondre au syndic", en: "Answer", ar: "الرد", es: "Responder" },
  fixed: { fr: "Problème réglé", en: "Problem fixed", ar: "تم الحل", es: "Resuelto" },
  persists: { fr: "Le problème persiste", en: "Still a problem", ar: "المشكل مستمر", es: "Persiste" },
  reopenReason: { fr: "Qu'est-ce qui ne va pas ? *", en: "What is still wrong? *", ar: "ما المشكل؟ *", es: "¿Qué falla? *" },
  move: { fr: "Déplacer vers…", en: "Move to…", ar: "نقل إلى…", es: "Mover a…" },
  moving: { fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…", es: "Guardando…" },
  stale: { fr: "Quelqu'un a modifié cette réclamation : la carte a été rafraîchie.", en: "Someone changed this claim: refreshed.", ar: "تم التحديث.", es: "Actualizada." },
  gone: { fr: "Cette réclamation n'existe plus.", en: "This claim no longer exists.", ar: "غير موجودة.", es: "Ya no existe." },
  offline: { fr: "Non enregistré (connexion) : la carte reste à sa place. Réessayez.", en: "Not saved (network). Try again.", ar: "لم يحفظ.", es: "No guardado." },
  question: { fr: "Question au résident *", en: "Question *", ar: "سؤال *", es: "Pregunta *" },
  resolution: { fr: "Ce qui a été fait (10 caractères min.) *", en: "Resolution *", ar: "الحل *", es: "Resolución *" },
  reason: { fr: "Motif *", en: "Reason *", ar: "السبب *", es: "Motivo *" },
  assign: { fr: "Affecter", en: "Assign", ar: "تكليف", es: "Asignar" },
  responsible: { fr: "Responsable", en: "Responsible", ar: "المسؤول", es: "Responsable" },
  provider: { fr: "Prestataire", en: "Provider", ar: "المزود", es: "Proveedor" },
  instructions: { fr: "Consignes (interne)", en: "Instructions (internal)", ar: "تعليمات", es: "Instrucciones" },
  priority: { fr: "Priorité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  schedule: { fr: "Planifier l'intervention", en: "Schedule", ar: "برمجة التدخل", es: "Programar" },
  when: { fr: "Date et heure (AAAA-MM-JJ HH:MM) *", en: "Date and time *", ar: "التاريخ *", es: "Fecha *" },
  workOrder: { fr: "Créer le bon de travaux du prestataire", en: "Create work order", ar: "إنشاء أمر عمل", es: "Crear orden" },
  work: { fr: "Intervention réalisée", en: "Work done", ar: "التدخل المنجز", es: "Trabajo realizado" },
  materials: { fr: "Matériel / temps (interne)", en: "Materials (internal)", ar: "المعدات", es: "Material" },
  overdue: { fr: "En retard", en: "Overdue", ar: "متأخر", es: "Atrasado" },
  open: { fr: "Ouvertes", en: "Open", ar: "مفتوحة", es: "Abiertas" },
  unassigned: { fr: "Sans responsable", en: "Unassigned", ar: "بدون مسؤول", es: "Sin asignar" },
  avg: { fr: "Résolution moy.", en: "Avg. resolution", ar: "متوسط الحل", es: "Resolución media" },
  search: { fr: "Rechercher (réf., titre, lieu)", en: "Search", ar: "بحث", es: "Buscar" },
  due: { fr: "Échéance", en: "Due", ar: "الأجل", es: "Vence" },
  scheduled: { fr: "Intervention prévue", en: "Scheduled", ar: "تدخل مبرمج", es: "Programada" },
  dragHint: { fr: "Appui long sur une carte, puis glissez-la vers une colonne.", en: "Long-press a card, then drag it to a column.", ar: "اضغط مطولا على بطاقة ثم اسحبها.", es: "Mantenga pulsada una tarjeta y arrástrela." },
  file: { fr: "Fichier", en: "File", ar: "ملف", es: "Archivo" },
  internalShort: { fr: "interne", en: "internal", ar: "داخلي", es: "interno" },
  emptyHint: { fr: "Signalez un problème des parties communes ou de votre lot : vous suivrez ici chaque étape.", en: "Report a problem in the common areas or your unit: you will follow every step here.", ar: "أبلغ عن مشكل في الأجزاء المشتركة أو في وحدتك: ستتابع هنا كل مرحلة.", es: "Informe de un problema en zonas comunes o en su unidad: seguirá aquí cada etapa." },
  invalidMove: { fr: "Ce passage n'est pas possible pour cette réclamation.", en: "This move is not allowed for this claim.", ar: "هذا الانتقال غير ممكن.", es: "Movimiento no permitido." },
} as const;
type T = (k: keyof typeof S) => string;

const STATUS: Record<ClaimStatus, L4 & { color: string }> = {
  received: { fr: "Reçue", en: "Received", ar: "مستلمة", es: "Recibida", color: "#6A6680" },
  qualified: { fr: "Qualifiée", en: "Qualified", ar: "مؤهلة", es: "Calificada", color: "#5A4AD6" },
  assigned: { fr: "Assignée", en: "Assigned", ar: "مكلف بها", es: "Asignada", color: "#1F8A9A" },
  in_progress: { fr: "En cours", en: "In progress", ar: "قيد المعالجة", es: "En curso", color: "#C98511" },
  awaiting_info: { fr: "En attente d'info", en: "Awaiting info", ar: "في انتظار معلومات", es: "Esperando info", color: "#1F8A9A" },
  resolved: { fr: "Résolue", en: "Resolved", ar: "محلولة", es: "Resuelta", color: "#13976C" },
  closed: { fr: "Clôturée", en: "Closed", ar: "مغلقة", es: "Cerrada", color: "#6A6680" },
  rejected: { fr: "Non retenue", en: "Rejected", ar: "مرفوضة", es: "Rechazada", color: "#C8323C" },
};
const STATUS_TONE: Record<ClaimStatus, StatusTone> = {
  received: "neutral",
  qualified: "primary",
  assigned: "info",
  in_progress: "warning",
  awaiting_info: "primary",
  resolved: "success",
  closed: "neutral",
  rejected: "danger",
};
const PRIORITY_TONE: Record<string, StatusTone> = { urgent: "danger", high: "warning", normal: "neutral", low: "neutral" };
const CATEGORY: Record<string, L4> = {
  fuite_eau: { fr: "Fuite d'eau", en: "Water leak", ar: "تسرب مياه", es: "Fuga de agua" },
  ascenseur: { fr: "Ascenseur", en: "Lift", ar: "المصعد", es: "Ascensor" },
  eclairage: { fr: "Éclairage", en: "Lighting", ar: "الإنارة", es: "Iluminación" },
  electricite: { fr: "Électricité", en: "Electricity", ar: "الكهرباء", es: "Electricidad" },
  bruit: { fr: "Bruit", en: "Noise", ar: "الضجيج", es: "Ruido" },
  proprete: { fr: "Propreté", en: "Cleanliness", ar: "النظافة", es: "Limpieza" },
  securite: { fr: "Sécurité", en: "Security", ar: "الأمن", es: "Seguridad" },
  parties_communes: { fr: "Parties communes", en: "Common areas", ar: "الأجزاء المشتركة", es: "Zonas comunes" },
  stationnement: { fr: "Stationnement", en: "Parking", ar: "الموقف", es: "Aparcamiento" },
  autre: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
};
const PRIORITY: Record<string, L4 & { color: string }> = {
  urgent: { fr: "Urgente", en: "Urgent", ar: "عاجلة", es: "Urgente", color: "#C8323C" },
  high: { fr: "Haute", en: "High", ar: "مرتفعة", es: "Alta", color: "#C8642A" },
  normal: { fr: "Normale", en: "Normal", ar: "عادية", es: "Normal", color: "#6A6680" },
  low: { fr: "Basse", en: "Low", ar: "منخفضة", es: "Baja", color: "#A6A1BE" },
};
const EVENT: Record<string, L4> = {
  created: { fr: "Réclamation déposée", en: "Submitted", ar: "تم الإيداع", es: "Enviada" },
  status: { fr: "Statut", en: "Status", ar: "الحالة", es: "Estado" },
  comment: { fr: "Message", en: "Message", ar: "رسالة", es: "Mensaje" },
  assigned: { fr: "Affectation", en: "Assignment", ar: "تكليف", es: "Asignación" },
  priority: { fr: "Priorité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  info_requested: { fr: "Question du syndic", en: "Question", ar: "سؤال", es: "Pregunta" },
  info_provided: { fr: "Réponse du résident", en: "Answer", ar: "رد", es: "Respuesta" },
  scheduled: { fr: "Intervention planifiée", en: "Scheduled", ar: "تدخل مبرمج", es: "Programada" },
  work: { fr: "Intervention", en: "Work", ar: "تدخل", es: "Trabajo" },
  attachment: { fr: "Pièce jointe", en: "Attachment", ar: "مرفق", es: "Adjunto" },
  resolved: { fr: "Résolue", en: "Resolved", ar: "محلولة", es: "Resuelta" },
  closed: { fr: "Clôturée", en: "Closed", ar: "مغلقة", es: "Cerrada" },
  reopened: { fr: "Rouverte", en: "Reopened", ar: "أعيد فتحها", es: "Reabierta" },
  rejected: { fr: "Non retenue", en: "Rejected", ar: "مرفوضة", es: "Rechazada" },
  confirmed: { fr: "Confirmée par le résident", en: "Confirmed", ar: "مؤكدة", es: "Confirmada" },
};
const TEAM = ["syndicate_admin", "president", "secretary", "treasurer", "committee_member"];
const MANAGERS = ["syndicate_admin", "president", "secretary"];
const NEEDS_TEXT: Partial<Record<ClaimStatus, keyof typeof S>> = { awaiting_info: "question", resolved: "resolution", rejected: "reason" };
// Minimum length the API asks for each of these texts (claims.routes.ts).
const MIN_TEXT: Partial<Record<ClaimStatus, number>> = { awaiting_info: 5, resolved: 10, rejected: 5 };
const fmtDate = (s: string | null | undefined, lang: string) => (s ? new Date(s).toLocaleString(localeOf(lang), { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/** Turns a server error into the right reaction on the screen. */
function explain(e: any, tr: T): string {
  if (e?.code === "CLAIM_STALE") return tr("stale");
  if (e?.code === "CLAIM_NOT_FOUND") return tr("gone");
  if (!e?.status) return tr("offline");
  return e?.message ?? tr("error");
}

async function openFile(objectPath: string, tr: T) {
  try {
    await Linking.openURL(await ticketedUrl(`/storage${objectPath}`));
  } catch {
    Alert.alert(tr("error"), tr("error"));
  }
}

function Badge({ label, tone }: { label: string; tone: StatusTone }) {
  return <StatusBadge label={label} tone={tone} icon={null} />;
}

function Card({ c, lang, tr, onPress, onMove, onLongPress, busy, faded }: { c: ClaimCard; lang: Lang; tr: T; onPress: () => void; onMove?: () => void; onLongPress?: (e: GestureResponderEvent) => void; busy?: boolean; faded?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={busy}
      style={[styles.card, { backgroundColor: colors.card, borderColor: c.overdue ? colors.danger : colors.border, opacity: busy ? 0.55 : faded ? 0.3 : 1 }]}
      accessibilityRole="button"
    >
      <View style={styles.row}>
        <Text style={[styles.ref, { color: colors.mutedForeground }]}>{c.reference}</Text>
        <Badge label={PRIORITY[c.priority]?.[lang] ?? c.priority} tone={PRIORITY_TONE[c.priority] ?? "neutral"} />
        {c.overdue ? <Badge label={tr("overdue")} tone="danger" /> : null}
      </View>
      <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>{c.title}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
        {CATEGORY[c.category]?.[lang] ?? c.category} · {c.location}{c.lotNumber ? ` · ${c.lotNumber}` : ""}
      </Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        {fmtDate(c.createdAt, lang)}{c.assigneeName || c.providerName ? ` · ${c.assigneeName ?? c.providerName}` : ""}
      </Text>
      {onMove && c.allowedTransitions.length > 0 && (
        <TouchableOpacity onPress={onMove} disabled={busy} style={styles.moveBtn} accessibilityRole="button">
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="corner-down-right" size={14} color={colors.primary} />}
          <Text style={{ color: colors.tint, fontSize: 12 }}>{busy ? tr("moving") : tr("move")}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── New claim ────────────────────────────────────────────────────────────────

function NewClaimSheet({ visible, onClose, onCreated, tr, lang }: { visible: boolean; onClose: () => void; onCreated: (c: ClaimCard) => void; tr: T; lang: Lang }) {
  const colors = useColors();
  const blank = { title: "", description: "", location: "", category: "fuite_eau", scope: "common" as "common" | "unit", lotId: "" };
  const [f, setF] = useState(blank);
  const [photos, setPhotos] = useState<{ objectPath: string; fileName: string }[]>([]);
  const [lots, setLots] = useState<{ id: string; number: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // One key per form: a retried submission returns the claim already saved.
  const key = useRef(claims.newKey());
  useEffect(() => {
    if (!visible) return;
    setF(blank);
    setPhotos([]);
    setErr(null);
    key.current = claims.newKey();
    apiRequest<{ data: any[] }>("/lots?limit=50").then((r) => setLots((r.data ?? []).map((l) => ({ id: l.id, number: l.number })))).catch(() => setLots([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const addPhoto = async (camera: boolean) => {
    try {
      const up = camera ? await captureAndUploadPhoto() : await pickAndUploadPhoto();
      if (up) setPhotos((p) => [...p, { objectPath: up.objectPath, fileName: up.fileName }].slice(0, 6));
    } catch (e: any) {
      setErr(e?.message ?? tr("error"));
    }
  };
  const submit = async () => {
    if (f.title.trim().length < 3 || f.description.trim().length < 10 || f.location.trim().length < 2 || (f.scope === "unit" && !f.lotId)) return setErr(tr("required"));
    setBusy(true);
    setErr(null);
    try {
      const res = await claims.create(
        {
          title: f.title.trim(),
          description: f.description.trim(),
          location: f.location.trim(),
          category: f.category,
          scope: f.scope,
          lotId: f.scope === "unit" ? f.lotId : undefined,
          attachments: photos.map((p) => p.objectPath),
        },
        key.current,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(res.data); // the saved claim (reference from the server)
    } catch (e: any) {
      setErr(explain(e, tr));
    } finally {
      setBusy(false);
    }
  };
  const input = [formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }];
  return (
    <FormSheet visible={visible} title={tr("report")} onClose={onClose} closeLabel={tr("close")}>
      <FieldLabel label={tr("category")} />
      <ChoiceChips value={f.category} onChange={(v) => setF((p) => ({ ...p, category: v }))} options={Object.keys(CATEGORY).map((k) => ({ key: k, label: CATEGORY[k][lang] }))} />
      <FieldLabel label={tr("where")} />
      <ChoiceChips value={f.scope} onChange={(v) => setF((p) => ({ ...p, scope: v as "common" | "unit" }))} options={[{ key: "common", label: tr("common") }, ...(lots.length ? [{ key: "unit", label: tr("unit") }] : [])]} />
      {f.scope === "unit" && <ChoiceChips value={f.lotId} onChange={(v) => setF((p) => ({ ...p, lotId: v }))} options={lots.map((l) => ({ key: l.id, label: l.number }))} />}
      <FieldLabel label={tr("claimTitle")} />
      <TextInput value={f.title} onChangeText={(v) => setF((p) => ({ ...p, title: v }))} style={input} maxLength={160} />
      <FieldLabel label={tr("location")} />
      <TextInput value={f.location} onChangeText={(v) => setF((p) => ({ ...p, location: v }))} style={input} maxLength={200} />
      <FieldLabel label={tr("description")} />
      <TextInput value={f.description} onChangeText={(v) => setF((p) => ({ ...p, description: v }))} style={[...input, { minHeight: 90 }]} multiline maxLength={5000} />
      <FieldLabel label={`${tr("photos")} (${photos.length}/6)`} />
      <View style={styles.row}>
        <ActionButton label={tr("takePhoto")} icon="camera" color="#6A6680" onPress={() => addPhoto(true)} disabled={photos.length >= 6} />
        <ActionButton label={tr("pickPhoto")} icon="image" color="#6A6680" onPress={() => addPhoto(false)} disabled={photos.length >= 6} />
      </View>
      {photos.map((p) => (
        <Text key={p.objectPath} style={[styles.meta, { color: colors.foreground }]}>📎 {p.fileName}</Text>
      ))}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      <ActionButton label={tr("send")} icon="send" busy={busy} onPress={submit} />
    </FormSheet>
  );
}

// ─── Full record ──────────────────────────────────────────────────────────────

function ClaimSheet({ id, onClose, onChanged, tr, lang, role, userId, initialTarget }: { id: string | null; onClose: () => void; onChanged: () => void; tr: T; lang: Lang; role: string; userId?: string; initialTarget?: ClaimStatus | null }) {
  const colors = useColors();
  const [c, setC] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [assignees, setAssignees] = useState<{ people: { id: string; name: string }[]; providers: { id: string; name: string }[] } | null>(null);
  const [form, setForm] = useState({ assignee: "", provider: "", instructions: "", when: "", workOrder: false, work: "", materials: "", target: "" as ClaimStatus | "", targetText: "" });
  const keys = useRef<Record<string, string>>({});
  const keyFor = (action: string) => (keys.current[action] ??= claims.newKey());
  const isTeam = TEAM.includes(role);
  const isManager = MANAGERS.includes(role);
  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      setC((await claims.get(id)).data);
    } catch (e: any) {
      setErr(explain(e, tr));
    }
  }, [id, tr]);
  useEffect(() => {
    setC(null);
    setText("");
    setInternal(false);
    keys.current = {};
    // Dropped on a column that needs a question / resolution / reason: preselected here.
    setForm({ assignee: "", provider: "", instructions: "", when: "", workOrder: false, work: "", materials: "", target: initialTarget ?? "", targetText: "" });
    load();
    if (id && isManager) claims.assignees().then((r) => setAssignees(r.data)).catch(() => setAssignees(null));
  }, [id, load, isManager, initialTarget]);
  const act = async (action: string, fn: (key: string) => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn(keyFor(action));
      delete keys.current[action]; // done: the next identical action is a new one
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setText("");
      await load();
      onChanged();
    } catch (e: any) {
      Alert.alert(tr("error"), explain(e, tr));
      if (e?.status) {
        delete keys.current[action];
        await load(); // stale / refused: show the saved state
      }
    } finally {
      setBusy(false);
    }
  };
  const input = [formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }];
  if (!id) return null;
  const mine = c?.mine;
  return (
    <FormSheet visible={!!id} title={c ? `${c.reference} — ${c.title}` : tr("title")} onClose={onClose} closeLabel={tr("close")}>
      {err ? (
        <ErrorState title={err} description="" retryLabel={tr("retry")} onRetry={load} accentColor={colors.primary} />
      ) : !c ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={styles.row}>
            <Badge label={STATUS[c.status][lang]} tone={STATUS_TONE[c.status]} />
            <Badge label={PRIORITY[c.priority]?.[lang] ?? c.priority} tone={PRIORITY_TONE[c.priority] ?? "neutral"} />
            {c.overdue ? <Badge label={tr("overdue")} tone="danger" /> : null}
          </View>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {CATEGORY[c.category]?.[lang]} · {c.location}{c.lotNumber ? ` · ${c.lotNumber}` : ""} · {c.reporterName} · {fmtDate(c.createdAt, lang)}
          </Text>
          <Text style={{ color: colors.foreground }}>{c.description}</Text>
          {c.assigneeName || c.providerName ? <Text style={[styles.meta, { color: colors.foreground }]}>{tr("responsible")} : {[c.assigneeName, c.providerName].filter(Boolean).join(" · ")}</Text> : null}
          {c.scheduledFor ? <Text style={[styles.meta, { color: colors.foreground }]}>{tr("scheduled")} : {fmtDate(c.scheduledFor, lang)}</Text> : null}
          {isTeam ? <Text style={[styles.meta, { color: c.overdue ? colors.danger : colors.mutedForeground }]}>{tr("due")} : {fmtDate(c.dueAt, lang)}</Text> : null}
          {c.resolution ? <Text style={{ color: colors.success }}>✓ {c.resolution}</Text> : null}

          {c.attachments.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("attachments")}</Text>
              {c.attachments.map((a) => (
                <TouchableOpacity key={a.id} onPress={() => openFile(a.objectPath, tr)} style={styles.row}>
                  <Feather name={a.mimeType?.startsWith("image/") ? "image" : "file"} size={14} color={colors.primary} />
                  <Text style={{ color: colors.tint, fontSize: 13 }}>{a.fileName ?? tr("file")}{a.internal ? ` (${tr("internalShort")})` : ""}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Resident: answer, confirm, reopen */}
          {mine && !isTeam && c.status === "resolved" && (
            <View style={styles.row}>
              <ActionButton label={tr("fixed")} icon="check" color={colors.success} busy={busy} onPress={() => act("confirm", () => claims.confirm(c.id))} />
            </View>
          )}
          {mine && (c.status === "resolved" || c.status === "closed") && (
            <>
              <FieldLabel label={tr("reopenReason")} />
              <TextInput value={form.targetText} onChangeText={(v) => setForm((p) => ({ ...p, targetText: v }))} style={[...input, { minHeight: 60 }]} multiline />
              <ActionButton label={tr("persists")} icon="rotate-ccw" color={colors.warning} busy={busy} disabled={form.targetText.trim().length < 10} onPress={() => act("reopen", (k) => claims.reopen(c.id, form.targetText.trim(), k))} />
            </>
          )}

          {/* Messages (residents: public; team: internal possible) */}
          {c.status !== "closed" && c.status !== "rejected" && (
            <>
              <FieldLabel label={mine && c.status === "awaiting_info" ? tr("answer") : tr("message")} />
              <TextInput value={text} onChangeText={setText} style={[...input, { minHeight: 60 }]} multiline maxLength={4000} />
              {isTeam && (
                <TouchableOpacity onPress={() => setInternal((v) => !v)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: internal }}>
                  <Feather name={internal ? "check-square" : "square"} size={15} color={colors.primary} />
                  <Text style={{ color: colors.tint, fontSize: 12 }}>{tr("internal")}</Text>
                </TouchableOpacity>
              )}
              <ActionButton label={tr("send")} icon="send" busy={busy} disabled={!text.trim()} onPress={() => act("comment", (k) => claims.comment(c.id, { text: text.trim(), internal }, k))} />
            </>
          )}

          {/* Team: status, assignment, priority, schedule, work */}
          {c.allowedTransitions.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("move")}</Text>
              <ChoiceChips value={form.target} onChange={(v) => setForm((p) => ({ ...p, target: v as ClaimStatus, targetText: "" }))} options={c.allowedTransitions.map((s) => ({ key: s, label: STATUS[s][lang] }))} />
              {form.target && c.allowedTransitions.includes(form.target) && NEEDS_TEXT[form.target] ? (
                <TextInput placeholder={tr(NEEDS_TEXT[form.target]!)} placeholderTextColor={colors.mutedForeground} value={form.targetText} onChangeText={(v) => setForm((p) => ({ ...p, targetText: v }))} style={[...input, { minHeight: 60 }]} multiline />
              ) : null}
              {/* Once the claim has moved, the previous choice is no longer a possible step. */}
              {form.target && c.allowedTransitions.includes(form.target) ? (
                <ActionButton
                  label={`→ ${STATUS[form.target][lang]}`}
                  busy={busy}
                  disabled={form.targetText.trim().length < (MIN_TEXT[form.target] ?? 0)}
                  onPress={() => {
                    const t = form.target as ClaimStatus;
                    const extra = t === "awaiting_info" ? { question: form.targetText } : t === "resolved" ? { resolution: form.targetText } : t === "rejected" ? { reason: form.targetText } : {};
                    act(`move-${t}`, (k) => claims.transition(c.id, { to: t, expectedVersion: c.version, ...extra }, k));
                  }}
                />
              ) : null}
            </>
          )}
          {isManager && ["received", "qualified", "assigned", "in_progress", "awaiting_info"].includes(c.status) && (
            <>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("assign")}</Text>
              <FieldLabel label={tr("responsible")} />
              <ChoiceChips value={form.assignee} onChange={(v) => setForm((p) => ({ ...p, assignee: p.assignee === v ? "" : v }))} options={(assignees?.people ?? []).map((p) => ({ key: p.id, label: p.name }))} />
              <FieldLabel label={tr("provider")} />
              <ChoiceChips value={form.provider} onChange={(v) => setForm((p) => ({ ...p, provider: p.provider === v ? "" : v }))} options={(assignees?.providers ?? []).map((p) => ({ key: p.id, label: p.name }))} />
              <TextInput placeholder={tr("instructions")} placeholderTextColor={colors.mutedForeground} value={form.instructions} onChangeText={(v) => setForm((p) => ({ ...p, instructions: v }))} style={input} />
              <ActionButton
                label={tr("assign")}
                icon="user-check"
                busy={busy}
                disabled={!form.assignee && !form.provider}
                onPress={() => act("assign", (k) => claims.assign(c.id, { expectedVersion: c.version, assigneeUserId: form.assignee || null, prestataireId: form.provider || null, instructions: form.instructions || undefined }, k))}
              />
              <FieldLabel label={tr("priority")} />
              <ChoiceChips value={c.priority} onChange={(v) => act("priority", () => claims.priority(c.id, v, c.version))} options={Object.keys(PRIORITY).map((k) => ({ key: k, label: PRIORITY[k][lang] }))} />
            </>
          )}
          {(isManager || c.assigneeUserId === userId) && ["assigned", "in_progress"].includes(c.status) && (
            <>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("schedule")}</Text>
              <TextInput placeholder={tr("when")} placeholderTextColor={colors.mutedForeground} value={form.when} onChangeText={(v) => setForm((p) => ({ ...p, when: v }))} style={input} />
              {c.prestataireId ? (
                <TouchableOpacity onPress={() => setForm((p) => ({ ...p, workOrder: !p.workOrder }))} style={styles.row}>
                  <Feather name={form.workOrder ? "check-square" : "square"} size={15} color={colors.primary} />
                  <Text style={{ color: colors.tint, fontSize: 12 }}>{tr("workOrder")}</Text>
                </TouchableOpacity>
              ) : null}
              <ActionButton
                label={tr("schedule")}
                icon="calendar"
                busy={busy}
                disabled={!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(form.when.trim())}
                onPress={() => {
                  const d = new Date(form.when.trim().replace(" ", "T"));
                  act("schedule", (k) => claims.schedule(c.id, { expectedVersion: c.version, scheduledFor: d.toISOString(), instructions: form.instructions || undefined, createWorkOrder: form.workOrder }, k));
                }}
              />
              <FieldLabel label={tr("work")} />
              <TextInput value={form.work} onChangeText={(v) => setForm((p) => ({ ...p, work: v }))} style={[...input, { minHeight: 60 }]} multiline />
              <TextInput placeholder={tr("materials")} placeholderTextColor={colors.mutedForeground} value={form.materials} onChangeText={(v) => setForm((p) => ({ ...p, materials: v }))} style={input} />
              <ActionButton label={tr("save")} icon="tool" busy={busy} disabled={form.work.trim().length < 5} onPress={() => act("work", (k) => claims.work(c.id, { description: form.work.trim(), materials: form.materials || undefined }, k))} />
            </>
          )}

          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("history")}</Text>
          {c.events.map((e) => (
            <View key={e.id} style={[styles.event, { borderLeftColor: e.internal ? "#1F8A9A" : colors.border }]}>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {fmtDate(e.createdAt, lang)} · {e.authorName ?? ""} · {EVENT[e.type]?.[lang] ?? e.type}
                {e.toStatus ? ` → ${STATUS[e.toStatus as ClaimStatus]?.[lang] ?? e.toStatus}` : ""}
                {e.internal ? ` · ${tr("internalShort")}` : ""}
              </Text>
              {e.body ? <Text style={{ color: colors.foreground, fontSize: 13 }}>{e.body}</Text> : null}
            </View>
          ))}
        </>
      )}
    </FormSheet>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ReclamationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const L = (["fr", "en", "ar", "es"].includes(lang) ? lang : "fr") as Lang;
  const tr: T = useCallback((k) => S[k][L] ?? S[k].fr, [L]);
  const { user } = useAuth();
  const role = user?.role ?? "member";
  const isTeam = TEAM.includes(role);
  const [mode, setMode] = useState<"board" | "list">(isTeam ? "board" : "list");
  const [q, setQ] = useState("");
  const [columns, setColumns] = useState<{ status: ClaimStatus; total: number; overdue: number; cards: ClaimCard[] }[]>([]);
  const [rows, setRows] = useState<ClaimCard[]>([]);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof claims.metrics>>["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [moveCard, setMoveCard] = useState<ClaimCard | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<ClaimStatus | null>(null);
  const moveKeys = useRef<Record<string, string>>({});

  // ── Drag and drop ──────────────────────────────────────────────────────────
  // A long press lifts the card; the root view then follows the finger. The
  // column under the finger comes from the columns' layout and the board's
  // horizontal scroll (auto-scrolled near the edges). Dropping calls the same
  // server operation as "Move to…": nothing moves before the server agrees.
  const { width: screenW } = useWindowDimensions();
  const screenWRef = useRef(screenW);
  screenWRef.current = screenW;
  const [drag, setDrag] = useState<ClaimCard | null>(null);
  const [hover, setHover] = useState<ClaimStatus | null>(null);
  const dragRef = useRef<ClaimCard | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const boardRef = useRef<ViewInstance>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const boardLeft = useRef(0);
  const scrollX = useRef(0);
  const columnBox = useRef<Partial<Record<ClaimStatus, { x: number; width: number }>>>({});
  const CARD_W = 260;
  const statusAt = (pageX: number): ClaimStatus | null => {
    const contentX = pageX - boardLeft.current + scrollX.current;
    for (const [st, box] of Object.entries(columnBox.current)) {
      if (box && contentX >= box.x && contentX <= box.x + box.width) return st as ClaimStatus;
    }
    return null;
  };
  const startDrag = (c: ClaimCard, e: GestureResponderEvent) => {
    if (pending || c.allowedTransitions.length === 0) return;
    const { pageX, pageY } = e.nativeEvent;
    boardRef.current?.measureInWindow((x) => (boardLeft.current = x));
    dragRef.current = c;
    setDrag(c);
    setHover(c.status);
    pan.setValue({ x: pageX - CARD_W / 2, y: pageY - 40 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setHover(null);
  };
  // Kept in a ref: the responder is created once and must call the latest version.
  const dropRef = useRef<(c: ClaimCard, pageX: number, moved: boolean) => void>(() => {});
  dropRef.current = (c, pageX, moved) => {
    endDrag();
    if (!moved) return setMoveCard(c); // long press without moving: list of moves
    const target = statusAt(pageX);
    if (!target || target === c.status) return;
    if (!c.allowedTransitions.includes(target)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(`${STATUS[c.status][L]} → ${STATUS[target][L]}`, tr("invalidMove"));
      return;
    }
    move(c, target);
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !!dragRef.current,
      onMoveShouldSetPanResponderCapture: () => !!dragRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (!dragRef.current) return;
        pan.setValue({ x: g.moveX - CARD_W / 2, y: g.moveY - 40 });
        if (g.moveX > screenWRef.current - 48) scrollRef.current?.scrollTo({ x: scrollX.current + 24, animated: false });
        else if (g.moveX < 48) scrollRef.current?.scrollTo({ x: Math.max(0, scrollX.current - 24), animated: false });
        const st = statusAt(g.moveX);
        setHover((h) => (h === st ? h : st));
      },
      onPanResponderRelease: (_e, g) => {
        const c = dragRef.current;
        if (c) dropRef.current(c, g.moveX, Math.abs(g.dx) + Math.abs(g.dy) > 8);
      },
      onPanResponderTerminate: () => endDrag(),
    }),
  ).current;

  const load = useCallback(async () => {
    setError(false);
    try {
      if (isTeam && mode === "board") {
        const [b, m] = await Promise.all([claims.board({ q: q.trim() || undefined }), claims.metrics()]);
        setColumns(b.data.columns);
        setMetrics(m.data);
      } else {
        setRows((await claims.list({ q: q.trim() || undefined, limit: "100" })).data);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isTeam, mode, q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  /**
   * Board move: the card stays where it is (greyed) until the server answers;
   * then the board is reloaded from the database. A failure leaves the card
   * in place, explains why, and — for a stale card — shows the saved state.
   */
  const move = async (c: ClaimCard, to: ClaimStatus) => {
    if (NEEDS_TEXT[to]) {
      setMoveCard(null);
      setOpenTarget(to);
      setOpenId(c.id); // needs a question / resolution / reason: done in the record
      return;
    }
    setMoveCard(null);
    setPending(c.id);
    const k = `${c.id}:${to}:${c.version}`;
    moveKeys.current[k] ??= claims.newKey(); // same key if the move is retried
    try {
      await claims.transition(c.id, { to, expectedVersion: c.version }, moveKeys.current[k]);
      delete moveKeys.current[k];
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(tr("error"), explain(e, tr));
      if (e?.status) delete moveKeys.current[k];
    } finally {
      setPending(null);
      await load();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} {...responder.panHandlers}>
      <ScreenHeader title={tr("title")} action={{ icon: "plus", onPress: () => setCreating(true), label: tr("report") }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
        {isTeam && <ChoiceChips value={mode} onChange={(v) => { setMode(v as "board" | "list"); setLoading(true); }} options={[{ key: "board", label: tr("board") }, { key: "list", label: tr("list") }]} />}
        <SearchField value={q} onChangeText={setQ} placeholder={tr("search")} />
        {isTeam && mode === "board" && metrics && (
          <View style={styles.row}>
            <Badge label={`${tr("open")} ${metrics.open}`} tone="info" />
            <Badge label={`${tr("overdue")} ${metrics.overdue}`} tone="danger" />
            <Badge label={`${tr("unassigned")} ${metrics.unassigned}`} tone="warning" />
            {metrics.avg_resolution_hours !== null ? <Badge label={`${tr("avg")} ${metrics.avg_resolution_hours} h`} tone="success" /> : null}
          </View>
        )}
        {isTeam && mode === "board" ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{tr("dragHint")}</Text> : null}
      </View>
      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} radius={RADIUS.MD} />
          ))}
        </View>
      ) : error ? (
        <ErrorState title={tr("loadError")} description="" retryLabel={tr("retry")} onRetry={() => { setLoading(true); load(); }} accentColor={colors.primary} />
      ) : isTeam && mode === "board" ? (
        <View ref={boardRef} style={{ flex: 1 }} collapsable={false}>
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={!drag}
          scrollEventThrottle={16}
          onScroll={(e) => (scrollX.current = e.nativeEvent.contentOffset.x)}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {columns.map((col) => {
            const allowed = !!drag && drag.allowedTransitions.includes(col.status);
            const isHover = !!drag && hover === col.status && col.status !== drag.status;
            return (
            <View
              key={col.status}
              onLayout={(e) => (columnBox.current[col.status] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })}
              style={[
                styles.column,
                { backgroundColor: isHover && allowed ? STATUS[col.status].color + "22" : colors.secondary },
                drag && col.status !== drag.status ? { borderWidth: 2, borderColor: allowed ? STATUS[col.status].color : "transparent", opacity: allowed ? 1 : 0.45 } : null,
              ]}
            >
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: STATUS[col.status].color }]} />
                <Text style={[styles.colTitle, { color: colors.foreground }]}>{STATUS[col.status][L]}</Text>
                <Text style={{ color: colors.mutedForeground }}>{col.total}</Text>
                {col.overdue ? <Badge label={`${col.overdue} ${tr("overdue").toLowerCase()}`} tone="danger" /> : null}
              </View>
              <ScrollView style={{ maxHeight: 520 }} scrollEnabled={!drag} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
                {col.cards.map((c) => (
                  <Card
                    key={c.id}
                    c={c}
                    lang={L}
                    tr={tr}
                    busy={pending === c.id}
                    faded={drag?.id === c.id}
                    onPress={() => {
                      setOpenTarget(null);
                      setOpenId(c.id);
                    }}
                    onMove={() => setMoveCard(c)}
                    onLongPress={(e) => startDrag(c, e)}
                  />
                ))}
                {col.total > col.cards.length ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>+{col.total - col.cards.length}</Text> : null}
              </ScrollView>
            </View>
            );
          })}
        </ScrollView>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<EmptyState icon="inbox" title={tr("empty")} description={tr("emptyHint")} actionLabel={tr("report")} onAction={() => setCreating(true)} />}
          renderItem={({ item }) => (
            <View>
              <Card c={item} lang={L} tr={tr} onPress={() => setOpenId(item.id)} />
              <View style={[styles.statusLine]}>
                <Badge label={STATUS[item.status][L]} tone={STATUS_TONE[item.status]} />
              </View>
            </View>
          )}
        />
      )}
      <FormSheet visible={!!moveCard} title={moveCard ? `${moveCard.reference} — ${tr("move")}` : ""} onClose={() => setMoveCard(null)} closeLabel={tr("close")}>
        {moveCard?.allowedTransitions.map((s) => (
          <ActionButton key={s} label={STATUS[s][L]} color={STATUS[s].color} onPress={() => move(moveCard, s)} />
        ))}
      </FormSheet>
      <NewClaimSheet
        visible={creating}
        tr={tr}
        lang={L}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          load();
          setOpenId(c.id); // open the claim the server saved
        }}
      />
      {drag ? (
        // The lifted card follows the finger (never touchable itself).
        <Animated.View pointerEvents="none" style={[styles.ghost, { width: CARD_W, transform: pan.getTranslateTransform() }]}>
          <Card c={drag} lang={L} tr={tr} onPress={() => {}} />
        </Animated.View>
      ) : null}
      <ClaimSheet
        id={openId}
        tr={tr}
        lang={L}
        role={role}
        userId={user?.id}
        initialTarget={openTarget}
        onClose={() => {
          setOpenId(null);
          setOpenTarget(null);
        }}
        onChanged={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  card: { borderWidth: 1, borderRadius: RADIUS.LG, padding: 14, gap: 4 },
  ref: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  moveBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  column: { width: 280, borderRadius: 14, padding: 10 },
  colTitle: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", marginTop: 10 },
  event: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 2, gap: 2 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  statusLine: { position: "absolute", end: 12, bottom: 12 },
  ghost: { position: "absolute", left: 0, top: 0, elevation: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
});
