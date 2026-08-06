import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import {
  SEARCH_CATEGORIES,
  SearchGroup,
  SearchResult,
  useSearch,
} from "@/context/SearchContext";

const CATEGORY_KEYS = Object.keys(SEARCH_CATEGORIES);

const CATEGORY_TRANSLATION_KEYS: Record<string, string> = {
  membre: "searchCategoryMembers",
  syndicat: "searchCategorySyndicates",
  publication: "searchCategoryPublications",
  document: "searchCategoryDocuments",
  reunion: "searchCategoryMeetings",
  election: "searchCategoryElections",
  alerte: "searchCategoryAlerts",
  message: "searchCategoryMessages",
  produit: "searchCategoryProducts",
  ticket: "searchCategorySupport",
  transaction: "searchCategoryFinance",
  partenaire: "searchCategoryPartners",
  cotisation: "searchCategoryContributions",
  commande: "searchCategoryOrders",
  navigation: "searchCategoryNavigation",
};

export default function SearchScreen() {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const { query, setQuery, results, history, addHistory, removeHistory, clearHistory, isSearching, totalCount } =
    useSearch();

  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(query);

  useEffect(() => {
    const useNative = Platform.OS !== "web";
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: useNative }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: useNative }),
    ]).start();
    setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      setQuery("");
    };
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      setInputValue(text);
      setQuery(text);
      setActiveCategory(null);
    },
    [setQuery]
  );

  const handleClear = useCallback(() => {
    setInputValue("");
    setQuery("");
    setActiveCategory(null);
    inputRef.current?.focus();
  }, [setQuery]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    router.back();
  }, []);

  const handleSelectHistory = useCallback(
    (h: string) => {
      setInputValue(h);
      setQuery(h);
      setActiveCategory(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setQuery]
  );

  const handleResultPress = useCallback(
    (result: SearchResult) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addHistory(inputValue.trim());
      Keyboard.dismiss();
      router.back();
      setTimeout(() => {
        if (result.params) {
          router.push({ pathname: result.route as any, params: result.params });
        } else {
          router.push(result.route as any);
        }
      }, 50);
    },
    [addHistory, inputValue]
  );

  const handleSubmit = useCallback(() => {
    if (inputValue.trim().length >= 2) {
      addHistory(inputValue.trim());
    }
  }, [inputValue, addHistory]);

  const filteredResults: SearchGroup[] = activeCategory
    ? results.filter((g) => g.category === activeCategory)
    : results;

  const availableCategories = results.map((g) => g.category);

  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  return (
    <Animated.View
      style={[
        styles.root,
        { backgroundColor: colors.background, opacity: fadeAnim, transform: [{ translateY: slideAnim }], direction: isRTL ? "rtl" : "ltr" },
      ]}
    >
      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          {
            paddingTop: topPad + 10,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.primary} />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder={t("searchPlaceholderDetailed")}
            placeholderTextColor={colors.mutedForeground}
            value={inputValue}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            clearButtonMode="never"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {isSearching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : inputValue.length > 0 ? (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.primary }]}>{t("searchCancel")}</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter chips */}
      {inputValue.length > 0 && availableCategories.length > 0 && (
        <View style={[styles.chipsBar, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
            <Pressable
              style={[
                styles.chip,
                {
                  backgroundColor: activeCategory === null ? colors.primary : colors.muted,
                  borderColor: activeCategory === null ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                setActiveCategory(null);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: activeCategory === null ? "#fff" : colors.mutedForeground },
                ]}
              >
                {t("searchAll")} ({totalCount})
              </Text>
            </Pressable>
            {results.map((g) => {
              const isActive = activeCategory === g.category;
              return (
                <Pressable
                  key={g.category}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? g.color : colors.muted,
                      borderColor: isActive ? g.color : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setActiveCategory(isActive ? null : g.category);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Feather name={g.icon as any} size={11} color={isActive ? "#fff" : g.color} />
                  <Text style={[styles.chipText, { color: isActive ? "#fff" : colors.mutedForeground }]}>
                    {t(CATEGORY_TRANSLATION_KEYS[g.category] ?? "searchResults")} ({g.results.length})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {inputValue.length === 0 ? (
        <EmptyState
          history={history}
          colors={colors}
          onSelectHistory={handleSelectHistory}
          onRemoveHistory={removeHistory}
           onClearHistory={clearHistory}
            t={t}
        />
      ) : filteredResults.length === 0 && !isSearching ? (
        <NoResults query={inputValue} colors={colors} t={t} />
      ) : (
        <FlatList
          data={filteredResults}
          keyExtractor={(g) => g.category}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: group }) => (
            <GroupSection group={group} colors={colors} onPress={handleResultPress} t={t} />
          )}
        />
      )}
    </Animated.View>
  );
}

function GroupSection({
  group,
  colors,
  onPress,
  t,
}: {
  group: SearchGroup;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPress: (r: SearchResult) => void;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupIconWrap, { backgroundColor: group.color + "20" }]}>
          <Feather name={group.icon as any} size={13} color={group.color} />
        </View>
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{group.label.toUpperCase()}</Text>
        <View style={[styles.groupCount, { backgroundColor: group.color + "20" }]}>
          <Text style={[styles.groupCountText, { color: group.color }]}>{group.results.length}</Text>
        </View>
      </View>
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {group.results.map((result, i) => (
          <View key={result.id}>
            {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
            <ResultRow result={result} colors={colors} onPress={onPress} />
          </View>
        ))}
      </View>
    </View>
  );
}

function ResultRow({
  result,
  colors,
  onPress,
}: {
  result: SearchResult;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPress: (r: SearchResult) => void;
}) {
  return (
    <TouchableOpacity style={styles.resultRow} onPress={() => onPress(result)} activeOpacity={0.7}>
      <View style={[styles.resultIcon, { backgroundColor: result.color + "18" }]}>
        <Feather name={result.icon as any} size={16} color={result.color} />
      </View>
      <View style={styles.resultText}>
        <Text style={[styles.resultTitle, { color: colors.foreground }]} numberOfLines={1}>
          {result.title}
        </Text>
        <Text style={[styles.resultSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {result.subtitle}
        </Text>
      </View>
      <Feather name="arrow-right" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function EmptyState({
  history,
  colors,
  onSelectHistory,
  onRemoveHistory,
  onClearHistory,
  t,
}: {
  history: string[];
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onSelectHistory: (h: string) => void;
  onRemoveHistory: (h: string) => void;
  onClearHistory: () => void;
  t: (key: string) => string;
}) {
  const SUGGESTIONS = [
    { label: "Membres", icon: "users" as const, color: "#2563EB", query: "membre" },
    { label: "Réunions", icon: "calendar" as const, color: "#3b82f6", query: "réunion" },
    { label: "Documents", icon: "file-text" as const, color: "#6366f1", query: "statut" },
    { label: "Élections", icon: "check-square" as const, color: "#f59e0b", query: "bureau" },
    { label: "Finance", icon: "dollar-sign" as const, color: "#10b981", query: "cotisation" },
    { label: "Alertes", icon: "bell" as const, color: "#ef4444", query: "alerte" },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.emptyContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Suggestions rapides */}
      <View style={styles.emptySection}>
        <Text style={[styles.emptySectionTitle, { color: colors.mutedForeground }]}>SUGGESTIONS RAPIDES</Text>
        <View style={styles.suggestionsGrid}>
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[styles.suggestionChip, { backgroundColor: s.color + "15", borderColor: s.color + "40" }]}
              onPress={() => onSelectHistory(s.query)}
              activeOpacity={0.7}
            >
              <Feather name={s.icon} size={14} color={s.color} />
              <Text style={[styles.suggestionLabel, { color: s.color }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Historique */}
      {history.length > 0 && (
        <View style={styles.emptySection}>
          <View style={styles.historyHeader}>
            <Text style={[styles.emptySectionTitle, { color: colors.mutedForeground }]}>RECHERCHES RÉCENTES</Text>
            <TouchableOpacity onPress={onClearHistory}>
              <Text style={[styles.clearText, { color: colors.primary }]}>Tout effacer</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {history.slice(0, 8).map((h, i) => (
              <View key={h}>
                {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                <View style={styles.historyRow}>
                  <TouchableOpacity
                    style={styles.historyLeft}
                    onPress={() => onSelectHistory(h)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.historyIcon, { backgroundColor: colors.muted }]}>
                      <Feather name="clock" size={13} color={colors.mutedForeground} />
                    </View>
                    <Text style={[styles.historyText, { color: colors.foreground }]}>{h}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRemoveHistory(h)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Raccourcis */}
      <View style={styles.emptySection}>
        <Text style={[styles.emptySectionTitle, { color: colors.mutedForeground }]}>ACCÈS RAPIDE</Text>
        <View style={styles.shortcutsGrid}>
          {[
            { label: "Publications", icon: "rss" as const, color: "#f97316", route: "/publications" },
            { label: "Chat", icon: "message-circle" as const, color: "#ec4899", route: "/chat" },
            { label: "Profil", icon: "user" as const, color: "#6366f1", route: "/profile" },
            { label: "Paramètres", icon: "settings" as const, color: "#6b7280", route: "/settings" },
          ].map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[styles.shortcutCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
                setTimeout(() => router.push(s.route as any), 50);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: s.color + "18" }]}>
                <Feather name={s.icon} size={20} color={s.color} />
              </View>
              <Text style={[styles.shortcutLabel, { color: colors.foreground }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function NoResults({ query, colors, t }: { query: string; colors: any; t: (key: string) => string }) {
  return (
    <View style={styles.noResults}>
      <View style={[styles.noResultsIcon, { backgroundColor: colors.muted }]}>
        <Feather name="search" size={32} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.noResultsTitle, { color: colors.foreground }]}>Aucun résultat</Text>
      <Text style={[styles.noResultsSubtitle, { color: colors.mutedForeground }]}>
        Aucun résultat pour "{query}".{"\n"}Essayez un autre terme de recherche.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  cancelBtn: { paddingBottom: Platform.OS === "ios" ? 10 : 8, paddingStart: 2 },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  chipsBar: { flexShrink: 0,
    borderBottomWidth: 1,
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  group: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupIconWrap: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, flex: 1 },
  groupCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  groupCountText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  groupCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  resultIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  resultText: { flex: 1, gap: 2 },
  resultTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sep: { height: 1, marginHorizontal: 14 },

  emptyContainer: { padding: 16, gap: 24, paddingBottom: 60 },
  emptySection: { gap: 10 },
  emptySectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginStart: 2 },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clearText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  historyCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  historyLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  historyIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  historyText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  suggestionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },

  shortcutsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  shortcutCard: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  shortcutIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },

  noResults: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  noResultsIcon: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  noResultsTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  noResultsSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
