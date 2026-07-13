import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { cart, removeFromCart, updateCartQty, clearCart } = useData();
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCheckoutDone(true);
    clearCart();
    setTimeout(() => {
      setShowCheckout(false);
      setCheckoutDone(false);
      Alert.alert("Commande confirmée!", "Votre commande a été passée avec succès. Le vendeur sera notifié.", [
        { text: "Voir mes commandes", onPress: () => router.push("/orders") },
        { text: "Continuer", style: "cancel" },
      ]);
    }, 2000);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Mon Panier</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {itemCount} article{itemCount !== 1 ? "s" : ""}
          </Text>
        </View>
        {cart.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Vider le panier", "Supprimer tous les articles?", [
                { text: "Annuler", style: "cancel" },
                { text: "Vider", style: "destructive", onPress: () => { clearCart(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
              ]);
            }}
          >
            <Feather name="trash-2" size={20} color={colors.destructive} />
          </TouchableOpacity>
        )}
      </View>

      {cart.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name="shopping-cart" size={40} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Panier vide</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Ajoutez des produits depuis le marketplace
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/marketplace")}
          >
            <Feather name="shopping-bag" size={16} color="#fff" />
            <Text style={styles.browseBtnText}>Parcourir le marketplace</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={cart}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 160 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.cartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.productIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="package" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[styles.sellerName, { color: colors.mutedForeground }]}>
                    Vendeur: {item.seller}
                  </Text>
                  <Text style={[styles.unitPrice, { color: colors.primary }]}>
                    {item.price} MAD / unité
                  </Text>
                </View>
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: colors.border }]}
                    onPress={() => { updateCartQty(item.id, item.quantity - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Feather name="minus" size={14} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyText, { color: colors.foreground }]}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { borderColor: colors.border }]}
                    onPress={() => { updateCartQty(item.id, item.quantity + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Feather name="plus" size={14} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Text style={[styles.itemTotal, { color: colors.foreground }]}>
                    {(item.price * item.quantity).toLocaleString()} MAD
                  </Text>
                  <TouchableOpacity onPress={() => { removeFromCart(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
                    <Feather name="x" size={18} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListFooterComponent={
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Récapitulatif</Text>
                {cart.map((item) => (
                  <View key={item.id} style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.name} × {item.quantity}
                    </Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                      {(item.price * item.quantity)} MAD
                    </Text>
                  </View>
                ))}
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>{total.toLocaleString()} MAD</Text>
                </View>
              </View>
            }
          />

          <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bottomLabel, { color: colors.mutedForeground }]}>Total à payer</Text>
              <Text style={[styles.bottomTotal, { color: colors.primary }]}>{total.toLocaleString()} MAD</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setShowCheckout(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            >
              <Feather name="credit-card" size={18} color="#fff" />
              <Text style={styles.checkoutBtnText}>Commander</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal visible={showCheckout} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.checkoutModal, { backgroundColor: colors.card }]}>
            {checkoutDone ? (
              <View style={styles.successBox}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Feather name="check-circle" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.foreground }]}>Commande passée!</Text>
                <Text style={[styles.successText, { color: colors.mutedForeground }]}>
                  Votre commande a été envoyée aux vendeurs.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.checkoutHeader}>
                  <Text style={[styles.checkoutTitle, { color: colors.foreground }]}>Confirmer la commande</Text>
                  <TouchableOpacity onPress={() => setShowCheckout(false)}>
                    <Feather name="x" size={22} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.orderSummary, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={styles.orderRow}>
                    <Text style={[styles.orderLabel, { color: colors.mutedForeground }]}>Articles</Text>
                    <Text style={[styles.orderValue, { color: colors.foreground }]}>{itemCount}</Text>
                  </View>
                  <View style={styles.orderRow}>
                    <Text style={[styles.orderLabel, { color: colors.mutedForeground }]}>Livraison</Text>
                    <Text style={[styles.orderValue, { color: colors.success }]}>Gratuite</Text>
                  </View>
                  <View style={[styles.orderDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.orderRow}>
                    <Text style={[styles.orderTotalLabel, { color: colors.foreground }]}>Total</Text>
                    <Text style={[styles.orderTotalValue, { color: colors.primary }]}>{total.toLocaleString()} MAD</Text>
                  </View>
                </View>
                <View style={[styles.payMethod, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="credit-card" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payMethodLabel, { color: colors.foreground }]}>Paiement à la livraison</Text>
                    <Text style={[styles.payMethodSub, { color: colors.mutedForeground }]}>Mode démo — Aucun prélèvement réel</Text>
                  </View>
                  <Feather name="check-circle" size={18} color={colors.primary} />
                </View>
                <View style={styles.checkoutBtns}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    onPress={() => setShowCheckout(false)}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                    onPress={handleCheckout}
                  >
                    <Text style={styles.confirmBtnText}>Confirmer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  browseBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  browseBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  cartCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  productIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  sellerName: { fontSize: 11, fontFamily: "Inter_400Regular" },
  unitPrice: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center" },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 14, fontFamily: "Inter_700Bold", minWidth: 20, textAlign: "center" },
  itemTotal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  summaryCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10, marginTop: 4 },
  summaryTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, marginEnd: 8 },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryDivider: { height: 1, marginVertical: 4 },
  totalLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, gap: 16 },
  bottomLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bottomTotal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  checkoutBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  checkoutBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  checkoutModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 20 },
  checkoutHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkoutTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  orderSummary: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 12 },
  orderRow: { flexDirection: "row", justifyContent: "space-between" },
  orderLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  orderValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  orderDivider: { height: 1 },
  orderTotalLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  orderTotalValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  payMethod: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  payMethodLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  payMethodSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  checkoutBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  successBox: { alignItems: "center", gap: 16, paddingVertical: 24 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
