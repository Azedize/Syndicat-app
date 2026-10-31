import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { listingImages, resolveMediaUrl } from "@/lib/media";
import { categoryIcon, categoryLabelKey, conditionLabelKey } from "../catalog";
import type { MarketProduct } from "./ProductCard";

interface Props {
  products: MarketProduct[];
  ticket: string | null;
  /** Listings already in the user's saved list (never toggled off by a swipe). */
  savedIds: Set<string>;
  /** Saves a listing (real server action). Resolves true when saved. */
  onSave: (id: string) => Promise<boolean>;
  /** Removes a listing from the saved list (undo). */
  onUnsave: (id: string) => Promise<boolean>;
  onOpen: (id: string) => void;
  /** Close to the end of what is loaded: fetch the next page. */
  onNeedMore: () => void;
  hasMore: boolean;
}

type Choice = { id: string; action: "save" | "pass"; index: number };

const haptic = (kind: "light" | "success") => {
  if (Platform.OS === "web") return;
  (kind === "success" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.selectionAsync()).catch(() => {});
};

/**
 * One listing at a time. Swipe right saves it to « Enregistrés » (a real,
 * reversible action: undo removes it again); swipe left only moves on (no
 * server change). Tapping opens the full listing. Every gesture has a button,
 * for users who cannot swipe. Nothing is reserved, bought or deleted here.
 */
