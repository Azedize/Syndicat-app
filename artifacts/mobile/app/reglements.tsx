import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type DocType = "statuts" | "ri" | "circulaire" | "charte" | "accord";
type DocStatus = "published" | "draft" | "revision" | "archived";

interface ReglementDoc {
  id: string;
  title: string;
  type: DocType;
  status: DocStatus;
  version: string;
  publishedDate: string;
  updatedDate: string;
  author: string;
  approvedBy: string;
  pages: number;
  description: string;
  tags: string[];
  downloads: number;
}

const TYPE_CONFIG: Record<DocType, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  statuts: { label: "Statuts", color: "#7c3aed", icon: "book-open" },
  ri: { label: "Règlement Intérieur", color: "#3b82f6", icon: "book" },
  circulaire: { label: "Circulaire", color: "#10b981", icon: "mail" },
  charte: { label: "Charte", color: "#f59e0b", icon: "star" },
  accord: { label: "Accord", color: "#ef4444", icon: "check-circle" },
};

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string }> = {
  published: { label: "Publié", color: "#10b981" },
  draft: { label: "Brouillon", color: "#6b7280" },
  revision: { label: "En révision", color: "#f59e0b" },
  archived: { label: "Archivé", color: "#9ca3af" },
};

const INITIAL_DOCS: ReglementDoc[] = [
  {
    id: "r1",
    title: "Statuts du Syndicat National de l'Éducation",
    type: "statuts",
    status: "published",
    version: "v4.2",
    publishedDate: "2024-01-15",
    updatedDate: "2024-01-15",
    author: "Bureau National",
    approvedBy: "Assemblée Générale",
    pages: 28,
    description: "Texte fondateur régissant l'organisation, les objectifs, les droits et obligations du syndicat et de ses membres. Adopté lors de l'AG extraordinaire du 15 janvier 2024.",
    tags: ["fondamental", "organisation", "membres"],
    downloads: 342,
  },
  {
    id: "r2",
    title: "Règlement Intérieur 2024 — Bureau National",
    type: "ri",
    status: "published",
    version: "v3.1",
    publishedDate: "2024-02-01",
    updatedDate: "2024-02-01",
    author: "Fatima Zahra El Alami",
    approvedBy: "Bureau National",
    pages: 18,
    description: "Règles de fonctionnement interne du bureau national, incluant les procédures de vote, la gestion des réunions, les délégations de pouvoirs et les modalités de représentation.",
    tags: ["bureau", "procédures", "gouvernance"],
    downloads: 187,
  },
  {
    id: "r3",
    title: "Règlement Intérieur — Commissions Spécialisées",
    type: "ri",
    status: "revision",
    version: "v2.0-rc1",
    publishedDate: "",
    updatedDate: "2026-05-10",
    author: "Commission Juridique",
    approvedBy: "En cours de validation",
    pages: 12,
    description: "Règles applicables aux commissions permanentes et temporaires. Ce document est en cours de révision pour intégrer les nouvelles dispositions statutaires de 2026.",
    tags: ["commissions", "révision", "2026"],
    downloads: 23,
  },
  {
    id: "r4",
    title: "Circulaire N°2026-05 — Renouvellement des Cotisations",
    type: "circulaire",
    status: "published",
    version: "v1.0",
    publishedDate: "2026-05-01",
    updatedDate: "2026-05-01",
    author: "Secrétariat Général",
    approvedBy: "Trésorier Général",
    pages: 3,
    description: "Modalités et barèmes du renouvellement des cotisations syndicales pour l'année 2026-2027. Inclut les grilles tarifaires par catégorie de membres.",
    tags: ["cotisations", "2026", "finances"],
    downloads: 456,
  },
  {
    id: "r5",
    title: "Charte Éthique et Déontologique",
    type: "charte",
    status: "published",
    version: "v2.0",
    publishedDate: "2023-09-01",
    updatedDate: "2023-09-01",
    author: "Commission Éthique",
    approvedBy: "Assemblée Générale",
    pages: 8,
    description: "Principes fondamentaux régissant le comportement éthique des membres et responsables syndicaux. Inclut les procédures disciplinaires en cas de manquement.",
    tags: ["éthique", "déontologie", "discipline"],
    downloads: 215,
  },
  {
    id: "r6",
    title: "Accord Collectif — Conditions de Travail 2025",
    type: "accord",
    status: "published",
    version: "v1.0",
    publishedDate: "2025-03-15",
    updatedDate: "2025-03-15",
    author: "Bureau de Négociation",
    approvedBy: "Ministère de l'Éducation",
    pages: 22,
    description: "Accord collectif signé avec le ministère définissant les nouvelles conditions de travail, les grilles salariales révisées et les droits acquis pour la période 2025-2027.",
    tags: ["accord", "salaires", "conditions travail"],
    downloads: 789,
  },
  {
    id: "r7",
    title: "Statuts — Proposition d'Amendement 2026",
    type: "statuts",
    status: "draft",
    version: "v5.0-draft",
    publishedDate: "",
    updatedDate: "2026-05-18",
    author: "Commission Juridique",
    approvedBy: "Non approuvé",
    pages: 31,
    description: "Projet de révision des statuts pour adapter l'organisation aux nouvelles réalités du mouvement syndical. Soumis à l'AG extraordinaire prévue en juin 2026.",
    tags: ["statuts", "révision", "AG 2026"],
    downloads: 12,
  },
  {
    id: "r8",
    title: "Circulaire N°2026-03 — Protocole de Communication",
    type: "circulaire",
    status: "archived",
    version: "v1.0",
    publishedDate: "2026-03-01",
    updatedDate: "2026-03-01",
    author: "Bureau Communication",
    approvedBy: "Secrétariat Général",
    pages: 5,
    description: "Protocole de communication officielle du syndicat, incluant les canaux autorisés, les gabarits graphiques et les procédures de publication.",
    tags: ["communication", "protocole"],
    downloads: 134,
  },
];

