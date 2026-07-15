import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActivity } from "@/context/ActivityContext";
import { useAuth } from "@/context/AuthContext";
import { useData, type Document } from "@/context/DataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterChips from "@/components/FilterChips";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATS = [
  { key: "all",        label: "Tous"         },
  { key: "statuts",    label: "Statuts"      },
  { key: "reglements", label: "Règlements"   },
  { key: "pv",         label: "PV"           },
  { key: "juridique",  label: "Juridique"    },
  { key: "finances",   label: "Finances"     },
  { key: "attestation",label: "Attestations" },
];

const CAT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  statuts:     "book-open",
  reglements:  "book",
  pv:          "clipboard",
  juridique:   "shield",
  finances:    "dollar-sign",
  attestation: "award",
};

const CAT_COLORS: Record<string, string> = {
  statuts:     "#7c3aed",
  reglements:  "#3b82f6",
  pv:          "#10b981",
  juridique:   "#ef4444",
  finances:    "#f59e0b",
  attestation: "#8b5cf6",
};

// ── All 20 enterprise document templates ─────────────────────────────────────
const DOC_TEMPLATES = [
  // ── Existing 9 ──────────────────────────────────────────────────────────────
  { id: "t1",  name: "Attestation d'adhésion",      icon: "award"        as const, color: "#8b5cf6", desc: "Certifie l'appartenance d'un membre",           category: "attestation" as const, templateId: "attestation"           },
  { id: "t2",  name: "Procès-verbal de réunion",    icon: "clipboard"    as const, color: "#10b981", desc: "Procès-verbal officiel de réunion",              category: "pv"          as const, templateId: "pv"                    },
  { id: "t3",  name: "Convocation officielle",      icon: "calendar"     as const, color: "#3b82f6", desc: "Convocation officielle à une réunion",           category: "pv"          as const, templateId: "convocation"           },
  { id: "t4",  name: "Contrat",                     icon: "file-text"    as const, color: "#0891b2", desc: "Contrat entre le syndicat et un tiers",          category: "juridique"   as const, templateId: "contrat"               },
  { id: "t5",  name: "Circulaire interne",          icon: "mail"         as const, color: "#f59e0b", desc: "Communication officielle aux membres",           category: "reglements"  as const, templateId: "circulaire"            },
  { id: "t6",  name: "Rapport d'activité",          icon: "bar-chart-2"  as const, color: "#06b6d4", desc: "Rapport mensuel ou annuel d'activité",           category: "finances"    as const, templateId: "rapport_activite"      },
  { id: "t7",  name: "Décision syndicale",          icon: "check-circle" as const, color: "#16a34a", desc: "Décision officielle du bureau syndical",         category: "juridique"   as const, templateId: "decision"              },
  { id: "t8",  name: "Certificat officiel",         icon: "star"         as const, color: "#7c3aed", desc: "Certificat délivré à un membre ou partenaire",  category: "statuts"     as const, templateId: "certificat"            },
  { id: "t9",  name: "Mise en demeure",             icon: "alert-circle" as const, color: "#ef4444", desc: "Document de mise en demeure officielle",         category: "juridique"   as const, templateId: "mise_en_demeure"       },
  // ── 11 new templates ────────────────────────────────────────────────────────
  { id: "t10", name: "Demande administrative",      icon: "send"         as const, color: "#0284c7", desc: "Demande formelle adressée au syndicat",          category: "reglements"  as const, templateId: "demande_administrative" },
  { id: "t11", name: "Autorisation officielle",     icon: "unlock"       as const, color: "#16a34a", desc: "Autorisation délivrée par le bureau",            category: "juridique"   as const, templateId: "autorisation"          },
  { id: "t12", name: "Ordre de mission",            icon: "navigation"   as const, color: "#7c3aed", desc: "Mandat officiel pour une mission externe",       category: "reglements"  as const, templateId: "ordre_de_mission"      },
  { id: "t13", name: "Lettre officielle",           icon: "mail"         as const, color: "#0891b2", desc: "Courrier officiel à un tiers ou partenaire",     category: "juridique"   as const, templateId: "lettre_officielle"     },
  { id: "t14", name: "Note interne",               icon: "message-square" as const, color: "#64748b", desc: "Communication interne entre membres du bureau", category: "reglements"  as const, templateId: "note_interne"          },
  { id: "t15", name: "Rapport financier",           icon: "dollar-sign"  as const, color: "#f59e0b", desc: "Bilan financier de la période",                  category: "finances"    as const, templateId: "rapport_financier"     },
  { id: "t16", name: "Rapport d'audit",             icon: "search"       as const, color: "#dc2626", desc: "Résultats de l'audit interne ou externe",        category: "finances"    as const, templateId: "rapport_audit"         },
  { id: "t17", name: "Convention de partenariat",  icon: "link"         as const, color: "#2563eb", desc: "Convention formelle avec un partenaire",          category: "juridique"   as const, templateId: "convention_partenariat"},
  { id: "t18", name: "Accord collectif",            icon: "users"        as const, color: "#059669", desc: "Accord signé avec l'employeur ou les membres",   category: "juridique"   as const, templateId: "accord_collectif"      },
  { id: "t19", name: "Compte-rendu de réunion",    icon: "list"         as const, color: "#7c3aed", desc: "Résumé des délibérations d'une réunion",         category: "pv"          as const, templateId: "compte_rendu"          },
  { id: "t20", name: "Rapport d'activité annuel",  icon: "trending-up"  as const, color: "#0284c7", desc: "Rapport annuel complet des activités du syndicat",category: "finances"    as const, templateId: "rapport_activite"      },
];