export default function DiscoverDeck({ products, ticket, savedIds, onSave, onUnsave, onOpen, onNeedMore, hasMore }: Props) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const cardW = Math.min(width - SPACING.LG * 2, 440);
  const threshold = cardW * 0.28;
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const current = products[index];
  const next = products[index + 1];

  useEffect(() => {
    if (hasMore && products.length - index <= 3) onNeedMore();
  }, [index, products.length, hasMore, onNeedMore]);

  const advance = useCallback(() => {
    x.value = 0;
    y.value = 0;
    setIndex((i) => i + 1);
  }, [x, y]);

  const decide = useCallback(
    async (action: "save" | "pass") => {
      const item = products[index];
      if (!item || busy) return;
      if (action === "pass") {
        haptic("light");
        setHistory((h) => [...h, { id: item.id, action: "pass", index }]);
        advance();
        return;
      }
      setBusy(true);
      // Already saved: nothing to send; a swipe never removes a saved listing.
      const ok = savedIds.has(item.id) ? true : await onSave(item.id);
      setBusy(false);
      if (!ok) {
        // Not saved: the card comes back.
        x.value = reduce ? 0 : withSpring(0);
        y.value = reduce ? 0 : withSpring(0);
        return;
      }
      haptic("success");
      setHistory((h) => [...h, { id: item.id, action: "save", index }]);
      advance();
    },
    [products, index, busy, savedIds, onSave, advance, reduce, x, y],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    if (last.action === "save") {
      setBusy(true);
      const ok = await onUnsave(last.id);
      setBusy(false);
      if (!ok) return;
    }
    setHistory((h) => h.slice(0, -1));
    x.value = 0;
    y.value = 0;
    setIndex(last.index);
  }, [history, busy, onUnsave, x, y]);

  const fling = useCallback(
    (dir: 1 | -1) => {
      // Visual direction follows the reading direction: in Arabic, « save » is to the left.
      const save = isRTL ? dir === -1 : dir === 1;
      void decide(save ? "save" : "pass");
    },
    [decide, isRTL],
  );

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-18, 18],
    enabled: !busy && !!current,
    onUpdate: (e) => {
      "worklet";
      x.value = e.translationX;
      y.value = e.translationY * 0.25;
    },
    onDeactivate: (e) => {
      "worklet";
      const go = Math.abs(e.translationX) > threshold || Math.abs(e.velocityX) > 900;
      if (go) {
        const dir = e.translationX > 0 ? 1 : -1;
        x.value = withTiming(dir * cardW * 1.5, { duration: 200 }, () => runOnJS(fling)(dir));
      } else {
        x.value = withSpring(0, { damping: 18 });
        y.value = withSpring(0, { damping: 18 });
      }
    },
  });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: reduce ? "0deg" : `${interpolate(x.value, [-cardW, 0, cardW], [-12, 0, 12], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const nextStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / threshold);
    return { transform: [{ scale: 0.94 + 0.06 * p }], opacity: 0.6 + 0.4 * p };
  });
  // « Save » shows on the side the card goes to save (right, or left in Arabic).
  const saveSign = isRTL ? -1 : 1;
  const saveBadge = useAnimatedStyle(() => ({ opacity: interpolate(x.value * saveSign, [0, threshold], [0, 1], Extrapolation.CLAMP) }));
  const passBadge = useAnimatedStyle(() => ({ opacity: interpolate(-x.value * saveSign, [0, threshold], [0, 1], Extrapolation.CLAMP) }));

  if (!current) {
    return (
      <View style={[styles.done, { backgroundColor: colors.card, borderColor: colors.border }]} testID="discover-done">
        <Feather name="check-circle" size={30} color={colors.tint} />
        <Text style={[styles.doneTitle, { color: colors.foreground }]}>{t("mkDiscoverDone")}</Text>
        <Text style={[styles.doneHint, { color: colors.textMuted }]}>{t("mkDiscoverDoneHint")}</Text>
        {index > 0 ? (
          <Pressable onPress={() => { setIndex(0); setHistory([]); }} accessibilityRole="button" style={[styles.again, { borderColor: colors.border }]}>
            <Feather name="rotate-ccw" size={15} color={colors.tint} />
            <Text style={[styles.againText, { color: colors.tint }]}>{t("mkDiscoverRestart")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="discover-deck">
      <View style={{ width: cardW, height: cardW * 1.32 }}>
        {next ? (
          <Animated.View style={[StyleSheet.absoluteFill, nextStyle]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <DeckCard product={next} ticket={ticket} />
          </Animated.View>
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View style={[StyleSheet.absoluteFill, topStyle]}>
            <Pressable onPress={() => onOpen(current.id)} accessibilityRole="button" accessibilityHint={t("mkDiscoverOpenHint")} style={StyleSheet.absoluteFill}>
              <DeckCard product={current} ticket={ticket} saved={savedIds.has(current.id)} />
            </Pressable>
            <Animated.View pointerEvents="none" style={[styles.badge, styles.badgeSave, { borderColor: colors.success }, saveBadge]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>{t("mkDiscoverSave")}</Text>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.badge, styles.badgePass, { borderColor: colors.danger }, passBadge]}>
              <Text style={[styles.badgeText, { color: colors.danger }]}>{t("mkDiscoverPass")}</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.actions}>
        <RoundButton icon="x" label={t("mkDiscoverPass")} color={colors.danger} onPress={() => void decide("pass")} disabled={busy} testID="discover-pass" />
        <RoundButton icon="rotate-ccw" label={t("mkDiscoverUndo")} color={colors.textMuted} small onPress={() => void undo()} disabled={busy || history.length === 0} testID="discover-undo" />
        <RoundButton icon="heart" label={t("mkDiscoverSave")} color={colors.success} onPress={() => void decide("save")} disabled={busy} testID="discover-save" />
        <RoundButton icon="info" label={t("mkDiscoverDetails")} color={colors.tint} small onPress={() => onOpen(current.id)} testID="discover-open" />
      </View>
      <Text style={[styles.counter, { color: colors.textMuted }]}>
        {t("mkDiscoverCount").replace("{n}", String(index + 1)).replace("{total}", String(products.length))}
      </Text>
    </View>
  );

  function RoundButton({ icon, label, color, onPress, disabled, small, testID }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void; disabled?: boolean; small?: boolean; testID?: string }) {
      const size = small ? 46 : 60;
      return (
        <Pressable
          testID={testID}
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [
            styles.round,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.card, borderColor: colors.border, opacity: disabled ? 0.45 : 1 },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <Feather name={icon} size={small ? 18 : 24} color={color} />
        </Pressable>
      );
    }
}

function DeckCard({ product: p, ticket, saved }: { product: MarketProduct; ticket: string | null; saved?: boolean }) {
    const colors = useColors();
    const { t, isRTL } = useLanguage();
    const fmt = useFormat();
    // Align to the reading side even when the content itself is Latin (price, French name).
    const align = { textAlign: isRTL ? "right" : "left" } as const;
    const cover = resolveMediaUrl(listingImages(p.imageUrls)[0], ticket);
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <LinearGradient colors={[colors.primarySoft, colors.surfaceMuted]} style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Feather name={categoryIcon(p.category)} size={56} color={colors.tint} />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(14,12,28,0.88)"]} style={styles.cardShade} pointerEvents="none" />
        {saved ? (
          <View style={[styles.savedPill, { backgroundColor: colors.gold }]}>
            <Feather name="heart" size={12} color="#1B1833" />
            <Text style={styles.savedText}>{t("mkSaved")}</Text>
          </View>
        ) : null}
        <View style={styles.cardBody}>
          <Text style={[styles.cardPrice, align]} numberOfLines={1}>{fmt.money(p.price, { decimals: 0 })}</Text>
          <Text style={[styles.cardName, align]} numberOfLines={2}>{p.name}</Text>
          <View style={styles.cardMeta}>
            {p.otherResidence && p.residenceCity ? (
              <>
                <Feather name="map-pin" size={12} color="rgba(255,255,255,0.85)" />
                <Text style={styles.cardMetaText}>{p.residenceCity}</Text>
                <Text style={styles.cardMetaText}>·</Text>
              </>
            ) : null}
            <Text style={styles.cardMetaText} numberOfLines={1}>
              {[t(categoryLabelKey(p.category)), p.condition ? t(conditionLabelKey(p.condition)) : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
      </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: "center", gap: SPACING.LG, paddingVertical: SPACING.SM },
    card: {
      flex: 1,
      borderRadius: RADIUS.XL,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    placeholder: { alignItems: "center", justifyContent: "center" },
    cardShade: { position: "absolute", start: 0, end: 0, bottom: 0, height: "48%" },
    cardBody: { position: "absolute", start: 0, end: 0, bottom: 0, padding: 18, gap: 4 },
    cardPrice: { color: "#FFFFFF", fontFamily: "Fraunces_600SemiBold", fontSize: 28 },
    cardName: { color: "#FFFFFF", fontFamily: FONT.semibold, fontSize: 17, lineHeight: 23 },
    cardMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    cardMetaText: { color: "rgba(255,255,255,0.85)", fontFamily: FONT.medium, fontSize: 12.5 },
    savedPill: { position: "absolute", top: 14, end: 14, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    savedText: { color: "#1B1833", fontFamily: FONT.semibold, fontSize: 12 },
    badge: { position: "absolute", top: 28, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.92)" },
    badgeSave: { start: 22, transform: [{ rotate: "-12deg" }] },
    badgePass: { end: 22, transform: [{ rotate: "12deg" }] },
    badgeText: { fontFamily: FONT.semibold, fontSize: 18, letterSpacing: 1 },
    actions: { flexDirection: "row", alignItems: "center", gap: 18 },
    round: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
    counter: { fontFamily: FONT.medium, fontSize: 12 },
    done: { alignItems: "center", gap: 10, padding: 28, borderRadius: RADIUS.LG, borderWidth: StyleSheet.hairlineWidth },
    doneTitle: { fontFamily: FONT.semibold, fontSize: 16, textAlign: "center" },
    doneHint: { fontFamily: FONT.regular, fontSize: 13, textAlign: "center" },
    again: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    againText: { fontFamily: FONT.semibold, fontSize: 13 }
});
