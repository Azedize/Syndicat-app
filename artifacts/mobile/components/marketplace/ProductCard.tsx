import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { RADIUS } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { crossPlatformShadow } from "@/lib/shadow";
import { listingImages, resolveMediaUrl } from "@/lib/media";
import { categoryIcon, categoryLabelKey, conditionLabelKey } from "./catalog";

export type MarketProduct = {
  id: string;
  name: string;
  price: string;
  originalPrice?: string | null;
  category: string;
  condition?: string | null;
  imageUrls?: string | null;
  building?: string | null;
  sellerName?: string | null;
  sellerVerifiedResident?: boolean;
  negotiable?: boolean | null;
  status?: string | null;
  reservedByMe?: boolean;
  featured?: boolean | null;
  /** From another residence (« all residences »): its city is shown. */
  otherResidence?: boolean;
  residenceCity?: string | null;
};

interface Props {
  product: MarketProduct;
  ticket: string | null;
  onPress: () => void;
  /** large: the « À la une » carousel */
  size?: "grid" | "large";
  style?: StyleProp<ViewStyle>;
}

/** « Résidence X — Bâtiment A » → « Bâtiment A »: the residence is already the screen's title. */
const shortBuilding = (name: string) => name.split(" — ").pop()!.trim();
const buildingLabel = (name: string, t: (k: string) => string) => {
  const short = shortBuilding(name);
  return /^(bâtiment|batiment|immeuble|bloc|tour|building|عمارة)(\s|$)/i.test(short) ? short : t("mkBuildingShort").replace("{b}", short);
};

/** A listing as a neighbour sees it: the photo first, then the price, then who and where. */
export default function ProductCard({ product: p, ticket, onPress, size = "grid", style }: Props) {
  const colors = useColors();
  const { t } = useLanguage();
  const fmt = useFormat();
  const cover = resolveMediaUrl(listingImages(p.imageUrls)[0], ticket);
  const reserved = p.status === "reserved";
  const discount =
    p.originalPrice && Number(p.originalPrice) > Number(p.price)
      ? Math.round((1 - Number(p.price) / Number(p.originalPrice)) * 100)
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${fmt.money(p.price, { decimals: 0 })}${reserved ? `, ${t("mkReserved")}` : ""}`}
      style={({ pressed }) => [
        styles.card,
        size === "large" && styles.large,
        { backgroundColor: colors.card, borderColor: colors.border },
        crossPlatformShadow({ color: colors.shadow, offsetY: 6, opacity: 0.06, radius: 14, elevation: 2 }),
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <View style={[styles.media, size === "large" && styles.mediaLarge, { backgroundColor: colors.primarySoft }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        ) : (
          <LinearGradient colors={[colors.primarySoft, colors.surfaceMuted]} style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Feather name={categoryIcon(p.category)} size={size === "large" ? 40 : 30} color={colors.tint} />
          </LinearGradient>
        )}
        {reserved ? (
          <View style={[styles.ribbon, { backgroundColor: "rgba(20,17,58,0.82)" }]}>
            <Feather name="lock" size={11} color="#FFFFFF" />
            <Text style={styles.ribbonText}>{p.reservedByMe ? t("mkReservedByYou") : t("mkReserved")}</Text>
          </View>
        ) : discount ? (
          <View style={[styles.ribbon, { backgroundColor: colors.gold }]}>
            <Text style={[styles.ribbonText, { color: "#1B1833" }]}>−{discount} %</Text>
          </View>
        ) : null}
        {p.otherResidence && p.residenceCity ? (
          <>
            <LinearGradient colors={["transparent", "rgba(14,12,28,0.55)"]} style={styles.shade} pointerEvents="none" />
            <View style={styles.cityPill}>
              <Feather name="map-pin" size={11} color="#FFFFFF" />
              <Text style={styles.cityText} numberOfLines={1}>{p.residenceCity}</Text>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.foreground }]} numberOfLines={1}>
            {fmt.money(p.price, { decimals: 0 })}
          </Text>
          {p.negotiable ? <Text style={[styles.nego, { color: colors.tint }]}>{t("mkNegotiable")}</Text> : null}
        </View>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
          {p.name}
        </Text>
        <View style={styles.meta}>
          {p.sellerVerifiedResident ? <Feather name="check-circle" size={12} color={colors.success} /> : null}
          <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
            {[p.otherResidence ? t(categoryLabelKey(p.category)) : p.building ? buildingLabel(p.building, t) : t(categoryLabelKey(p.category)), p.condition ? t(conditionLabelKey(p.condition)) : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.LG + 2, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  large: { width: 268 },
  media: { aspectRatio: 1, overflow: "hidden" },
  shade: { position: "absolute", start: 0, end: 0, bottom: 0, height: "38%" },
  cityPill: { position: "absolute", start: 8, bottom: 8, maxWidth: "88%", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(20,17,58,0.72)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.25)" },
  cityText: { color: "#FFFFFF", fontFamily: FONT.semibold, fontSize: 11 },
  mediaLarge: { aspectRatio: 4 / 3 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  ribbon: { position: "absolute", top: 10, start: 10, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  ribbonText: { fontFamily: FONT.semibold, fontSize: 11, color: "#FFFFFF" },
  body: { padding: 12, gap: 4 },
  // Wraps so a long price never gets cut by « à débattre ».
  priceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6 },
  price: { fontFamily: "Fraunces_600SemiBold", fontSize: 19, lineHeight: 24, fontVariant: ["lining-nums"] },
  nego: { fontFamily: FONT.semibold, fontSize: 11 },
  name: { fontFamily: FONT.medium, fontSize: 14, lineHeight: 19, minHeight: 38 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { flex: 1, fontFamily: FONT.regular, fontSize: 12 },
});
