import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Product } from "@/context/DataContext";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

export default function ProductCard({ product, onPress }: ProductCardProps) {
  const colors = useColors();
  const isAvailable = product.status === "approved";
  const isPending = product.status === "pending_review";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.imageBox, { backgroundColor: colors.muted }]}>
        <Feather name="package" size={28} color={colors.mutedForeground} />
      </View>
      <View style={styles.content}>
        <View style={[styles.categoryBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.categoryText, { color: colors.secondaryForeground }]}>
            {product.category}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={[styles.seller, { color: colors.mutedForeground }]} numberOfLines={1}>
          {product.seller}
        </Text>
        <View style={styles.footer}>
          <Text style={[styles.price, { color: colors.primary }]}>
            {product.price} MAD
          </Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isPending
                  ? "#f59e0b18"
                  : isAvailable
                  ? "#10b98118"
                  : "#ef444418",
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: isPending ? "#f59e0b" : isAvailable ? "#10b981" : "#ef4444",
                },
              ]}
            >
              {isPending ? "En validation" : isAvailable ? "Disponible" : "Épuisé"}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  imageBox: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 12,
    gap: 5,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  name: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  seller: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  price: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});
