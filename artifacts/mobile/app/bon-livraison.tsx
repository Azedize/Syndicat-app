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
import { useData, type BonLivraison } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";

type FilterType = "all" | "sortie" | "entree";

const STATUS_CONFIG: Record<BonLivraison["status"], { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "#6b7280" },
  sent: { label: "Expédié", color: "#3b82f6" },
  delivered: { label: "Livré", color: "#10b981" },
  cancelled: { label: "Annulé", color: "#ef4444" },
};

export default function BonLivraisonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { bonsLivraison, addBonLivraison, updateBonLivraisonStatus } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [filter, setFilter] = useState<FilterType>("all");
  const [selected, setSelected] = useState<BonLivraison | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [newRecipient, setNewRecipient] = useState("");
  const [newType, setNewType] = useState<"sortie" | "entree">("sortie");
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemPrice, setNewItemPrice] = useState("");

  const isAdmin = user?.role !== "member";
  const { showToast } = useToast();

  const filtered = bonsLivraison.filter((bl) => filter === "all" || bl.type === filter);
  const totalSortie = bonsLivraison.filter((b) => b.type === "sortie" && b.status === "delivered").reduce((s, b) => s + b.total, 0);
  const totalEntree = bonsLivraison.filter((b) => b.type === "entree" && b.status === "delivered").reduce((s, b) => s + b.total, 0);
  const pending = bonsLivraison.filter((b) => b.status === "draft" || b.status === "sent").length;

  const handleAdd = () => {
    if (!newRecipient.trim() || !newItemLabel.trim() || !newItemPrice.trim()) return;
    const qty = parseInt(newItemQty) || 1;
    const price = parseFloat(newItemPrice) || 0;
    const total = qty * price;
    const count = bonsLivraison.length + 1;
    const newBl: BonLivraison = {
      id: `bl${Date.now()}`,
      reference: `BL-2026-00${count}`,
      recipient: newRecipient.trim(),
      date: new Date().toISOString().slice(0, 10),
      items: [{ label: newItemLabel.trim(), quantity: qty, unitPrice: price }],
      total,
      status: "draft",
      type: newType,
    };
    addBonLivraison(newBl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdd(false);
    setNewRecipient(""); setNewItemLabel(""); setNewItemQty("1"); setNewItemPrice("");
    showToast({ type: "success", title: "Créé !", message: `Bon de livraison ${newBl.reference} créé avec succès.` });
  };

  const handleStatusChange = (bl: BonLivraison) => {
    const nextStatus: Record<BonLivraison["status"], BonLivraison["status"]> = {
      draft: "sent",
      sent: "delivered",
      delivered: "delivered",
      cancelled: "cancelled",
    };
    const next = nextStatus[bl.status];
    if (next === bl.status) return;
    const labels: Record<BonLivraison["status"], string> = {
      draft: "Marquer comme expédié",
      sent: "Confirmer la livraison",
      delivered: "Déjà livré",
      cancelled: "Annulé",
    };
    Alert.alert(labels[bl.status], `${bl.reference} — ${bl.recipient}`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer",
        onPress: () => {
          updateBonLivraisonStatus(bl.id, next);
          setSelected(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bons de Livraison</Text>
          <Text style={styles.headerSub}>Gestion des entrées et sorties</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
            onPress={() => { setShowAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Sorties livrées", value: `${totalSortie.toLocaleString()} MAD`, icon: "arrow-up-right" as const, color: "#ef4444" },
          { label: "Entrées reçues", value: `${totalEntree.toLocaleString()} MAD`, icon: "arrow-down-left" as const, color: "#10b981" },
          { label: "En attente", value: `${pending} BL`, icon: "clock" as const, color: "#f59e0b" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
            <View style={[styles.statIcon, { backgroundColor: s.color + "18" }]}>
              <Feather name={s.icon} size={14} color={s.color} />
            </View>
            <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter chips */}
      <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "all", label: "Tous", icon: "list" as const },
          { key: "sortie", label: "Sorties", icon: "arrow-up-right" as const },
          { key: "entree", label: "Entrées", icon: "arrow-down-left" as const },
        ] as { key: FilterType; label: string; icon: keyof typeof Feather.glyphMap }[]).map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              filter === f.key && { backgroundColor: colors.primary, borderColor: colors.primary },
              filter !== f.key && { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
          >
            <Feather name={f.icon} size={13} color={filter === f.key ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.filterChipText, { color: filter === f.key ? "#fff" : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(bl) => bl.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Feather name="package" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucun bon de livraison
            </Text>
          </View>
        }
        renderItem={({ item: bl }) => {
          const sc = STATUS_CONFIG[bl.status];
          const isOut = bl.type === "sortie";
          return (
            <TouchableOpacity
              style={[styles.blCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelected(bl); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={[styles.blTypeIcon, { backgroundColor: (isOut ? "#ef4444" : "#10b981") + "15" }]}>
                <Feather
                  name={isOut ? "arrow-up-right" : "arrow-down-left"}
                  size={20}
                  color={isOut ? "#ef4444" : "#10b981"}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.blRefRow}>
                  <Text style={[styles.blRef, { color: colors.foreground }]}>{bl.reference}</Text>
                  <View style={[styles.blTypeBadge, { backgroundColor: (isOut ? "#ef4444" : "#10b981") + "15" }]}>
                    <Text style={[styles.blTypeBadgeText, { color: isOut ? "#ef4444" : "#10b981" }]}>
                      {isOut ? "Sortie" : "Entrée"}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.blRecipient, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {bl.recipient}
                </Text>
                <View style={styles.blMeta}>
                  <Feather name="calendar" size={10} color={colors.mutedForeground} />
                  <Text style={[styles.blMetaText, { color: colors.mutedForeground }]}>{bl.date}</Text>
                  <Text style={[styles.blMetaDot, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.blMetaText, { color: colors.mutedForeground }]}>
                    {bl.items.length} article{bl.items.length > 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={[styles.blTotal, { color: colors.foreground }]}>
                  {bl.total.toLocaleString()} MAD
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: sc.color + "18" }]}>
                  <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          {selected && (
            <View style={[styles.detailModal, { backgroundColor: colors.card }]}>
              <View style={styles.modalHandle} />
              <View style={styles.detailHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailRef, { color: colors.foreground }]}>{selected.reference}</Text>
                  <View style={styles.detailTypRow}>
                    <View style={[styles.blTypeBadge, { backgroundColor: (selected.type === "sortie" ? "#ef4444" : "#10b981") + "15" }]}>
                      <Text style={[styles.blTypeBadgeText, { color: selected.type === "sortie" ? "#ef4444" : "#10b981" }]}>
                        {selected.type === "sortie" ? "Sortie" : "Entrée"}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[selected.status].color + "18" }]}>
                      <Text style={[styles.statusText, { color: STATUS_CONFIG[selected.status].color }]}>
                        {STATUS_CONFIG[selected.status].label}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={[styles.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {[
                  { label: "Destinataire/Fournisseur", value: selected.recipient },
                  { label: "Date", value: selected.date },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.itemsTitle, { color: colors.foreground }]}>Articles</Text>
              {selected.items.map((item, i) => (
                <View key={i} style={[styles.itemRow, { borderColor: colors.border }]}>
                  <Text style={[styles.itemLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
                  <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>x{item.quantity}</Text>
                  <Text style={[styles.itemPrice, { color: colors.foreground }]}>
                    {(item.quantity * item.unitPrice).toLocaleString()} MAD
                  </Text>
                </View>
              ))}

              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[styles.totalAmount, { color: colors.primary }]}>
                  {selected.total.toLocaleString()} MAD
                </Text>
              </View>

              <View style={styles.actionBtns}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    showToast({ type: "info", title: "PDF généré", message: `Le bon de livraison ${selected.reference} a été exporté en PDF et sauvegardé dans vos documents.` });
                  }}
                >
                  <Feather name="download" size={15} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>PDF</Text>
                </TouchableOpacity>
                {isAdmin && selected.status !== "delivered" && selected.status !== "cancelled" && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleStatusChange(selected)}
                  >
                    <Feather name="check-circle" size={15} color="#fff" />
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                      {selected.status === "draft" ? "Expédier" : "Confirmer livraison"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Add Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={[styles.addModal, { backgroundColor: colors.card }]}>
              <View style={styles.modalHandle} />
              <View style={styles.detailHeader}>
                <Text style={[styles.addTitle, { color: colors.foreground }]}>Nouveau bon de livraison</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={styles.typeRow}>
                {(["sortie", "entree"] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: newType === t ? (t === "sortie" ? "#ef4444" : "#10b981") : colors.background,
                        borderColor: newType === t ? (t === "sortie" ? "#ef4444" : "#10b981") : colors.border,
                      },
                    ]}
                    onPress={() => setNewType(t)}
                  >
                    <Feather name={t === "sortie" ? "arrow-up-right" : "arrow-down-left"} size={14} color={newType === t ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.typeChipText, { color: newType === t ? "#fff" : colors.mutedForeground }]}>
                      {t === "sortie" ? "Sortie" : "Entrée"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {[
                { label: "Destinataire / Fournisseur *", val: newRecipient, set: setNewRecipient, placeholder: "Ex: Bureau Régional..." },
                { label: "Article principal *", val: newItemLabel, set: setNewItemLabel, placeholder: "Ex: Ramettes de papier A4..." },
              ].map(({ label, val, set, placeholder }) => (
                <View key={label} style={{ gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={val}
                    onChangeText={set}
                  />
                </View>
              ))}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Quantité</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                    placeholder="1"
                    placeholderTextColor={colors.mutedForeground}
                    value={newItemQty}
                    onChangeText={setNewItemQty}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Prix unitaire (MAD)</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    value={newItemPrice}
                    onChangeText={setNewItemPrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {newItemQty && newItemPrice ? (
                <View style={[styles.previewTotal, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                  <Text style={[styles.previewTotalText, { color: colors.primary }]}>
                    Total estimé: {((parseInt(newItemQty) || 0) * (parseFloat(newItemPrice) || 0)).toLocaleString()} MAD
                  </Text>
                </View>
              ) : null}

              <View style={styles.actionBtns}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                  onPress={() => setShowAdd(false)}
                >
                  <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, {
                    backgroundColor: newRecipient.trim() && newItemLabel.trim() && newItemPrice.trim()
                      ? colors.primary : colors.muted,
                  }]}
                  onPress={handleAdd}
                  disabled={!newRecipient.trim() || !newItemLabel.trim() || !newItemPrice.trim()}
                >
                  <Text style={[styles.actionBtnText, {
                    color: newRecipient.trim() && newItemLabel.trim() && newItemPrice.trim() ? "#fff" : colors.mutedForeground,
                  }]}>
                    Créer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", borderBottomWidth: 1 },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  statLab: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  filterRow: { flexDirection: "row", gap: 10, padding: 12, borderBottomWidth: 1 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  blCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  blTypeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  blRefRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  blRef: { fontSize: 14, fontFamily: "Inter_700Bold" },
  blTypeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  blTypeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  blRecipient: { fontSize: 12, fontFamily: "Inter_500Medium" },
  blMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  blMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  blMetaDot: { fontSize: 11 },
  blTotal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#d1d5db", alignSelf: "center", marginBottom: 16 },
  detailModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, maxHeight: "90%" },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  detailRef: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 6 },
  detailTypRow: { flexDirection: "row", gap: 8 },
  infoBox: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },
  itemsTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  itemLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  itemPrice: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 80, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  addModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  addTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  previewTotal: { borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
  previewTotalText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
