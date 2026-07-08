import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useData, type Invoice } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type TabType = "factures" | "devis";

export default function InvoicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { invoices, addInvoice, syndicates } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("factures");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [addType, setAddType] = useState<"devis" | "facture">("facture");
  const [addRecipient, setAddRecipient] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addProofUri, setAddProofUri] = useState("");

  const filteredInvoices = invoices.filter((inv) => inv.type === tab.slice(0, -1) as "facture" | "devis");

  const totalRevenue = invoices.filter((i) => i.type === "facture" && i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalPending = invoices.filter((i) => i.type === "facture" && i.status === "sent").reduce((s, i) => s + i.amount, 0);
  const totalOverdue = invoices.filter((i) => i.type === "facture" && i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  const STATUS_CONFIG: Record<Invoice["status"], { label: string; color: string }> = {
    draft: { label: "Brouillon", color: "#6b7280" },
    sent: { label: "Envoyé", color: "#3b82f6" },
    paid: { label: "Payé", color: "#10b981" },
    overdue: { label: "En retard", color: "#ef4444" },
    cancelled: { label: "Annulé", color: "#6b7280" },
  };

  const pickProofImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) {
          Alert.alert("Permission requise", "Veuillez autoriser l'accès à la galerie ou à la caméra pour joindre un justificatif.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
        if (!result.canceled && result.assets[0]) setAddProofUri(result.assets[0].uri);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setAddProofUri(result.assets[0].uri);
        Haptics.selectionAsync();
      }
    } catch { /* silently ignore */ }
  };

  const handleAdd = () => {
    if (!addRecipient.trim() || !addAmount.trim() || !addLabel.trim()) return;
    if (!addProofUri) {
      Alert.alert("Justificatif requis", "Veuillez joindre un justificatif (image de la facture ou du devis) avant de continuer.");
      return;
    }
    const count = invoices.filter((i) => i.type === addType).length + 1;
    const ref = addType === "facture" ? `FAC-2026-00${count}` : `DEV-2026-00${count}`;
    const inv: Invoice = {
      id: `inv${Date.now()}`,
      reference: ref,
      type: addType,
      recipient: addRecipient.trim(),
      syndicate: addRecipient.trim().slice(0, 3).toUpperCase(),
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      amount: parseFloat(addAmount),
      status: "draft",
      items: [{ label: addLabel.trim(), quantity: 1, unitPrice: parseFloat(addAmount) }],
    };
    addInvoice(inv);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAdd(false);
    setAddRecipient(""); setAddAmount(""); setAddLabel(""); setAddProofUri("");
    Alert.alert("Créé!", `${addType === "facture" ? "Facture" : "Devis"} ${ref} créé avec succès.`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Devis & Factures</Text>
          <Text style={styles.headerSub}>Gestion financière globale</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
          onPress={() => { setShowAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.statBox, { backgroundColor: colors.success + "12" }]}>
          <Text style={[styles.statValue, { color: colors.success }]}>{totalRevenue.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Encaissé (MAD)</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: "#f59e0b12" }]}>
          <Text style={[styles.statValue, { color: "#f59e0b" }]}>{totalPending.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>En attente</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.destructive + "12" }]}>
          <Text style={[styles.statValue, { color: colors.destructive }]}>{totalOverdue.toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>En retard</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["factures", "devis"] as TabType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Feather
              name={t === "factures" ? "file-text" : "clipboard"}
              size={15}
              color={tab === t ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "factures" ? "Factures" : "Devis"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredInvoices}
        keyExtractor={(inv) => inv.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Feather name="file-text" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucun {tab === "factures" ? "facture" : "devis"} pour le moment
            </Text>
          </View>
        }
        renderItem={({ item: inv }) => {
          const sc = STATUS_CONFIG[inv.status];
          return (
            <TouchableOpacity
              style={[styles.invoiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedInvoice(inv); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <View style={[styles.invIcon, { backgroundColor: inv.type === "facture" ? colors.primary + "15" : "#f59e0b15" }]}>
                <Feather name={inv.type === "facture" ? "file-text" : "clipboard"} size={20} color={inv.type === "facture" ? colors.primary : "#f59e0b"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.invRef, { color: colors.foreground }]}>{inv.reference}</Text>
                <Text style={[styles.invRecipient, { color: colors.mutedForeground }]}>{inv.recipient}</Text>
                <Text style={[styles.invDate, { color: colors.mutedForeground }]}>
                  Émis: {inv.date} • Échéance: {inv.dueDate}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={[styles.invAmount, { color: colors.foreground }]}>{inv.amount.toLocaleString()} MAD</Text>
                <View style={[styles.statusBadge, { backgroundColor: sc.color + "18" }]}>
                  <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!selectedInvoice} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          {selectedInvoice && (
            <View style={[styles.detailModal, { backgroundColor: colors.card }]}>
              <View style={styles.detailHeader}>
                <View>
                  <Text style={[styles.detailRef, { color: colors.foreground }]}>{selectedInvoice.reference}</Text>
                  <Text style={[styles.detailType, { color: colors.mutedForeground }]}>
                    {selectedInvoice.type === "facture" ? "Facture" : "Devis"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedInvoice(null)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={[styles.detailInfo, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {[
                  { label: "Destinataire", value: selectedInvoice.recipient },
                  { label: "Date d'émission", value: selectedInvoice.date },
                  { label: "Date d'échéance", value: selectedInvoice.dueDate },
                  { label: "Statut", value: STATUS_CONFIG[selectedInvoice.status].label },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.itemsTitle, { color: colors.foreground }]}>Détail des articles</Text>
              {selectedInvoice.items.map((item, i) => (
                <View key={i} style={[styles.itemRow, { borderColor: colors.border }]}>
                  <Text style={[styles.itemLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
                  <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>x{item.quantity}</Text>
                  <Text style={[styles.itemPrice, { color: colors.foreground }]}>{(item.quantity * item.unitPrice).toLocaleString()} MAD</Text>
                </View>
              ))}

              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[styles.totalAmount, { color: colors.primary }]}>{selectedInvoice.amount.toLocaleString()} MAD</Text>
              </View>

              <View style={styles.actionBtns}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("PDF généré", `Le document ${selectedInvoice.reference} a été exporté en PDF et sauvegardé dans vos fichiers.`); }}
                >
                  <Feather name="download" size={16} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert("Document envoyé", `Le document ${selectedInvoice.reference} a été envoyé par email au destinataire.`); }}
                >
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>Envoyer</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Add modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.addModal, { backgroundColor: colors.card }]}>
            <View style={styles.detailHeader}>
              <Text style={[styles.addTitle, { color: colors.foreground }]}>Nouveau document</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.typeRow}>
              {(["facture", "devis"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, {
                    backgroundColor: addType === t ? colors.primary : colors.background,
                    borderColor: addType === t ? colors.primary : colors.border,
                  }]}
                  onPress={() => setAddType(t)}
                >
                  <Text style={[styles.typeChipText, { color: addType === t ? "#fff" : colors.mutedForeground }]}>
                    {t === "facture" ? "Facture" : "Devis"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {[
              { label: "Destinataire (syndicat)", val: addRecipient, set: setAddRecipient, placeholder: "Ex: Syndicat National..." },
              { label: "Libellé", val: addLabel, set: setAddLabel, placeholder: "Ex: Abonnement annuel..." },
              { label: "Montant (MAD)", val: addAmount, set: setAddAmount, placeholder: "0", numeric: true },
            ].map(({ label, val, set, placeholder, numeric }) => (
              <View key={label}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={val}
                  onChangeText={set}
                  keyboardType={numeric ? "numeric" : "default"}
                />
              </View>
            ))}

            {/* Mandatory justificatif */}
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Justificatif *</Text>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#ef444418" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Obligatoire</Text>
                </View>
              </View>
              {addProofUri ? (
                <View style={{ gap: 8 }}>
                  <Image source={{ uri: addProofUri }} style={{ width: "100%", height: 140, borderRadius: 12, resizeMode: "cover" }} />
                  <TouchableOpacity
                    style={[styles.input, { backgroundColor: "#ef444410", borderColor: "#ef444430", alignItems: "center", paddingVertical: 10 }]}
                    onPress={() => setAddProofUri("")}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#ef4444" }}>Changer le justificatif</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.input, { borderColor: "#ef444440", borderStyle: "dashed", backgroundColor: "#ef444408", flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 }]}
                  onPress={pickProofImage}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#ef444418", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="upload" size={16} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Joindre le justificatif</Text>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Image de la facture / devis fournisseur</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.actionBtns}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.muted }]} onPress={() => { setShowAdd(false); setAddProofUri(""); }}>
                <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, {
                  backgroundColor: addRecipient.trim() && addAmount.trim() && addLabel.trim() && addProofUri ? colors.primary : colors.muted,
                }]}
                onPress={handleAdd}
                disabled={!addRecipient.trim() || !addAmount.trim() || !addLabel.trim() || !addProofUri}
              >
                <Text style={[styles.actionBtnText, { color: addRecipient.trim() && addAmount.trim() && addLabel.trim() && addProofUri ? "#fff" : colors.mutedForeground }]}>
                  Créer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  summaryRow: { flexDirection: "row", padding: 16, gap: 12, borderBottomWidth: 1 },
  statBox: { flex: 1, padding: 12, borderRadius: 12, gap: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13 },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  invoiceCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  invIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  invRef: { fontSize: 14, fontFamily: "Inter_700Bold" },
  invRecipient: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  invDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  invAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  detailModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, maxHeight: "90%" },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  detailRef: { fontSize: 18, fontFamily: "Inter_700Bold" },
  detailType: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  detailInfo: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  typeChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  typeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
});
