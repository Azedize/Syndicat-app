import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { LibraryUploadError, pickLibraryFile, sendLibraryFile, type PickedFile } from "@/lib/upload";
import { library, type DocVisibility, type LibraryDocument } from "@/services/api";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";

/**
 * Document library of the condominium. Everyone sees only the documents of
 * their audience (the server filters); the team adds, replaces, archives.
 * Files are opened through a 5-minute link issued for this person.
 */
type Lang = "fr" | "en" | "ar" | "es";
type T = (k: keyof typeof S) => string;
const S = {
  title: { fr: "Bibliothèque", en: "Library", ar: "المكتبة", es: "Biblioteca" },
  search: { fr: "Rechercher un document", en: "Search documents", ar: "بحث", es: "Buscar" },
  all: { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  empty: { fr: "Aucun document.", en: "No document.", ar: "لا توجد وثائق.", es: "Ningún documento." },
  loadError: { fr: "Impossible de charger la bibliothèque.", en: "Could not load the library.", ar: "تعذر التحميل.", es: "No se pudo cargar." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  more: { fr: "Afficher plus", en: "Show more", ar: "المزيد", es: "Ver más" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  add: { fr: "Ajouter un document", en: "Add a document", ar: "إضافة وثيقة", es: "Añadir documento" },
  pick: { fr: "Choisir le fichier *", en: "Choose the file *", ar: "اختيار الملف *", es: "Elegir archivo *" },
  docTitle: { fr: "Titre *", en: "Title *", ar: "العنوان *", es: "Título *" },
  description: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  audience: { fr: "Qui peut le voir ?", en: "Who can see it?", ar: "من يمكنه رؤيتها؟", es: "¿Quién puede verlo?" },
  lot: { fr: "Lot concerné *", en: "Unit *", ar: "الوحدة *", es: "Unidad *" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  saved: { fr: "Document enregistré", en: "Document saved", ar: "تم الحفظ", es: "Guardado" },
  sending: { fr: "Envoi en cours…", en: "Uploading…", ar: "جارٍ الإرسال…", es: "Enviando…" },
  required: { fr: "Fichier, titre et lot (si « lot ») sont obligatoires.", en: "File, title and unit are required.", ar: "الملف والعنوان إلزاميان.", es: "Archivo y título obligatorios." },
  replace: { fr: "Remplacer le fichier", en: "Replace the file", ar: "استبدال الملف", es: "Reemplazar" },
  reason: { fr: "Motif *", en: "Reason *", ar: "السبب *", es: "Motivo *" },
  versions: { fr: "Versions", en: "Versions", ar: "الإصدارات", es: "Versiones" },
  current: { fr: "actuelle", en: "current", ar: "الحالية", es: "actual" },
  archive: { fr: "Archiver", en: "Archive", ar: "أرشفة", es: "Archivar" },
  unarchive: { fr: "Désarchiver", en: "Unarchive", ar: "إلغاء الأرشفة", es: "Desarchivar" },
  showArchived: { fr: "Inclure les archives", en: "Include archived", ar: "مع الأرشيف", es: "Incluir archivados" },
  open: { fr: "Ouvrir", en: "Open", ar: "فتح", es: "Abrir" },
  noFile: { fr: "Ce document n'a pas de fichier.", en: "This document has no file.", ar: "لا يوجد ملف.", es: "Sin archivo." },
  duplicate: { fr: "Ce fichier est déjà dans la bibliothèque.", en: "This file is already in the library.", ar: "الملف موجود.", es: "Ya existe." },
  sort_recent: { fr: "Récents", en: "Recent", ar: "الأحدث", es: "Recientes" },
  sort_title: { fr: "A → Z", en: "A → Z", ar: "أ ← ي", es: "A → Z" },
  sort_largest: { fr: "Taille", en: "Size", ar: "الحجم", es: "Tamaño" },
  v_syndic: { fr: "Syndic uniquement", en: "Manager only", ar: "السنديك فقط", es: "Solo administrador" },
  v_council: { fr: "Conseil syndical", en: "Council", ar: "المجلس", es: "Consejo" },
  v_owners: { fr: "Copropriétaires", en: "Co-owners", ar: "الملاك", es: "Propietarios" },
  v_residents: { fr: "Tous les résidents", en: "All residents", ar: "كل السكان", es: "Todos los residentes" },
  v_unit: { fr: "Un lot", en: "One unit", ar: "وحدة واحدة", es: "Una unidad" },
  v_personal: { fr: "Personnel", en: "Personal", ar: "شخصي", es: "Personal" },
  archived: { fr: "Archivé", en: "Archived", ar: "مؤرشف", es: "Archivado" },
  draft: { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
} as const;

const CATEGORIES: Record<string, Record<Lang, string>> = {
  administratif: { fr: "Administratif", en: "Administrative", ar: "إداري", es: "Administrativo" },
  proces_verbal: { fr: "Procès-verbaux", en: "Minutes", ar: "محاضر", es: "Actas" },
  financier: { fr: "Financier", en: "Financial", ar: "مالي", es: "Financiero" },
  contrat: { fr: "Contrats", en: "Contracts", ar: "عقود", es: "Contratos" },
  maintenance: { fr: "Maintenance", en: "Maintenance", ar: "صيانة", es: "Mantenimiento" },
  reglement: { fr: "Règlements", en: "Regulations", ar: "أنظمة", es: "Reglamentos" },
  avis: { fr: "Avis aux résidents", en: "Notices", ar: "إشعارات", es: "Avisos" },
  assurance: { fr: "Assurance", en: "Insurance", ar: "تأمين", es: "Seguro" },
  juridique: { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Jurídico" },
  technique: { fr: "Technique", en: "Technical", ar: "تقني", es: "Técnico" },
  autre: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
};
const UPLOAD_AUDIENCES: DocVisibility[] = ["residents", "owners", "council", "syndic", "unit"];
const TEAM = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"];
const MANAGERS = ["syndicate_admin", "president", "secretary"];

const humanSize = (n: number | null) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

/** Opens a document through a fresh personal link (PDF in-app, other files in the system viewer). */
async function openDocument(doc: { id: string; title: string }, tr: T, versionId?: string) {
  try {
    const link = await library.link(doc.id, versionId);
    if (!link.mimeType || link.mimeType === "application/pdf") {
      router.push({ pathname: "/pdf-viewer", params: { url: link.url, title: doc.title, docId: doc.id } });
    } else {
      await Linking.openURL(link.url);
    }
  } catch (e: any) {
    Alert.alert(tr("error"), e?.code === "NO_FILE" ? tr("noFile") : e?.message ?? tr("error"));
  }
}

function UploadSheet({ visible, onClose, onDone, tr, lang, isTreasurer }: { visible: boolean; onClose: () => void; onDone: () => void; tr: T; lang: Lang; isTreasurer: boolean }) {
  const colors = useColors();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [f, setF] = useState({ title: "", description: "", category: isTreasurer ? "financier" : "administratif", visibility: "residents" as DocVisibility, lotId: "" });
  const [lots, setLots] = useState<{ id: string; number: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setErr(null);
    setF({ title: "", description: "", category: isTreasurer ? "financier" : "administratif", visibility: isTreasurer ? "council" : "residents", lotId: "" });
  }, [visible, isTreasurer]);
  useEffect(() => {
    if (visible && f.visibility === "unit" && lots.length === 0) {
      apiRequest<{ data: any[] }>("/lots?limit=200").then((r) => setLots((r.data ?? []).map((l) => ({ id: l.id, number: l.number })))).catch(() => {});
    }
  }, [visible, f.visibility, lots.length]);
  const choose = async () => {
    try {
      const picked = await pickLibraryFile();
      if (picked) {
        setFile(picked);
        if (!f.title) setF((p) => ({ ...p, title: picked.name.replace(/\.[^.]+$/, "") }));
      }
    } catch (e: any) {
      setErr(e?.message ?? tr("error"));
    }
  };
  const submit = async (allowDuplicate = false) => {
    if (!file || f.title.trim().length < 2 || (f.visibility === "unit" && !f.lotId)) return setErr(tr("required"));
    setBusy(true);
    setErr(null);
    try {
      await sendLibraryFile("/documents/upload", file, {
        title: f.title.trim(),
        description: f.description.trim() || undefined,
        category: f.category,
        visibility: f.visibility,
        lotId: f.visibility === "unit" ? f.lotId : undefined,
        allowDuplicate: allowDuplicate ? "true" : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      if (e instanceof LibraryUploadError && e.code === "DOCUMENT_DUPLICATE") {
        Alert.alert(tr("duplicate"), e.message, [
          { text: tr("close"), style: "cancel" },
          { text: tr("save"), onPress: () => submit(true) },
        ]);
      } else {
        setErr(e?.message ?? tr("error"));
      }
    } finally {
      setBusy(false);
    }
  };
  const input = [formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }];
  return (
    <FormSheet visible={visible} title={tr("add")} onClose={onClose} closeLabel={tr("close")}>
      <TouchableOpacity onPress={choose} style={[styles.pick, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="button">
        <Feather name={file ? "check-circle" : "paperclip"} size={16} color={file ? "#10b981" : colors.primary} />
        <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>{file ? `${file.name} ${humanSize(file.size)}` : tr("pick")}</Text>
      </TouchableOpacity>
      <FieldLabel label={tr("docTitle")} />
      <TextInput value={f.title} onChangeText={(v) => setF((p) => ({ ...p, title: v }))} style={input} maxLength={200} />
      <FieldLabel label={tr("description")} />
      <TextInput value={f.description} onChangeText={(v) => setF((p) => ({ ...p, description: v }))} style={[...input, { minHeight: 60 }]} multiline maxLength={2000} />
      <FieldLabel label={tr("category")} />
      <ChoiceChips
        value={f.category}
        onChange={(v) => setF((p) => ({ ...p, category: v }))}
        options={(isTreasurer ? ["financier"] : Object.keys(CATEGORIES)).map((k) => ({ key: k, label: CATEGORIES[k][lang] }))}
      />
      <FieldLabel label={tr("audience")} />
      <ChoiceChips value={f.visibility} onChange={(v) => setF((p) => ({ ...p, visibility: v as DocVisibility }))} options={UPLOAD_AUDIENCES.map((k) => ({ key: k, label: tr(`v_${k}` as keyof typeof S) }))} />
      {f.visibility === "unit" && (
        <>
          <FieldLabel label={tr("lot")} />
          <ChoiceChips value={f.lotId} onChange={(v) => setF((p) => ({ ...p, lotId: v }))} options={lots.map((l) => ({ key: l.id, label: l.number }))} />
        </>
      )}
      {err ? <Text style={{ color: "#ef4444" }}>{err}</Text> : null}
      <ActionButton label={busy ? tr("sending") : tr("save")} icon="upload" busy={busy} onPress={() => submit(false)} />
    </FormSheet>
  );
}

function DocumentSheet({ doc, onClose, onChanged, tr, lang, role }: { doc: LibraryDocument | null; onClose: () => void; onChanged: () => void; tr: T; lang: Lang; role: string }) {
  const colors = useColors();
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof library.versions>>["data"] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isTeam = TEAM.includes(role);
  const isManager = MANAGERS.includes(role);
  useEffect(() => {
    setReason("");
    setVersions(null);
    if (doc && isTeam) library.versions(doc.id).then((r) => setVersions(r.data)).catch(() => setVersions([]));
  }, [doc, isTeam]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onChanged();
    } catch (e: any) {
      Alert.alert(tr("error"), e?.message ?? tr("error"));
    } finally {
      setBusy(false);
    }
  };
  if (!doc) return null;
  return (
    <FormSheet visible={!!doc} title={doc.title} onClose={onClose} closeLabel={tr("close")}>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        {CATEGORIES[doc.category]?.[lang] ?? doc.category} · {tr(`v_${doc.visibility}` as keyof typeof S)}
        {doc.fileName ? ` · ${doc.fileName}` : ""} {humanSize(doc.sizeBytes)}
        {doc.version && doc.version > 1 ? ` · v${doc.version}` : ""}
      </Text>
      {doc.description ? <Text style={{ color: colors.foreground }}>{doc.description}</Text> : null}
      <ActionButton label={tr("open")} icon="eye" onPress={() => openDocument(doc, tr)} disabled={!doc.hasFile} />
      {isManager && doc.source === "upload" && doc.status !== "archived" && (
        <>
          <FieldLabel label={tr("reason")} />
          <TextInput value={reason} onChangeText={setReason} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} />
          <ActionButton
            label={tr("replace")}
            icon="refresh-cw"
            busy={busy}
            disabled={reason.trim().length < 3}
            onPress={async () => {
              const picked = await pickLibraryFile().catch(() => undefined);
              if (picked) act(() => sendLibraryFile(`/documents/${doc.id}/file`, picked, { changeReason: reason.trim() }));
            }}
          />
          <ActionButton label={tr("archive")} icon="archive" color="#64748b" busy={busy} disabled={reason.trim().length < 3} onPress={() => act(() => library.archive(doc.id, reason.trim()))} />
        </>
      )}
      {isManager && doc.status === "archived" && <ActionButton label={tr("unarchive")} icon="rotate-ccw" color="#64748b" busy={busy} onPress={() => act(() => library.unarchive(doc.id))} />}
      {isTeam && (
        <>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("versions")}</Text>
          {!versions ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={[styles.meta, { color: colors.foreground }]}>v{doc.version ?? 1} ({tr("current")})</Text>
              {versions.map((v) => (
                <TouchableOpacity key={v.id} disabled={!v.hasFile} onPress={() => openDocument(doc, tr, v.id)} style={styles.row} accessibilityRole="button">
                  <Feather name="clock" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.meta, { color: v.hasFile ? colors.primary : colors.mutedForeground, flex: 1 }]}>
                    v{v.versionNumber} · {String(v.modifiedAt).slice(0, 10)} · {v.modifiedByName ?? ""} {v.changeReason ? `— ${v.changeReason}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </>
      )}
    </FormSheet>
  );
}

export default function BibliothequeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const L = (["fr", "en", "ar", "es"].includes(lang) ? lang : "fr") as Lang;
  const tr: T = useCallback((k) => S[k][L] ?? S[k].fr, [L]);
  const { user } = useAuth();
  const role = user?.role ?? "member";
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "largest">("recent");
  const [archived, setArchived] = useState(false);
  const [rows, setRows] = useState<LibraryDocument[]>([]);
  const [categories, setCategories] = useState<{ category: string; n: number }[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<LibraryDocument | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (nextPage = 1) => {
      const id = ++reqId.current;
      setError(false);
      try {
        const res = await library.search({
          q: q.trim() || undefined,
          category: category || undefined,
          sort,
          includeArchived: archived,
          entityType: params.entityType,
          entityId: params.entityId,
          page: nextPage,
          limit: 30,
        });
        if (id !== reqId.current) return; // a newer search answered first
        setRows((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data]));
        setCategories(res.categories ?? []);
        setPage(res.page);
        setPages(res.pages);
      } catch {
        if (id === reqId.current) setError(true);
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [q, category, sort, archived, params.entityType, params.entityId],
  );
  useEffect(() => {
    const t = setTimeout(() => load(1), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const canAdd = ["syndicate_admin", "president", "secretary", "treasurer"].includes(role);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={tr("title")} action={canAdd ? { icon: "plus", onPress: () => setAdding(true), label: tr("add") } : undefined} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput value={q} onChangeText={setQ} placeholder={tr("search")} placeholderTextColor={colors.mutedForeground} style={{ flex: 1, color: colors.foreground }} returnKeyType="search" />
        </View>
        <ChoiceChips
          value={category}
          onChange={setCategory}
          options={[{ key: "", label: tr("all") }, ...categories.map((c) => ({ key: c.category, label: `${CATEGORIES[c.category]?.[L] ?? c.category} (${c.n})` }))]}
        />
        <View style={styles.row}>
          <ChoiceChips value={sort} onChange={(v) => setSort(v as typeof sort)} options={[{ key: "recent", label: tr("sort_recent") }, { key: "title", label: tr("sort_title") }, { key: "largest", label: tr("sort_largest") }]} />
          {TEAM.includes(role) && (
            <TouchableOpacity onPress={() => setArchived((a) => !a)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: archived }}>
              <Feather name={archived ? "check-square" : "square"} size={15} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12 }}>{tr("showArchived")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <ErrorState title={tr("loadError")} description="" retryLabel={tr("retry")} onRetry={() => { setLoading(true); load(1); }} accentColor={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} />}
          ListEmptyComponent={<Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }}>{tr("empty")}</Text>}
          ListFooterComponent={page < pages ? <ActionButton label={tr("more")} icon="chevron-down" color="#64748b" onPress={() => load(page + 1)} /> : null}
          renderItem={({ item: d }) => (
            <TouchableOpacity onPress={() => setSelected(d)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button">
              <View style={styles.row}>
                <Feather name={d.mimeType?.startsWith("image/") ? "image" : "file-text"} size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>{d.title}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    {CATEGORIES[d.category]?.[L] ?? d.category} · {String(d.createdAt).slice(0, 10)} {humanSize(d.sizeBytes)}
                    {TEAM.includes(role) ? ` · ${tr(`v_${d.visibility}` as keyof typeof S)}` : ""}
                  </Text>
                </View>
                {d.status === "archived" ? <Text style={[styles.badge, { color: "#64748b" }]}>{tr("archived")}</Text> : d.status === "draft" ? <Text style={[styles.badge, { color: "#f59e0b" }]}>{tr("draft")}</Text> : null}
                <TouchableOpacity onPress={() => openDocument(d, tr)} disabled={!d.hasFile} accessibilityLabel={tr("open")} hitSlop={10}>
                  <Feather name="download" size={18} color={d.hasFile ? colors.primary : colors.border} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <UploadSheet visible={adding} tr={tr} lang={L} isTreasurer={role === "treasurer"} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(1); }} />
      <DocumentSheet doc={selected} tr={tr} lang={L} role={role} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); load(1); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", marginTop: 8 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  pick: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
});
