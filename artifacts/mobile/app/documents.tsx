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
  Image,
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
  const [genLanguage,      setGenLanguage]      = useState<"fr" | "ar" | "en" | "es">("fr");

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

  // Workflow actions
  const [workflowBusy,     setWorkflowBusy]     = useState(false);
  const [showRejectModal,  setShowRejectModal]   = useState(false);
  const [rejectReason,     setRejectReason]      = useState("");

  // Version history
  const [showVersions,     setShowVersions]      = useState(false);
  const [versions,         setVersions]          = useState<Array<{
    id: string; versionNumber: number; title: string; createdAt: string; createdByName: string | null;
  }>>([]);
  const [versionsLoading,  setVersionsLoading]   = useState(false);
  const [restoringVersion, setRestoringVersion]  = useState<string | null>(null);

  // Comments
  type DocComment = { id: string; content: string; parentId: string | null; isDeleted: boolean; createdAt: string; authorId: string; authorName: string | null; authorRole: string | null };
  const [showComments,    setShowComments]    = useState(false);
  const [comments,        setComments]        = useState<DocComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText,     setCommentText]     = useState("");
  const [postingComment,  setPostingComment]  = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  // QR code
  const [showQR,    setShowQR]    = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
      rejected:       { label: "Rejeté",        color: "#ef4444" },
      expired:        { label: "Expiré",        color: "#dc2626" },
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
        genLanguage,
      );
      logActivity({ action: "Document généré", target: selectedTemplate.name, route: "/documents", icon: "file-text", color: "#6366f1" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshDocuments().catch(() => {});
      Alert.alert("Succès", `Le document "${selectedTemplate.name}" a été généré.`);
      setShowGenerate(false);
      setSelectedTemplate(null);
      setGenMember("");
      setGenNote("");
      setGenLanguage("fr");
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

  // ─── Workflow actions ─────────────────────────────────────────────────────────

  const applyStatusUpdate = async (newStatus: string, successTitle: string, successMsg: string) => {
    if (!selected || workflowBusy) return;
    setWorkflowBusy(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(selected.id, { status: newStatus });
      updateDocument(selected.id, { status: newStatus as Document["status"] });
      setSelected((s) => s ? { ...s, status: newStatus as Document["status"] } : s);
      await refreshDocuments().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(successTitle, successMsg);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erreur", err?.message && !err.message.startsWith("HTTP") ? err.message : "Action impossible. Vérifiez la connexion.");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleSubmitForReview = () =>
    applyStatusUpdate("pending_review", "Envoyé en révision", "Le document a été soumis pour révision et approbation.");

  const handleApproveDoc = () =>
    applyStatusUpdate("validated", "Document validé", "Le document a été approuvé et validé.");

  const handlePublishDoc = () =>
    applyStatusUpdate("published", "Document publié", "Le document est maintenant publié et accessible aux membres.");

  const handleArchiveDoc = () => {
    if (!selected) return;
    Alert.alert(
      "Archiver le document",
      "Ce document sera archivé et ne sera plus affiché dans les listes actives.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Archiver", onPress: () => applyStatusUpdate("archived", "Archivé", "Le document a été archivé.") },
      ],
    );
  };

  const handleRejectDoc = async () => {
    if (!selected || workflowBusy || !rejectReason.trim()) return;
    setWorkflowBusy(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(selected.id, { status: "rejected", rejectionReason: rejectReason.trim() } as any);
      updateDocument(selected.id, { status: "rejected" as Document["status"] });
      setSelected((s) => s ? { ...s, status: "rejected" as Document["status"] } : s);
      await refreshDocuments().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowRejectModal(false);
      setRejectReason("");
      Alert.alert("Document rejeté", "Le document a été rejeté. L'initiateur sera notifié.");
    } catch (err: any) {
      Alert.alert("Erreur", err?.message ?? "Impossible de rejeter le document.");
    } finally {
      setWorkflowBusy(false);
    }
  };

  // ─── Soft-delete ──────────────────────────────────────────────────────────────

  const handleDelete = () => {
    if (!selected) return;
    Alert.alert(
      "Supprimer le document",
      `"${selected.title}" sera déplacé dans la corbeille. Vous pouvez le restaurer ultérieurement.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              const { documents: docsApi } = await import("@/services/api");
              await docsApi.delete(selected.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await refreshDocuments().catch(() => {});
              setSelected(null);
            } catch (err: any) {
              Alert.alert("Erreur", err?.message ?? "Impossible de supprimer ce document.");
            }
          },
        },
      ],
    );
  };

  // ─── Version history ──────────────────────────────────────────────────────────

  const handleShowVersions = async () => {
    if (!selected) return;
    setVersions([]);
    setShowVersions(true);
    setVersionsLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await docsApi.versions(selected.id)) as { data: typeof versions };
      setVersions(res.data ?? []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  // ─── Comments ─────────────────────────────────────────────────────────────────

  const handleShowComments = async () => {
    if (!selected) return;
    setComments([]);
    setShowComments(true);
    setCommentsLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.comments(selected.id);
      setComments((res.data ?? []).filter((c) => !c.isDeleted));
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!selected || !commentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.addComment(selected.id, commentText.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCommentText("");
      const res = await docsApi.comments(selected.id);
      setComments((res.data ?? []).filter((c) => !c.isDeleted));
    } catch (err: any) {
      Alert.alert("Erreur", err?.message ?? "Impossible d'ajouter le commentaire.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    if (!selected) return;
    Alert.alert("Supprimer le commentaire", "Cette action est irréversible.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive",
        onPress: async () => {
          setDeletingComment(commentId);
          try {
            const { documents: docsApi } = await import("@/services/api");
            await docsApi.deleteComment(selected.id, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
          } catch (err: any) {
            Alert.alert("Erreur", err?.message ?? "Impossible de supprimer le commentaire.");
          } finally {
            setDeletingComment(null);
          }
        },
      },
    ]);
  };

  // ─── QR code ──────────────────────────────────────────────────────────────────

  const handleShowQR = async () => {
    if (!selected) return;
    setQrDataUrl(null);
    setShowQR(true);
    setQrLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.qrCode(selected.id);
      setQrDataUrl(res.qrDataUrl ?? null);
    } catch {
      setQrDataUrl(null);
    } finally {
      setQrLoading(false);
    }
  };

  const handleRestoreVersion = (versionId: string, versionNum: number) => {
    if (!selected || restoringVersion) return;
    Alert.alert(
      `Restaurer la version ${versionNum}`,
      "La version actuelle sera sauvegardée en historique et le document sera remplacé par cette version.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Restaurer",
          onPress: async () => {
            setRestoringVersion(versionId);
            try {
              const { documents: docsApi } = await import("@/services/api");
              await docsApi.restoreVersion(selected.id, versionId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await refreshDocuments().catch(() => {});
              setShowVersions(false);
              setSelected(null);
              Alert.alert("Version restaurée", `Le document a été restauré à la version ${versionNum}.`);
            } catch (err: any) {
              Alert.alert("Erreur", err?.message ?? "Impossible de restaurer cette version.");
            } finally {
              setRestoringVersion(null);
            }
          },
        },
      ],
    );
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

                {/* Standard actions row */}
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
                  <TouchableOpacity
                    style={[styles.secBtn, { borderColor: "#06b6d450", backgroundColor: "#06b6d408" }]}
                    onPress={handleShowQR}
                  >
                    <Feather name="grid" size={16} color="#06b6d4" />
                    <Text style={[styles.secBtnText, { color: "#06b6d4" }]}>QR Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secBtn, { borderColor: "#f59e0b50", backgroundColor: "#f59e0b08" }]}
                    onPress={handleShowComments}
                  >
                    <Feather name="message-square" size={16} color="#f59e0b" />
                    <Text style={[styles.secBtnText, { color: "#f59e0b" }]}>Commentaires</Text>
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

                {/* Workflow actions — admin only, context-sensitive */}
                {isAdmin ? (
                  <View style={{ gap: 8 }}>
                    {/* Submit for review: draft or generated */}
                    {["draft", "generated"].includes(selected.status) ? (
                      <TouchableOpacity
                        style={[styles.primaryAction, { backgroundColor: "#f59e0b", opacity: workflowBusy ? 0.6 : 1 }]}
                        onPress={handleSubmitForReview}
                        disabled={workflowBusy}
                      >
                        {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={17} color="#fff" />}
                        <Text style={styles.primaryActionText}>Soumettre pour révision</Text>
                      </TouchableOpacity>
                    ) : null}

                    {/* Approve / Reject: pending_review */}
                    {selected.status === "pending_review" ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity
                          style={[styles.primaryAction, { flex: 1, backgroundColor: "#10b981", opacity: workflowBusy ? 0.6 : 1 }]}
                          onPress={handleApproveDoc}
                          disabled={workflowBusy}
                        >
                          {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={17} color="#fff" />}
                          <Text style={styles.primaryActionText}>Approuver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.primaryAction, { flex: 1, backgroundColor: "#ef4444", opacity: workflowBusy ? 0.6 : 1 }]}
                          onPress={() => { setRejectReason(""); setShowRejectModal(true); }}
                          disabled={workflowBusy}
                        >
                          <Feather name="x" size={17} color="#fff" />
                          <Text style={styles.primaryActionText}>Rejeter</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {/* Publish: validated or signed */}
                    {["validated", "signed"].includes(selected.status) ? (
                      <TouchableOpacity
                        style={[styles.primaryAction, { backgroundColor: "#10b981", opacity: workflowBusy ? 0.6 : 1 }]}
                        onPress={handlePublishDoc}
                        disabled={workflowBusy}
                      >
                        {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="globe" size={17} color="#fff" />}
                        <Text style={styles.primaryActionText}>Publier</Text>
                      </TouchableOpacity>
                    ) : null}

                    {/* Archive + Version history + Delete row */}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {selected.status === "published" ? (
                        <TouchableOpacity
                          style={[styles.secBtn, { flex: 1, borderColor: "#64748b50", backgroundColor: "#64748b08", opacity: workflowBusy ? 0.6 : 1 }]}
                          onPress={handleArchiveDoc}
                          disabled={workflowBusy}
                        >
                          <Feather name="archive" size={15} color="#64748b" />
                          <Text style={[styles.secBtnText, { color: "#64748b" }]}>Archiver</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.secBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.card }]}
                        onPress={handleShowVersions}
                      >
                        <Feather name="clock" size={15} color={colors.foreground} />
                        <Text style={[styles.secBtnText, { color: colors.foreground }]}>Historique</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secBtn, { flex: 1, borderColor: "#ef444450", backgroundColor: "#ef444408" }]}
                        onPress={handleDelete}
                      >
                        <Feather name="trash-2" size={15} color="#ef4444" />
                        <Text style={[styles.secBtnText, { color: "#ef4444" }]}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
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
                <View style={{ gap: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Langue du document</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {([
                      { code: "fr" as const, label: "Français" },
                      { code: "ar" as const, label: "العربية" },
                      { code: "en" as const, label: "English" },
                      { code: "es" as const, label: "Español" },
                    ]).map((l) => (
                      <TouchableOpacity
                        key={l.code}
                        onPress={() => setGenLanguage(l.code)}
                        style={[
                          styles.langChip,
                          {
                            borderColor: genLanguage === l.code ? selectedTemplate.color : colors.border,
                            backgroundColor: genLanguage === l.code ? selectedTemplate.color + "15" : colors.card,
                          },
                        ]}
                      >
                        <Text style={{ color: genLanguage === l.code ? selectedTemplate.color : colors.mutedForeground, fontWeight: genLanguage === l.code ? "700" : "500", fontSize: 13 }}>
                          {l.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
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

      {/* ── Reject reason modal ── */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.overlayTitle, { color: colors.foreground }]}>✗ Rejeter le document</Text>
            <Text style={[styles.overlaySub, { color: colors.mutedForeground }]}>
              Indiquez la raison du rejet. L'initiateur sera notifié.
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, minHeight: 100, textAlignVertical: "top" }]}
              placeholder="Motif de rejet (requis)..."
              placeholderTextColor={colors.mutedForeground}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.overlayBtn, { backgroundColor: colors.muted, flex: 1 }]}
                onPress={() => { setShowRejectModal(false); setRejectReason(""); }}
              >
                <Text style={[styles.overlayBtnText, { color: colors.foreground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overlayBtn, { backgroundColor: rejectReason.trim() ? "#ef4444" : "#ef444460", flex: 1, opacity: workflowBusy ? 0.6 : 1 }]}
                onPress={handleRejectDoc}
                disabled={!rejectReason.trim() || workflowBusy}
              >
                {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.overlayBtnText, { color: "#fff" }]}>Confirmer le rejet</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Version history modal ── */}
      <Modal visible={showVersions} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowVersions(false)}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Historique des versions</Text>
            </View>
            <Feather name="clock" size={20} color={colors.mutedForeground} />
          </View>
          {versionsLoading ? (
            <View style={styles.empty}><ActivityIndicator color={colors.primary} /></View>
          ) : versions.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="clock" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune version précédente</Text>
            </View>
          ) : (
            <FlatList
              data={versions}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              renderItem={({ item: v }) => (
                <View style={[styles.versionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.versionBadge, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={[styles.versionBadgeText, { color: colors.primary }]}>v{v.versionNumber}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.versionTitle, { color: colors.foreground }]} numberOfLines={1}>{v.title}</Text>
                    <Text style={[styles.versionMeta, { color: colors.mutedForeground }]}>
                      {new Date(v.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      {v.createdByName ? `  ·  ${v.createdByName}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.versionRestoreBtn, { backgroundColor: colors.primary, opacity: restoringVersion === v.id ? 0.6 : 1 }]}
                    disabled={restoringVersion !== null}
                    onPress={() => handleRestoreVersion(v.id, v.versionNumber)}
                  >
                    {restoringVersion === v.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Feather name="rotate-ccw" size={14} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── QR Code modal ── */}
      <Modal visible={showQR} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card, alignItems: "center" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%" }}>
              <Feather name="grid" size={20} color="#06b6d4" />
              <Text style={[styles.overlayTitle, { color: colors.foreground, flex: 1 }]}>QR Code de vérification</Text>
              <TouchableOpacity onPress={() => setShowQR(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.overlaySub, { color: colors.mutedForeground, textAlign: "center" }]}>
              Scannez ce code pour vérifier l'authenticité du document
            </Text>
            {qrLoading ? (
              <View style={{ height: 200, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color="#06b6d4" size="large" />
              </View>
            ) : qrDataUrl ? (
              <View style={[styles.qrContainer, { backgroundColor: "#fff", borderColor: colors.border }]}>
                {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
                <Image source={{ uri: qrDataUrl }} style={{ width: 200, height: 200 }} resizeMode="contain" />
              </View>
            ) : (
              <View style={{ height: 160, alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
                <Text style={[styles.overlaySub, { color: colors.mutedForeground }]}>QR code indisponible</Text>
              </View>
            )}
            <Text style={[styles.versionMeta, { color: colors.mutedForeground, textAlign: "center" }]}>
              {selected?.id.slice(0, 12).toUpperCase()}
            </Text>
          </View>
        </View>
      </Modal>

      {/* ── Comments modal ── */}
      <Modal visible={showComments} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowComments(false)}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Commentaires</Text>
            </View>
            <Feather name="message-square" size={20} color="#f59e0b" />
          </View>

          {/* Comment input */}
          <View style={[styles.commentInputRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[styles.commentInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor={colors.mutedForeground}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.commentSendBtn, { backgroundColor: commentText.trim() ? "#f59e0b" : colors.muted, opacity: postingComment ? 0.6 : 1 }]}
              onPress={handlePostComment}
              disabled={!commentText.trim() || postingComment}
            >
              {postingComment
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="send" size={16} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          {commentsLoading ? (
            <View style={styles.empty}><ActivityIndicator color="#f59e0b" /></View>
          ) : comments.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="message-square" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun commentaire</Text>
              <Text style={[styles.versionMeta, { color: colors.mutedForeground }]}>Soyez le premier à commenter</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              renderItem={({ item: c }) => (
                <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <View style={[styles.commentAvatar, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={[styles.commentAvatarText, { color: colors.primary }]}>
                        {(c.authorName ?? "?")[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{c.authorName ?? "Inconnu"}</Text>
                      <Text style={[styles.versionMeta, { color: colors.mutedForeground }]}>
                        {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    {isAdmin ? (
                      <TouchableOpacity
                        onPress={() => handleDeleteComment(c.id)}
                        disabled={deletingComment === c.id}
                        style={{ padding: 4 }}
                      >
                        {deletingComment === c.id
                          ? <ActivityIndicator size="small" color="#ef4444" />
                          : <Feather name="trash-2" size={14} color="#ef4444" />
                        }
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
                </View>
              )}
            />
          )}
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
  langChip:         { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  genHint:          { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  genHintText:      { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  // Reject / overlay modals
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  overlayCard:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  overlayTitle:     { fontSize: 17, fontFamily: "Inter_700Bold" },
  overlaySub:       { fontSize: 13, fontFamily: "Inter_400Regular" },
  overlayBtn:       { paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  overlayBtnText:   { fontSize: 14, fontFamily: "Inter_700Bold" },
  // Version history
  versionCard:      { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  versionBadge:     { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  versionBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  versionTitle:     { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  versionMeta:      { fontSize: 11, fontFamily: "Inter_400Regular" },
  versionRestoreBtn:{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  // QR Code
  qrContainer:      { width: 224, height: 224, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 12 },
  // Comments
  commentInputRow:  { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, borderBottomWidth: 1 },
  commentInput:     { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular", maxHeight: 100 },
  commentSendBtn:   { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  commentCard:      { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  commentAvatar:    { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  commentAvatarText:{ fontSize: 13, fontFamily: "Inter_700Bold" },
  commentAuthor:    { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  commentContent:   { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
