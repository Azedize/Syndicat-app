import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFavorites } from "@/context/FavoritesContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

export default function FavoritesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { favorites, removeFavorite, clearFavorites } = useFavorites();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const handleNav = (route: string, params?: Record<string, string>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
    setTimeout(() => {
      if (params) router.push({ pathname: route as any, params });
      else router.push(route as any);
    }, 50);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Mes Favoris</Text>
        {favorites.length > 0 && (
          <TouchableOpacity
            onPress={() => { clearFavorites(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={styles.clearBtn}
          >
            <Text style={[styles.clearText, { color: colors.destructive }]}>Tout effacer</Text>
          </TouchableOpacity>
        )}
      </View>

      {favorites.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="star" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun favori</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Appuyez sur l'étoile ★ dans n'importe quel écran pour ajouter{"\n"}des pages ou éléments à vos favoris.
          </Text>
          <TouchableOpacity
            style={[styles.exploreBtn, { backgroundColor: colors.primary }]}
            onPress={() => { router.back(); router.push("/search" as any); }}
            activeOpacity={0.85}
          >
            <Feather name="search" size={16} color="#fff" />
            <Text style={styles.exploreBtnText}>Explorer l'application</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {favorites.length} favori{favorites.length > 1 ? "s" : ""} enregistré{favorites.length > 1 ? "s" : ""}
          </Text>

          {favorites.map((fav) => (
            <TouchableOpacity
              key={fav.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleNav(fav.route, fav.params)}
              activeOpacity={0.75}
            >
              <View style={[styles.cardIcon, { backgroundColor: fav.color + "18" }]}>
                <Feather name={fav.icon as any} size={20} color={fav.color} />
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{fav.title}</Text>
                {fav.subtitle ? (
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>{fav.subtitle}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); removeFavorite(fav.id); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="star" size={18} color="#f59e0b" />
              </TouchableOpacity>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}

          {/* Quick suggestions */}
          <View style={[styles.suggestSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.suggestTitle, { color: colors.mutedForeground }]}>SUGGESTIONS</Text>
            <View style={styles.suggestGrid}>
              {[
                { id: "fav-dash", title: "Dashboard", icon: "home", color: "#7c3aed", route: "/(tabs)/" },
                { id: "fav-elections", title: "Élections", icon: "check-square", color: "#f59e0b", route: "/elections" },
                { id: "fav-chat", title: "Chat", icon: "message-circle", color: "#ec4899", route: "/chat" },
                { id: "fav-docs", title: "Documents", icon: "file-text", color: "#6366f1", route: "/documents" },
              ].filter((s) => !favorites.some((f) => f.id === s.id)).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.suggestCard, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => handleNav(s.route)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.suggestIcon, { backgroundColor: s.color + "18" }]}>
                    <Feather name={s.icon as any} size={16} color={s.color} />
                  </View>
                  <Text style={[styles.suggestLabel, { color: colors.foreground }]}>{s.title}</Text>
                  <Feather name="arrow-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  clearBtn: { padding: 4 },
  clearText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  exploreBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  exploreBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  count: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4, marginStart: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  suggestSection: { borderTopWidth: 1, paddingTop: 20, gap: 12, marginTop: 6 },
  suggestTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  suggestGrid: { gap: 8 },
  suggestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  suggestLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});
