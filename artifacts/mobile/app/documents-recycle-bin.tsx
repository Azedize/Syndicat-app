/**
 * documents-recycle-bin.tsx — Recycle Bin for soft-deleted documents.
 *
 * Admin-only. List / search / filter soft-deleted documents, restore them, or
 * (super_admin only) permanently purge them. Restore is available to
 * syndicate_admin + super_admin; purge is super_admin only (matches backend RBAC).
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
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

interface DeletedDoc {
  id: string;
  title: string;
  category: string;
  status: string;
  size: string;
  documentNumber: string;
  deletedAt: string;
  deletedByName: string | null;
  retentionUntil: string | null;
}

const CAT_LABELS: Record<string, string> = {
  statuts: "Statuts", reglements: "Règlements", pv: "PV",
  juridique: "Juridique", finances: "Finances", attestation: "Attestations",
};

export default function DocumentsRecycleBin() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refreshDocuments } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isSuperAdmin = user?.role === "super_admin";

  const [items, setItems] = useState<DeletedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await docsApi.deleted({ search: q })) as { data: DeletedDoc[] };
      setItems(res.data ?? []);
    } catch {
      Alert.alert("Erreur", "Impossible de charger la corbeille.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (doc: DeletedDoc) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusyId(doc.id);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.restore(doc.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItems((prev) => prev.filter((d) => d.id !== doc.id));
      await refreshDocuments().catch(() => {});
      Alert.alert("Document restauré", `"${doc.title}" a été restauré.`);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Erreur", err?.message ?? "Impossible de restaurer ce document.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = (doc: DeletedDoc) => {
    Alert.alert(
      "Suppression définitive",
      `"${doc.title}" sera définitivement supprimé (fichier PDF et historique). Cette action est irréversible.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer définitivement",
          style: "destructive",
          onPress: async () => {
            setBusyId(doc.id);
            try {
              const { documents: docsApi } = await import("@/services/api");
              await docsApi.purge(doc.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setItems((prev) => prev.filter((d) => d.id !== doc.id));
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Erreur", err?.message ?? "Impossible de purger ce document.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Corbeille</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{items.length} document(s) supprimé(s)</Text>
        </View>
        <Feather name="trash-2" size={20} color={colors.mutedForeground} />
      </View>

      <View style={[styles.searchWrap, { margin: 12, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Rechercher dans la corbeille..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={(v) => { setSearch(v); load(v); }}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="trash-2" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>La corbeille est vide</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                  {CAT_LABELS[item.category] ?? item.category} · {item.size} · Supprimé le {new Date(item.deletedAt).toLocaleDateString("fr-FR")}
                  {item.deletedByName ? ` par ${item.deletedByName}` : ""}
                </Text>
                {item.retentionUntil ? (
                  <Text style={[styles.cardMeta, { color: colors.mutedForeground, marginTop: 2 }]}>
                    Conservation légale jusqu'au {new Date(item.retentionUntil).toLocaleDateString("fr-FR")}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  disabled={busyId === item.id}
                  onPress={() => handleRestore(item)}
                >
                  {busyId === item.id ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="rotate-ccw" size={14} color="#fff" />}
                </TouchableOpacity>
                {isSuperAdmin ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                    disabled={busyId === item.id}
                    onPress={() => handlePurge(item)}
                  >
                    <Feather name="x" size={14} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  title:       { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  searchWrap:  { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText:   { fontSize: 14, fontFamily: "Inter_400Regular" },
  card:        { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  cardTitle:   { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  cardMeta:    { fontSize: 11, fontFamily: "Inter_400Regular" },
  actionBtn:   { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