// ─── Download progress state ──────────────────────────────────────────────────

interface DownloadState {
  active: boolean;
  docTitle: string;
  progress: number;          // 0–1
  bytesDownloaded: number;
  totalBytes: number;
  speedKbps: number;
  remainingSec: number;
  phase: "fetching_url" | "downloading" | "done" | "error";
  errorMsg?: string;
  localUri?: string;
}

const INIT_DL: DownloadState = {
  active: false, docTitle: "", progress: 0,
  bytesDownloaded: 0, totalBytes: 0, speedKbps: 0, remainingSec: 0,
  phase: "fetching_url",
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentsScreen() {
  const colors     = useColors();
  const insets     = useSafeAreaInsets();
  const { user }   = useAuth();
  const { documents, updateDocument, refreshDocuments } = useData();
  const { logActivity } = useActivity();
  const { toggleFavorite, isFavorite } = useFavorites();
  const FAV_ID = "screen-documents";
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  // List / filter
  const [category, setCategory] = useState("all");
  const [search,   setSearch]   = useState("");

  // Selected document
  const [selected, setSelected] = useState<Document | null>(null);

  // Generate modal
  const [showGenerate,     setShowGenerate]     = useState(false);
  const [generating,       setGenerating]       = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof DOC_TEMPLATES[0] | null>(null);
  const [genMember,        setGenMember]        = useState("");
  const [genNote,          setGenNote]          = useState("");

  // Edit modal
  const [showEdit,    setShowEdit]    = useState(false);
  const [editTitle,   setEditTitle]   = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit,  setSavingEdit]  = useState(false);

  // Signature modal
  const [showSign,   setShowSign]   = useState(false);
  const [signing,    setSigning]    = useState(false);
  const [sigEmpty,   setSigEmpty]   = useState(true);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const sigSvgRef = useRef<string>("");

  // Download progress
  const [dlState, setDlState] = useState<DownloadState>(INIT_DL);
  const dlRef = useRef<ReturnType<typeof FileSystem.createDownloadResumable> | null>(null);
  const dlStartTime = useRef(0);
  const dlStartBytes = useRef(0);
  const lastSpeedUpdate = useRef(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ─── Filtering ───────────────────────────────────────────────────────────────

  const filtered = documents.filter((d) => {
    const matchCat    = category === "all" || d.category === category;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // ─── Status display ──────────────────────────────────────────────────────────

  const statusConfig = (status: string): { label: string; color: string } =>
    ({
      published:      { label: "Publié",       color: colors.success },
      draft:          { label: "Brouillon",     color: colors.mutedForeground },
      pending:        { label: "En attente",    color: "#f59e0b" },
      generated:      { label: "Généré",        color: "#3b82f6" },
      pending_review: { label: "En révision",   color: "#f59e0b" },
      validated:      { label: "Validé",        color: "#10b981" },
      signed:         { label: "Signé",         color: "#8b5cf6" },
      archived:       { label: "Archivé",       color: colors.mutedForeground },
    } as Record<string, { label: string; color: string }>)[status]
    ?? { label: status, color: colors.mutedForeground };

  // ─── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedTemplate || generating) return;
    const content = [genMember && `Destinataire: ${genMember}`, genNote].filter(Boolean).join("\n");
    setGenerating(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.generate(
        selectedTemplate.name,
        selectedTemplate.category,
        content || undefined,
        selectedTemplate.templateId,
        genMember || undefined,
      );
      logActivity({ action: "Document généré", target: selectedTemplate.name, route: "/documents", icon: "file-text", color: "#6366f1" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshDocuments().catch(() => {});
      Alert.alert("Succès", `Le document "${selectedTemplate.name}" a été généré.`);
      setShowGenerate(false);
      setSelectedTemplate(null);
      setGenMember("");
      setGenNote("");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Erreur de génération",
        err?.message && !err.message.startsWith("HTTP")
          ? err.message
          : "Impossible de générer le document. Vérifiez la connexion et réessayez.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // ─── Preview — opens in-app PDF viewer ──────────────────────────────────────

  const handlePreview = async (doc: Document) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.downloadUrl(doc.id);
      const signedUrl = (res as any).url as string | undefined;
      if (signedUrl) {
        router.push({
          pathname: "/pdf-viewer",
          params: { url: signedUrl, title: doc.title, docId: doc.id },
        });
        return;
      }
      Alert.alert("Aperçu indisponible", "Le PDF n'est pas encore disponible pour ce document. Il est peut-être encore en cours de génération.");
    } catch (err: any) {
      Alert.alert(
        "Aperçu impossible",
        err?.message?.includes("404")
          ? "Ce document n'a pas encore de fichier PDF associé."
          : "Impossible d'ouvrir l'aperçu. Vérifiez votre connexion.",
      );
    }
  };

  // ─── Download with real progress ─────────────────────────────────────────────

  const startDownload = async (doc: Document, afterDownload: "share" | "open" = "open") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setDlState({ ...INIT_DL, active: true, docTitle: doc.title, phase: "fetching_url" });
    progressAnim.setValue(0);

    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.downloadUrl(doc.id);
      const signedUrl = (res as any).url as string | undefined;
      const filename  = (res as any).filename as string | undefined;

      if (!signedUrl) {
        setDlState((s) => ({ ...s, phase: "error", errorMsg: "Aucun fichier PDF disponible pour ce document." }));
        return;
      }

      const safeName  = filename ?? `${doc.title.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      const cacheDir  = (FileSystem as any).cacheDirectory ?? "";
      const localPath = `${cacheDir}${safeName}`;

      setDlState((s) => ({ ...s, phase: "downloading" }));
      dlStartTime.current    = Date.now();
      dlStartBytes.current   = 0;
      lastSpeedUpdate.current = Date.now();

      const dl = FileSystem.createDownloadResumable(
        signedUrl,
        localPath,
        {},
        (progress) => {
          const downloaded = progress.totalBytesWritten;
          const total      = progress.totalBytesExpectedToWrite;
          const pct        = total > 0 ? downloaded / total : 0;

          // Speed calculation (Kbps, updated max every 500ms)
          const now       = Date.now();
          const elapsed   = (now - dlStartTime.current) / 1000;
          const speedKbps = elapsed > 0 ? Math.round((downloaded / 1024) / elapsed) : 0;
          const remainingSec =
            speedKbps > 0 && total > 0
              ? Math.round(((total - downloaded) / 1024) / speedKbps)
              : 0;

          setDlState((s) => ({
            ...s,
            progress:        pct,
            bytesDownloaded: downloaded,
            totalBytes:      total,
            speedKbps,
            remainingSec,
          }));

          Animated.timing(progressAnim, {
            toValue:         pct,
            duration:        200,
            useNativeDriver: false,
          }).start();
        },
      );

      dlRef.current = dl;
      const result = await dl.downloadAsync();

      if (!result?.uri) {
        setDlState((s) => ({ ...s, phase: "error", errorMsg: "Téléchargement interrompu." }));
        return;
      }

      setDlState((s) => ({ ...s, phase: "done", progress: 1, localUri: result.uri }));
      Animated.timing(progressAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      logActivity({ action: "Document téléchargé", target: doc.title, route: "/documents", icon: "download", color: "#6366f1" });

      if (afterDownload === "share") {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
        }
        setDlState(INIT_DL);
      }
      // For "open" mode, keep the success panel visible so user can act on it
    } catch (err: any) {
      if (err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
        setDlState(INIT_DL);
        return;
      }
      setDlState((s) => ({
        ...s,
        phase: "error",
        errorMsg:
          err?.message && !err.message.startsWith("HTTP")
            ? err.message
            : "Échec du téléchargement. Vérifiez votre connexion et réessayez.",
      }));
    }
  };

  const cancelDownload = () => {
    dlRef.current?.pauseAsync().catch(() => {});
    dlRef.current = null;
    setDlState(INIT_DL);
  };

  const retryDownload = (doc: Document) => startDownload(doc);

  const openDownloadedFile = async (uri: string) => {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    }
    setDlState(INIT_DL);
  };

  // ─── Edit ────────────────────────────────────────────────────────────────────

  const openEdit = async (doc: Document) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditTitle(doc.title);
    setEditContent("");
    setShowEdit(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await docsApi.get(doc.id)) as { data: Record<string, unknown> };
      setEditContent(String(res.data.content ?? ""));
    } catch {
      // leave empty — user can still overwrite
    }
  };

  // ─── Sign ────────────────────────────────────────────────────────────────────

  const openSign = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sigSvgRef.current = "";
    setSigEmpty(true);
    setShowSign(true);
  };

  const handleConfirmSign = async () => {
    if (!selected || sigEmpty || signing) return;
    setSigning(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.sign(selected.id, sigSvgRef.current || undefined);
      updateDocument(selected.id, { status: "signed" as Document["status"] });
      logActivity({ action: "Document signé", target: selected.title, route: "/documents", icon: "edit-3", color: "#8b5cf6" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshDocuments().catch(() => {});
      setShowSign(false);
      setSelected((s) => (s ? { ...s, status: "signed" as Document["status"] } : s));
      Alert.alert("Document signé", "Votre signature a été enregistrée avec succès.");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Erreur de signature",
        err?.message?.includes("409")
          ? "Vous avez déjà signé ce document."
          : err?.message && !err.message.startsWith("HTTP")
            ? err.message
            : "Impossible d'enregistrer la signature. Vérifiez la connexion et réessayez.",
      );
    } finally {
      setSigning(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    if (!editTitle.trim()) { Alert.alert("Titre requis", "Le titre ne peut pas être vide."); return; }
    setSavingEdit(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(selected.id, { title: editTitle.trim(), content: editContent });
      updateDocument(selected.id, { title: editTitle.trim(), content: editContent });
      logActivity({ action: "Document modifié", target: editTitle.trim(), route: "/documents", icon: "edit-2", color: "#6366f1" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowEdit(false);
      setSelected((s) => (s ? { ...s, title: editTitle.trim(), content: editContent } : s));
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Erreur",
        err?.message && !err.message.startsWith("HTTP")
          ? err.message
          : "Impossible d'enregistrer les modifications.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Documents</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{filtered.length} document(s)</Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleFavorite({ id: FAV_ID, title: "Documents", icon: "file-text", color: "#6366f1", route: "/documents" })}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="star" size={20} color={isFavorite(FAV_ID) ? "#f59e0b" : colors.mutedForeground} />
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={{ padding: 6, marginRight: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/documents-recycle-bin"); }}
          >
            <Feather name="trash-2" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowGenerate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="file-plus" size={16} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Search ── */}
      <View style={[styles.searchWrap, { margin: 12, marginBottom: 0, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Rechercher un document..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      <FilterChips options={CATS} value={category} onChange={setCategory} accentColor={colors.primary} />

      {/* ── Stats row ── */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Publiés",    count: documents.filter((d) => d.status === "published").length,                                            color: colors.success         },
          { label: "Brouillons", count: documents.filter((d) => d.status === "draft" || d.status === "generated").length,                    color: colors.mutedForeground },
          { label: "En attente", count: documents.filter((d) => d.status === "pending" || d.status === "pending_review").length,             color: "#f59e0b"              },
          { label: "Signés",     count: documents.filter((d) => d.status === "signed" || d.status === "validated").length,                   color: "#8b5cf6"              },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statCount, { color: s.color }]}>{s.count}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Document list ── */}
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun document trouvé</Text>
          </View>
        }
        renderItem={({ item: d }) => {
          const sc       = statusConfig(d.status);
          const catColor = CAT_COLORS[d.category] ?? colors.primary;
          return (
            <TouchableOpacity
              style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: catColor }]}
              onPress={() => setSelected(d)}
              activeOpacity={0.8}
            >
              <View style={[styles.docIcon, { backgroundColor: catColor + "15" }]}>
                <Feather name={CAT_ICONS[d.category] ?? "file-text"} size={20} color={catColor} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.docTitle, { color: colors.foreground }]} numberOfLines={2}>{d.title}</Text>
                <View style={styles.docMeta}>
                  <Text style={[styles.docDate, { color: colors.mutedForeground }]}>{d.date}</Text>
                  <Text style={[styles.docDot, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.docSize, { color: colors.mutedForeground }]}>{d.size}</Text>
                </View>
                <View style={[styles.docStatus, { backgroundColor: sc.color + "15" }]}>
                  <Text style={[styles.docStatusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: colors.primary + "15" }]}
                onPress={() => startDownload(d)}
              >
                <Feather name="download" size={16} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Download progress overlay ── */}
      {dlState.active ? (
        <View style={[styles.dlOverlay, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Title row */}
          <View style={styles.dlHeader}>
            <Feather
              name={dlState.phase === "done" ? "check-circle" : dlState.phase === "error" ? "alert-circle" : "download-cloud"}
              size={20}
              color={dlState.phase === "done" ? colors.success : dlState.phase === "error" ? "#ef4444" : colors.primary}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.dlTitle, { color: colors.foreground }]} numberOfLines={1}>{dlState.docTitle}</Text>
              <Text style={[styles.dlSub, { color: colors.mutedForeground }]}>
                {dlState.phase === "fetching_url"  ? "Préparation…"
                  : dlState.phase === "done"        ? "Téléchargement terminé"
                  : dlState.phase === "error"       ? dlState.errorMsg ?? "Erreur"
                  : (() => {
                      const mb   = (dlState.bytesDownloaded / (1024 * 1024)).toFixed(1);
                      const tot  = dlState.totalBytes > 0 ? ` / ${(dlState.totalBytes / (1024 * 1024)).toFixed(1)} Mo` : "";
                      const spd  = dlState.speedKbps > 0 ? `  •  ${dlState.speedKbps > 1024 ? `${(dlState.speedKbps/1024).toFixed(1)} Mo/s` : `${dlState.speedKbps} Ko/s`}` : "";
                      const rem  = dlState.remainingSec > 0 ? `  •  ${dlState.remainingSec}s` : "";
                      return `${mb}${tot}${spd}${rem}`;
                    })()
                }
              </Text>
            </View>
            {dlState.phase !== "done" && dlState.phase !== "error" ? (
              <TouchableOpacity onPress={cancelDownload} style={styles.dlCancel}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setDlState(INIT_DL)} style={styles.dlCancel}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bar */}
          {dlState.phase !== "done" && dlState.phase !== "error" ? (
            <View style={[styles.dlBarBg, { backgroundColor: colors.border }]}>
              <Animated.View
                style={[
                  styles.dlBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                  },
                ]}
              />
            </View>
          ) : null}

          {/* % label */}
          {dlState.phase === "downloading" ? (
            <Text style={[styles.dlPct, { color: colors.primary }]}>{Math.round(dlState.progress * 100)}%</Text>
          ) : null}

          {/* Action buttons */}
          {dlState.phase === "done" && dlState.localUri ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.dlBtn, { backgroundColor: colors.primary }]}
                onPress={() => openDownloadedFile(dlState.localUri!)}
              >
                <Feather name="share-2" size={14} color="#fff" />
                <Text style={styles.dlBtnText}>Ouvrir / Partager</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dlBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setDlState(INIT_DL)}
              >
                <Text style={[styles.dlBtnText, { color: colors.foreground }]}>Fermer</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {dlState.phase === "error" ? (
            <TouchableOpacity
              style={[styles.dlBtn, { backgroundColor: "#ef4444", marginTop: 10 }]}
              onPress={() => {
                if (selected) retryDownload(selected);
              }}
            >
              <Feather name="refresh-cw" size={14} color="#fff" />
              <Text style={styles.dlBtnText}>Réessayer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ── Document detail modal ── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginStart: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {selected.title}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {/* Preview area */}
              <View style={[styles.previewArea, { backgroundColor: (CAT_COLORS[selected.category] ?? colors.primary) + "10", borderColor: (CAT_COLORS[selected.category] ?? colors.primary) + "30" }]}>
                <View style={[styles.previewIcon, { backgroundColor: (CAT_COLORS[selected.category] ?? colors.primary) + "20" }]}>
                  <Feather name={CAT_ICONS[selected.category] ?? "file-text"} size={40} color={CAT_COLORS[selected.category] ?? colors.primary} />
                </View>
                <Text style={[styles.previewTitle, { color: colors.foreground }]}>{selected.title}</Text>
                <Text style={[styles.previewCat, { color: CAT_COLORS[selected.category] ?? colors.primary }]}>
                  {CATS.find((c) => c.key === selected.category)?.label ?? selected.category}
                </Text>
                {(() => { const sc = statusConfig(selected.status); return (
                  <View style={[styles.docStatus, { backgroundColor: sc.color + "15", marginTop: 4 }]}>
                    <Text style={[styles.docStatusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                ); })()}
              </View>

              {/* Meta */}
              <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Date",        value: selected.date },
                  { label: "Taille",      value: selected.size },
                  { label: "Catégorie",   value: CATS.find((c) => c.key === selected.category)?.label ?? selected.category },
                  { label: "Statut",      value: statusConfig(selected.status).label },
                ].map((item, i) => (
                  <View key={item.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                  onPress={() => startDownload(selected)}
                >
                  <Feather name="download" size={18} color="#fff" />
                  <Text style={styles.primaryActionText}>Télécharger ({selected.size})</Text>
                </TouchableOpacity>
                <View style={styles.secondaryActions}>
                  <TouchableOpacity
                    style={[styles.secBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); startDownload(selected, "share"); }}
                  >
                    <Feather name="share-2" size={16} color={colors.foreground} />
                    <Text style={[styles.secBtnText, { color: colors.foreground }]}>Partager</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => handlePreview(selected)}
                  >
                    <Feather name="eye" size={16} color={colors.foreground} />
                    <Text style={[styles.secBtnText, { color: colors.foreground }]}>Aperçu PDF</Text>
                  </TouchableOpacity>
                  {isAdmin ? (
                    <TouchableOpacity
                      style={[styles.secBtn, { borderColor: colors.primary + "50", backgroundColor: colors.primary + "08" }]}
                      onPress={() => openEdit(selected)}
                    >
                      <Feather name="edit-2" size={16} color={colors.primary} />
                      <Text style={[styles.secBtnText, { color: colors.primary }]}>Modifier</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isAdmin && ["generated", "validated"].includes(selected.status) ? (
                    <TouchableOpacity
                      style={[styles.secBtn, { borderColor: "#8b5cf650", backgroundColor: "#8b5cf608" }]}
                      onPress={openSign}
                    >
                      <Feather name="edit-3" size={16} color="#8b5cf6" />
                      <Text style={[styles.secBtnText, { color: "#8b5cf6" }]}>Signer</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* ── Signature modal ── */}
      <Modal visible={showSign} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowSign(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Signature manuscrite</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Signez avec votre doigt dans la zone ci-dessous. Cette signature sera intégrée au document et horodatée.
            </Text>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignSelf: "center" }}>
              <SignaturePad
                ref={sigPadRef}
                width={320}
                height={180}
                onChange={(svg, isEmpty) => { sigSvgRef.current = svg; setSigEmpty(isEmpty); }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.secBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => { sigPadRef.current?.clear(); }}
              >
                <Feather name="rotate-ccw" size={16} color={colors.foreground} />
                <Text style={[styles.secBtnText, { color: colors.foreground }]}>Effacer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryAction, { flex: 1, backgroundColor: sigEmpty ? colors.mutedForeground : "#8b5cf6", opacity: signing ? 0.7 : 1 }]}
                disabled={sigEmpty || signing}
                onPress={handleConfirmSign}
              >
                {signing ? <ActivityIndicator color="#fff" /> : <Feather name="check" size={18} color="#fff" />}
                <Text style={styles.primaryActionText}>{signing ? "Envoi..." : "Confirmer la signature"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Generate modal ── */}
      <Modal visible={showGenerate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Générer un document</Text>
            <TouchableOpacity onPress={() => { setShowGenerate(false); setSelectedTemplate(null); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <Text style={[styles.genSectionLabel, { color: colors.mutedForeground }]}>CHOISIR UN MODÈLE</Text>
            <View style={styles.templatesGrid}>
              {DOC_TEMPLATES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.templateCard,
                    {
                      backgroundColor: colors.card,
                      borderColor:     selectedTemplate?.id === t.id ? t.color : colors.border,
                      borderWidth:     selectedTemplate?.id === t.id ? 2 : 1,
                    },
                  ]}
                  onPress={() => setSelectedTemplate(t)}
                >
                  <View style={[styles.templateIcon, { backgroundColor: t.color + "15" }]}>
                    <Feather name={t.icon} size={22} color={t.color} />
                  </View>
                  <Text style={[styles.templateName, { color: colors.foreground }]}>{t.name}</Text>
                  <Text style={[styles.templateDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{t.desc}</Text>
                  {selectedTemplate?.id === t.id ? (
                    <View style={[styles.selectedCheck, { backgroundColor: t.color }]}>
                      <Feather name="check" size={12} color="#fff" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>

            {selectedTemplate ? (
              <View style={{ gap: 14 }}>
                <View style={[styles.genPreviewBanner, { backgroundColor: selectedTemplate.color + "10", borderColor: selectedTemplate.color + "30" }]}>
                  <Feather name={selectedTemplate.icon} size={16} color={selectedTemplate.color} />
                  <Text style={[styles.genPreviewText, { color: selectedTemplate.color }]}>
                    {selectedTemplate.name}
                  </Text>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nom du membre / Destinataire</Text>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    value={genMember}
                    onChangeText={setGenMember}
                    placeholder="Mohammed Alaoui"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Objet / Notes</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                    value={genNote}
                    onChangeText={setGenNote}
                    placeholder="Détails additionnels pour ce document..."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryAction, { backgroundColor: selectedTemplate.color, opacity: generating ? 0.6 : 1 }]}
                  onPress={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Feather name="file-plus" size={18} color="#fff" />
                  )}
                  <Text style={styles.primaryActionText}>{generating ? "Génération en cours…" : "Générer le document"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.genHint, { backgroundColor: colors.muted, borderRadius: 14 }]}>
                <Feather name="arrow-up" size={16} color={colors.mutedForeground} />
                <Text style={[styles.genHintText, { color: colors.mutedForeground }]}>
                  Sélectionnez un modèle ci-dessus pour continuer
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Edit modal ── */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Modifier le document</Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Titre</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Contenu</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, minHeight: 180, textAlignVertical: "top" }]}
                value={editContent}
                onChangeText={setEditContent}
                placeholder="Contenu du document..."
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: colors.primary, opacity: savingEdit ? 0.6 : 1 }]}
              onPress={handleSaveEdit}
              disabled={savingEdit}
            >
              {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={18} color="#fff" />}
              <Text style={styles.primaryActionText}>{savingEdit ? "Enregistrement…" : "Enregistrer"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1 },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn:          { padding: 4 },
  title:            { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle:         { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  generateBtn:      { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  searchWrap:       { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:      { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  statsRow:         { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1 },
  statItem:         { flex: 1, alignItems: "center", gap: 2 },
  statCount:        { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel:        { fontSize: 10, fontFamily: "Inter_400Regular" },
  empty:            { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText:        { fontSize: 14, fontFamily: "Inter_400Regular" },
  docCard:          { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, gap: 12 },
  docIcon:          { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docTitle:         { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  docMeta:          { flexDirection: "row", alignItems: "center", gap: 4 },
  docDate:          { fontSize: 11, fontFamily: "Inter_400Regular" },
  docDot:           { fontSize: 10 },
  docSize:          { fontSize: 11, fontFamily: "Inter_400Regular" },
  docStatus:        { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  docStatusText:    { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  downloadBtn:      { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  // Download overlay
  dlOverlay:        { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
  dlHeader:         { flexDirection: "row", alignItems: "center" },
  dlTitle:          { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dlSub:            { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  dlCancel:         { padding: 6 },
  dlBarBg:          { height: 6, borderRadius: 3, marginTop: 10, overflow: "hidden" },
  dlBarFill:        { height: 6, borderRadius: 3 },
  dlPct:            { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 4, textAlign: "right" as const },
  dlBtn:            { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  dlBtnText:        { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  // Modals
  modal:            { flex: 1 },
  modalHeader:      { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1, gap: 4 },
  modalTitle:       { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  previewArea:      { borderRadius: 20, borderWidth: 1, padding: 30, alignItems: "center", gap: 10 },
  previewIcon:      { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  previewTitle:     { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  previewCat:       { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  metaCard:         { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sep:              { height: 1, marginHorizontal: 14 },
  metaRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  metaLabel:        { fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue:        { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  primaryAction:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  primaryActionText:{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  secondaryActions: { flexDirection: "row", gap: 10 },
  secBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secBtnText:       { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  genSectionLabel:  { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  templatesGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  templateCard:     { width: "47%", borderRadius: 16, padding: 14, gap: 8, position: "relative" },
  templateIcon:     { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  templateName:     { fontSize: 13, fontFamily: "Inter_700Bold" },
  templateDesc:     { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  selectedCheck:    { position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  genPreviewBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  genPreviewText:   { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  fieldLabel:       { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea:    { minHeight: 80, textAlignVertical: "top" },
  genHint:          { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  genHintText:      { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
});