type TabType = "tous" | DocType | "revision" | "versions";

export default function ReglementsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role !== "member";

  const [docs, setDocs] = useState<ReglementDoc[]>(INITIAL_DOCS);
  const [tab, setTab] = useState<TabType>("tous");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReglementDoc | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<DocType>("ri");
  const [newDesc, setNewDesc] = useState("");

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !search || d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q));
    const matchTab = tab === "tous"
      ? true
      : tab === "revision"
      ? d.status === "revision" || d.status === "draft"
      : d.type === tab;
    const matchRole = isAdmin ? true : d.status === "published";
    return matchSearch && matchTab && matchRole;
  });

  const publishedCount = docs.filter((d) => d.status === "published").length;
  const revisionCount = docs.filter((d) => d.status === "revision" || d.status === "draft").length;
  const totalDownloads = docs.reduce((s, d) => s + d.downloads, 0);

  const handlePublish = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, status: "published", publishedDate: new Date().toISOString().split("T")[0] } : d));
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status: "published" } : null);
    Alert.alert("Document publié", "Le document a été publié et est maintenant accessible à tous les membres.");
  };

  const handleCreateDoc = () => {
    if (!newTitle.trim()) { Alert.alert("Titre requis"); return; }
    const doc: ReglementDoc = {
      id: `r${Date.now()}`,
      title: newTitle.trim(),
      type: newType,
      status: "draft",
      version: "v1.0-draft",
      publishedDate: "",
      updatedDate: new Date().toISOString().split("T")[0],
      author: user?.name ?? "Administrateur",
      approvedBy: "En attente",
      pages: 0,
      description: newDesc.trim(),
      tags: [newType],
      downloads: 0,
    };
    setDocs((prev) => [doc, ...prev]);
    setShowCreate(false);
    setNewTitle(""); setNewDesc(""); setNewType("ri");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Document créé", "Le brouillon a été créé. Vous pouvez maintenant le compléter et le soumettre pour approbation.");
  };

  const TABS: { key: TabType; label: string }[] = [
    { key: "tous", label: "Tous" },
    { key: "statuts", label: "Statuts" },
    { key: "ri", label: "Règl. Intérieur" },
    { key: "circulaire", label: "Circulaires" },
    { key: "charte", label: "Chartes" },
    { key: "accord", label: "Accords" },
    ...(isAdmin ? [{ key: "revision" as TabType, label: "En révision" }] : []),
    { key: "versions" as TabType, label: "Historique" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Règlements & Statuts</Text>
            <Text style={styles.headerSub}>Documents réglementaires officiels</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity style={styles.addBtn} onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.statsRow}>
          {[
            { icon: "file-text" as const, val: publishedCount, label: "Publiés" },
            { icon: "edit-3" as const, val: revisionCount, label: "En révision" },
            { icon: "download" as const, val: totalDownloads, label: "Téléchargements" },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Feather name={s.icon} size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLab}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Rechercher un règlement, statut, circulaire..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, { backgroundColor: tab === t.key ? colors.primary : colors.muted }]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "versions" ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.vhTitle, { color: colors.foreground }]}>Historique des révisions</Text>
          <Text style={[styles.vhSub, { color: colors.mutedForeground }]}>Toutes les versions des documents réglementaires depuis la création du syndicat.</Text>
          {[
            {
              doc: "Statuts du Syndicat",
              color: "#7c3aed",
              versions: [
                { v: "v4.2", date: "2024-01-15", author: "Bureau National", note: "Révision complète post-AG extraordinaire. Ajout des clauses numériques.", status: "current" },
                { v: "v4.1", date: "2023-06-10", author: "Commission Juridique", note: "Amendement articles 18 et 24 sur la durée des mandats.", status: "archived" },
                { v: "v4.0", date: "2022-12-01", author: "Bureau National", note: "Refonte majeure — adaptation Code du Travail 2022.", status: "archived" },
                { v: "v3.2", date: "2021-03-15", author: "Commission Juridique", note: "Ajout des dispositions sur le télétravail syndical.", status: "archived" },
              ],
            },
            {
              doc: "Règlement Intérieur — Bureau National",
              color: "#3b82f6",
              versions: [
                { v: "v3.1", date: "2024-02-01", author: "F.Z. El Alami", note: "Intégration des nouvelles procédures de vote électronique.", status: "current" },
                { v: "v3.0", date: "2023-01-10", author: "Bureau National", note: "Refonte complète des procédures de délégation.", status: "archived" },
                { v: "v2.1", date: "2021-07-20", author: "Secrétariat Général", note: "Correction des articles sur les conflits d'intérêt.", status: "archived" },
              ],
            },
            {
              doc: "Charte Éthique et Déontologique",
              color: "#10b981",
              versions: [
                { v: "v2.0", date: "2023-09-01", author: "Commission Éthique", note: "Refonte pour inclusion des dispositions anti-harcèlement.", status: "current" },
                { v: "v1.0", date: "2020-01-15", author: "Bureau Fondateur", note: "Version initiale adoptée à l'AG constitutive.", status: "archived" },
              ],
            },
            {
              doc: "Accord Collectif — Conditions de Travail",
              color: "#f59e0b",
              versions: [
                { v: "v1.0", date: "2025-03-15", author: "Bureau de Négociation", note: "Premier accord collectif signé avec le Ministère.", status: "current" },
              ],
            },
          ].map((group) => (
            <View key={group.doc} style={[styles.vhGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.vhGroupHeader, { borderBottomColor: colors.border }]}>
                <View style={[styles.vhGroupDot, { backgroundColor: group.color }]} />
                <Text style={[styles.vhGroupTitle, { color: colors.foreground }]}>{group.doc}</Text>
              </View>
              {group.versions.map((ver, i) => (
                <View key={ver.v}>
                  {i > 0 ? <View style={[styles.vhSep, { backgroundColor: colors.border }]} /> : null}
                  <View style={styles.vhRow}>
                    <View style={styles.vhTimeline}>
                      <View style={[styles.vhDot, { backgroundColor: ver.status === "current" ? group.color : colors.border, borderColor: colors.card }]} />
                      {i < group.versions.length - 1 ? <View style={[styles.vhLine, { backgroundColor: colors.border }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 16 }}>
                      <View style={styles.vhVerRow}>
                        <View style={[styles.vhVerBadge, { backgroundColor: ver.status === "current" ? group.color + "18" : colors.muted }]}>
                          <Text style={[styles.vhVerText, { color: ver.status === "current" ? group.color : colors.mutedForeground }]}>{ver.v}</Text>
                        </View>
                        {ver.status === "current" && (
                          <View style={[styles.vhCurrentBadge, { backgroundColor: "#10b98118" }]}>
                            <Text style={[styles.vhCurrentText, { color: "#10b981" }]}>Actuelle</Text>
                          </View>
                        )}
                        <Text style={[styles.vhDate, { color: colors.mutedForeground }]}>{ver.date}</Text>
                      </View>
                      <Text style={[styles.vhAuthor, { color: colors.mutedForeground }]}>Par {ver.author}</Text>
                      <Text style={[styles.vhNote, { color: colors.foreground }]}>{ver.note}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="book-open" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun document trouvé</Text>
          </View>
        }
        renderItem={({ item: d }) => {
          const typeCfg = TYPE_CONFIG[d.type];
          const statusCfg = STATUS_CONFIG[d.status];
          return (
            <TouchableOpacity
              style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelected(d); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={styles.docTop}>
                <View style={[styles.docIcon, { backgroundColor: typeCfg.color + "15" }]}>
                  <Feather name={typeCfg.icon} size={22} color={typeCfg.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.docBadges}>
                    <View style={[styles.typeBadge, { backgroundColor: typeCfg.color + "15" }]}>
                      <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "15" }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
                      <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.docTitle, { color: colors.foreground }]} numberOfLines={2}>{d.title}</Text>
                </View>
              </View>

              <View style={styles.docMeta}>
                <View style={styles.metaItem}>
                  <Feather name="tag" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{d.version}</Text>
                </View>
                {d.publishedDate ? (
                  <View style={styles.metaItem}>
                    <Feather name="calendar" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{d.publishedDate}</Text>
                  </View>
                ) : (
                  <View style={styles.metaItem}>
                    <Feather name="edit-3" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Màj: {d.updatedDate}</Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Feather name="file-text" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{d.pages} pages</Text>
                </View>
                {d.downloads > 0 && (
                  <View style={styles.metaItem}>
                    <Feather name="download" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{d.downloads}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.docDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{d.description}</Text>

              {d.tags.length > 0 && (
                <View style={styles.tagRow}>
                  {d.tags.map((tag) => (
                    <View key={tag} style={[styles.tag, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.docActions}>
                <TouchableOpacity
                  style={[styles.docActionBtn, { backgroundColor: colors.muted }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert("Téléchargement", `"${d.title}" téléchargé en PDF (mode démo).`);
                  }}
                >
                  <Feather name="download" size={14} color={colors.primary} />
                  <Text style={[styles.docActionText, { color: colors.primary }]}>PDF</Text>
                </TouchableOpacity>
                {d.status === "published" && (
                  <TouchableOpacity
                    style={[styles.docActionBtn, { backgroundColor: colors.muted }]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      Alert.alert("Partager", `Lien de partage copié pour "${d.title}" (mode démo).`);
                    }}
                  >
                    <Feather name="share-2" size={14} color="#6366f1" />
                    <Text style={[styles.docActionText, { color: "#6366f1" }]}>Partager</Text>
                  </TouchableOpacity>
                )}
                {isAdmin && (d.status === "draft" || d.status === "revision") && (
                  <TouchableOpacity
                    style={[styles.docActionBtn, { backgroundColor: "#10b98115" }]}
                    onPress={(e) => { e.stopPropagation?.(); handlePublish(d.id); }}
                  >
                    <Feather name="check-circle" size={14} color="#10b981" />
                    <Text style={[styles.docActionText, { color: "#10b981" }]}>Publier</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (() => {
          const d = selected;
          const typeCfg = TYPE_CONFIG[d.type];
          const statusCfg = STATUS_CONFIG[d.status];
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: typeCfg.color }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.modalTitle} numberOfLines={2}>{d.title}</Text>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
                <View style={styles.docBadges}>
                  <View style={[styles.typeBadge, { backgroundColor: typeCfg.color + "15" }]}>
                    <Feather name={typeCfg.icon} size={12} color={typeCfg.color} />
                    <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "15" }]}>
                    <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                  </View>
                  <Text style={[styles.versionTag, { color: colors.mutedForeground, borderColor: colors.border }]}>{d.version}</Text>
                </View>

                <View style={[styles.infoGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "user" as const, label: "Auteur", value: d.author },
                    { icon: "check-circle" as const, label: "Approuvé par", value: d.approvedBy },
                    { icon: "calendar" as const, label: "Publication", value: d.publishedDate || "Non publié" },
                    { icon: "edit-3" as const, label: "Dernière mise à jour", value: d.updatedDate },
                    { icon: "file-text" as const, label: "Nombre de pages", value: `${d.pages} pages` },
                    { icon: "download" as const, label: "Téléchargements", value: d.downloads.toString() },
                  ].map(({ icon, label, value }, i) => (
                    <View key={label}>
                      {i > 0 && <View style={[styles.infoSep, { backgroundColor: colors.border }]} />}
                      <View style={styles.infoRow}>
                        <View style={[styles.infoIcon, { backgroundColor: typeCfg.color + "15" }]}>
                          <Feather name={icon} size={13} color={typeCfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
                          <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={[styles.descTitle, { color: colors.foreground }]}>Description</Text>
                  <Text style={[styles.descText, { color: colors.mutedForeground }]}>{d.description}</Text>
                </View>

                {d.tags.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text style={[styles.descTitle, { color: colors.foreground }]}>Tags</Text>
                    <View style={styles.tagRow}>
                      {d.tags.map((tag) => (
                        <View key={tag} style={[styles.tag, { backgroundColor: typeCfg.color + "12" }]}>
                          <Text style={[styles.tagText, { color: typeCfg.color }]}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("PDF téléchargé", `"${d.title}" (${d.pages} pages) a été sauvegardé dans vos documents.`); }}
                  >
                    <Feather name="download" size={18} color="#fff" />
                    <Text style={styles.modalActionBtnText}>Télécharger PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: colors.muted }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Lien copié", "Le lien de partage du document a été copié dans le presse-papiers."); }}
                  >
                    <Feather name="share-2" size={18} color={colors.foreground} />
                    <Text style={[styles.modalActionBtnText, { color: colors.foreground }]}>Partager</Text>
                  </TouchableOpacity>
                </View>

                {isAdmin && (d.status === "draft" || d.status === "revision") && (
                  <TouchableOpacity
                    style={[styles.publishBtn, { backgroundColor: "#10b981" }]}
                    onPress={() => { handlePublish(d.id); setSelected(null); }}
                  >
                    <Feather name="check-circle" size={18} color="#fff" />
                    <Text style={styles.publishBtnText}>Publier ce document</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.primary }]}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nouveau Document</Text>
            <TouchableOpacity onPress={handleCreateDoc}>
              <Text style={styles.modalSave}>Créer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Titre *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Règlement Intérieur 2026"
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type de document</Text>
              <View style={styles.typeGrid}>
                {(Object.entries(TYPE_CONFIG) as [DocType, typeof TYPE_CONFIG["statuts"]][]).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.typeOption, {
                      backgroundColor: newType === key ? cfg.color + "15" : colors.muted,
                      borderColor: newType === key ? cfg.color : colors.border,
                    }]}
                    onPress={() => { setNewType(key); Haptics.selectionAsync(); }}
                  >
                    <Feather name={cfg.icon} size={16} color={newType === key ? cfg.color : colors.mutedForeground} />
                    <Text style={[styles.typeOptionText, { color: newType === key ? cfg.color : colors.mutedForeground }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Décrivez le contenu et l'objectif de ce document..."
                placeholderTextColor={colors.mutedForeground}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, padding: 14 },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  statLab: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", textAlign: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  tabBar: { flexShrink: 0, borderBottomWidth: 1 },
  tabContent: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  docCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  docTop: { flexDirection: "row", gap: 12 },
  docIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  docBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  docTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  docMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  docActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  docActionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  docActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "center", gap: 14 },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  versionTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  infoGrid: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 1 },
  infoSep: { height: 1, marginHorizontal: 14 },
  descTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  modalActions: { flexDirection: "row", gap: 12 },
  modalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  modalActionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  publishBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  publishBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea: { minHeight: 100 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeOption: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  typeOptionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  vhTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  vhSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  vhGroup: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  vhGroupHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1 },
  vhGroupDot: { width: 10, height: 10, borderRadius: 5 },
  vhGroupTitle: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  vhSep: { height: 1, marginHorizontal: 14 },
  vhRow: { flexDirection: "row", paddingLeft: 14, paddingTop: 12 },
  vhTimeline: { width: 20, alignItems: "center", marginRight: 10, paddingTop: 3 },
  vhDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  vhLine: { width: 2, flex: 1, marginTop: 4 },
  vhVerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  vhVerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  vhVerText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  vhCurrentBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  vhCurrentText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  vhDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: "auto" as any },
  vhAuthor: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  vhNote: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
