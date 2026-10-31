import { Feather } from "@/components/ui/Feather";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/components/DataState";
import { Card, IconButton, SkeletonProductGrid, ZelligePattern } from "@/components/ui";
import { MIZAN } from "@/constants/brand";
import { DURATION, STAGGER, STAGGER_MAX } from "@/constants/motion";
import { RADIUS, SPACING } from "@/constants/spacing";
import { displayFace, FONT, TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useFileTicket } from "@/hooks/useFileTicket";
import { apiRequest } from "@/lib/api";
import { marketplace } from "@/services/api";
import { CATEGORIES } from "./catalog";
import DiscoverDeck from "./DiscoverDeck";
import ProductCard, { type MarketProduct } from "./ProductCard";

type Provider = {
  id: string;
  name: string;
  type: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  rating?: string | null;
  evaluationsCount?: number | null;
  activeContracts?: number | null;
};

const PAGE_SIZE = 24;
const GridGap = () => <View style={{ height: SPACING.MD }} />;
const SORTS = [
  { key: "recent", labelKey: "mkSortRecent", icon: "clock" },
  { key: "price_asc", labelKey: "mkSortPriceAsc", icon: "trending-up" },
  { key: "price_desc", labelKey: "mkSortPriceDesc", icon: "trending-down" },
] as const;
const PRICE_BRACKETS: { key: string; labelKey: string; min?: number; max?: number }[] = [
  { key: "lt200", labelKey: "mkPriceLt200", max: 200 },
  { key: "200-1000", labelKey: "mkPrice200to1000", min: 200, max: 1000 },
  { key: "1000-5000", labelKey: "mkPrice1000to5000", min: 1000, max: 5000 },
  { key: "gt5000", labelKey: "mkPriceGt5000", min: 5000 },
];

const PROVIDER_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  ascenseur: "chevrons-up", nettoyage: "wind", gardiennage: "shield", securite: "shield", plomberie: "droplet",
  electricite: "zap", jardinage: "feather", peinture: "edit-3", menuiserie: "box",
};

/**
 * The residence's market, as residents see it.
 *  - Between neighbours: « my residence » by default; « all residences »
 *    adds the other condominiums, filtered by city (their listings show the
 *    city only, never the building or the seller's contact). Sellers flagged
 *    when they are verified residents, reservation then hand-over in person.
 *    Nothing is paid through MIZAN: the screen says so.
 *  - Providers: the companies the syndic works with for this residence, with
 *    their rating and whether a contract is running.
 */
export default function ResidenceMarket() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const { isWide } = useBreakpoints();
  const { width } = useWindowDimensions();
  const ticket = useFileTicket();
  const [space, setSpace] = useState<"neighbours" | "providers">("neighbours");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // « Enregistrés »: the listings this resident put a heart on.
  const [saved, setSaved] = useState(false);
  // Reach of the catalogue: this residence, or every residence (by city).
  const [reach, setReach] = useState<"residence" | "all">("residence");
  const [zone, setZone] = useState<string | null>(null);
  // Sort, price and availability live behind one « Filtres » button.
  const [showFilters, setShowFilters] = useState(false);
  // Grid, or one listing at a time (« Découvrir »).
  const [view, setView] = useState<"grid" | "discover">("grid");
  // Saved listings, so a swipe never removes one that is already saved.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const savedQuery = useQuery({
    queryKey: ["market-saved-ids"],
    enabled: view === "discover",
    queryFn: async () => ((await marketplace.myFavorites({ limit: "50" })).data as MarketProduct[]).map((p) => p.id),
  });
  useEffect(() => {
    if (savedQuery.data) setSavedIds(new Set(savedQuery.data));
  }, [savedQuery.data]);
  const setFavorite = useCallback(async (id: string, want: boolean) => {
    try {
      const res = await marketplace.toggleFavorite(id);
      let on = !!res?.isFavorited;
      // The endpoint toggles: if the server state was not the expected one, toggle back.
      if (on !== want) on = !!(await marketplace.toggleFavorite(id))?.isFavorited;
      setSavedIds((prev) => {
        const n = new Set(prev);
        if (on) n.add(id); else n.delete(id);
        return n;
      });
      return on === want;
    } catch {
      Alert.alert(t("error"), t("mkDiscoverSaveError"));
      return false;
    }
  }, [t]);

  const [sort, setSort] = useState<"recent" | "price_asc" | "price_desc">("recent");
  const [price, setPrice] = useState<string | null>(null);
  const [withReserved, setWithReserved] = useState(false);
  // The request follows the search box once typing pauses (no request per key).
  const [query, setQuery] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(h);
  }, [search]);

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: String(PAGE_SIZE) };
    if (category) p.category = category;
    if (query.length >= 2) p.search = query;
    if (sort !== "recent") p.sort = sort;
    const bracket = PRICE_BRACKETS.find((b) => b.key === price);
    if (bracket?.min !== undefined) p.minPrice = String(bracket.min);
    if (bracket?.max !== undefined) p.maxPrice = String(bracket.max);
    if (withReserved) p.availability = "all";
    if (reach === "all") {
      p.scope = "all";
      if (zone) p.city = zone;
    }
    return p;
  }, [category, query, sort, price, withReserved, reach, zone]);
  const zones = useQuery({
    queryKey: ["market-zones"],
    enabled: reach === "all",
    queryFn: async () => (await apiRequest<{ data: { city: string; region: string | null; listings: number }[] }>("/products/zones")).data ?? [],
  });

  // Server-side pages; a new filter is a new query key, so it starts again at page 1.
  const products = useInfiniteQuery({
    queryKey: ["market-products", saved, saved ? null : params],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await (saved
        ? marketplace.myFavorites({ limit: String(PAGE_SIZE), page: String(pageParam) })
        : marketplace.products({ ...params, page: String(pageParam) }))) as unknown as { data: MarketProduct[]; pagination: { page: number; pages: number; total: number } },
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined),
  });
  const featured = useQuery({
    queryKey: ["market-featured"],
    queryFn: async () => ((await marketplace.featured()).data as MarketProduct[]) ?? [],
  });
  // The syndic validates the residence's listings: how many are waiting.
  const isSyndic = user?.role === "syndicate_admin";
  const pending = useQuery({
    queryKey: ["moderation-queue", "count"],
    enabled: isSyndic,
    queryFn: async () => (await apiRequest<{ pagination: { total: number } }>("/products/moderation-queue?limit=1")).pagination.total,
  });
  const providers = useQuery({
    queryKey: ["market-providers"],
    enabled: space === "providers",
    queryFn: async () => ((await apiRequest<{ data: Provider[] }>("/prestataires")).data ?? []).filter((p) => p.status === "active"),
  });

  const topPad = isWide ? 0 : Platform.OS === "web" ? 24 : insets.top;
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gap = SPACING.MD;
  const pagePad = SPACING.LG;
  const cardW = Math.floor((Math.min(width, 1100) - pagePad * 2 - gap * (cols - 1)) / cols);
  const raw = useMemo(() => {
    const seen = new Set<string>();
    return (products.data?.pages ?? []).flatMap((pg) => pg.data ?? []).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [products.data]);
  // Saved listings are few: the search box filters them on the device.
  const needle = search.trim().toLowerCase();
  const list = saved && needle ? raw.filter((p) => p.name.toLowerCase().includes(needle)) : raw;
  const total = saved && needle ? list.length : products.data?.pages?.[0]?.pagination?.total ?? list.length;
  const filtersOn = !!category || !!price || withReserved || sort !== "recent" || query.length >= 2 || reach === "all";
  const activeFilters = (price ? 1 : 0) + (withReserved ? 1 : 0) + (sort !== "recent" ? 1 : 0);
  const loadMore = () => {
    if (products.hasNextPage && !products.isFetchingNextPage && !products.isFetchNextPageError) products.fetchNextPage();
  };
  const ar = lang === "ar";

  const openProduct = (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    router.push({ pathname: "/product-detail", params: { id } } as any);
  };

  // Everything above the listings; the listings themselves are FlatList items
  // (only what is on screen is rendered, pages load near the end).
  const listHeader = (
    <>
        {/* ── Dusk hero: where we are, what is on offer, search ── */}
        <LinearGradient colors={[colors.navy, "#2B2475"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: topPad + 14 }]}>
          <ZelligePattern opacity={0.035} />
          <View style={styles.heroTop}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.eyebrow, ar && { letterSpacing: 0 }]} numberOfLines={1}>
                {reach === "all" ? (zone ?? t("mkAllResidences")) : user?.syndicate ?? t("mkMyResidence")}
              </Text>
              <Text style={[styles.heroTitle, ar && { fontFamily: displayFace(lang), lineHeight: 38 }]} accessibilityRole="header">
                {reach === "all" && space === "neighbours" ? t("mkTitleAll") : t("mkTitle")}
              </Text>
            </View>
            <IconButton
              icon="heart"
              variant="onDark"
              accessibilityLabel={t("mkFavorites")}
              onPress={() => { setSaved((v) => !v); setSpace("neighbours"); }}
              style={saved ? { backgroundColor: colors.gold } : undefined}
              testID="market-saved"
            />
            <IconButton icon="tag" variant="onDark" accessibilityLabel={t("mkMyListings")} onPress={() => router.push("/my-shop" as any)} />
          </View>

          <View style={styles.search}>
            <Feather name="search" size={17} color="rgba(255,255,255,0.75)" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={space === "neighbours" ? (reach === "all" ? t("mkSearchAll") : t("mkSearchListings")) : t("mkSearchProviders")}
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={[styles.searchInput, { textAlign: isRTL ? "right" : "left" }]}
              returnKeyType="search"
              accessibilityLabel={t("mkSearchListings")}
            />
            {search ? (
              <Pressable onPress={() => setSearch("")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("close")}>
                <Feather name="x" size={16} color="rgba(255,255,255,0.75)" />
              </Pressable>
            ) : null}
          </View>

          {isSyndic ? (
            <Pressable onPress={() => router.push("/moderation-annonces" as any)} accessibilityRole="button" style={styles.modBanner} testID="market-moderation">
              <Feather name="check-square" size={15} color={MIZAN.colors.navyDeep} />
              <Text style={styles.modBannerText}>{t("modPendingCount").replace("{n}", String(pending.data ?? 0))}</Text>
              <Feather name="chevron-right" size={15} color={MIZAN.colors.navyDeep} />
            </Pressable>
          ) : null}

          {/* Segmented control */}
          <View style={styles.segment} accessibilityRole="tablist">
            {(["neighbours", "providers"] as const).map((k) => {
              const on = space === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => { setSpace(k); if (k === "providers") setSaved(false); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.segBtn, on && { backgroundColor: "#FFFFFF" }]}
                >
                  <Feather name={k === "neighbours" ? "users" : "tool"} size={15} color={on ? MIZAN.colors.blue : "rgba(255,255,255,0.8)"} />
                  <Text style={[styles.segText, { color: on ? MIZAN.colors.navyDeep : "rgba(255,255,255,0.85)" }]}>
                    {k === "neighbours" ? t("mkNeighbours") : t("mkProviders")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Reach: this residence or all residences */}
          {space === "neighbours" && !saved ? (
            <View style={styles.reachRow} accessibilityRole="radiogroup">
              {(["residence", "all"] as const).map((k) => {
                const on = reach === k;
                return (
                  <Pressable
                    key={k}
                    testID={`market-reach-${k}`}
                    onPress={() => { setReach(k); setZone(null); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, checked: on }}
                    style={[styles.reachBtn, on && { backgroundColor: "rgba(255,255,255,0.16)", borderColor: colors.gold }]}
                  >
                    <Feather name={k === "residence" ? "home" : "globe"} size={13} color={on ? colors.gold : "rgba(255,255,255,0.75)"} />
                    <Text style={[styles.reachText, { color: on ? "#FFFFFF" : "rgba(255,255,255,0.8)" }]}>{k === "residence" ? t("mkMyResidence") : t("mkAllResidences")}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </LinearGradient>

        <View style={[styles.page, { paddingHorizontal: pagePad }]}>
          {space === "neighbours" ? (
            <>
              {/* How it works — the deal between neighbours, stated plainly */}
              <View style={[styles.trust, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  reach === "all" ? { icon: "map-pin" as const, label: t("mkTrustAllResidences") } : { icon: "check-circle" as const, label: t("mkTrustNeighbours") },
                  { icon: "map-pin" as const, label: reach === "all" ? t("mkTrustHandoverAll") : t("mkTrustHandover") },
                  { icon: "shield" as const, label: t("mkTrustNoPayment") },
                ].map((x) => (
                  <View key={x.label} style={styles.trustItem}>
                    <View style={[styles.trustIcon, { backgroundColor: colors.goldSoft }]}>
                      <Feather name={x.icon} size={14} color={colors.goldText} />
                    </View>
                    <Text style={[styles.trustText, { color: colors.textSecondary }]} numberOfLines={2}>{x.label}</Text>
                  </View>
                ))}
              </View>

              {/* Cities (all residences) */}
              {reach === "all" && !saved ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {[{ city: null as string | null, listings: (zones.data ?? []).reduce((n, z) => n + z.listings, 0) }, ...(zones.data ?? [])].map((z) => {
                    const on = zone === z.city;
                    return (
                      <Pressable
                        key={z.city ?? "__all"}
                        testID={`market-zone-${z.city ?? "all"}`}
                        onPress={() => setZone(z.city)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.chip, { backgroundColor: on ? colors.gold : colors.card, borderColor: on ? colors.gold : colors.border }]}
                      >
                        <Feather name="map-pin" size={13} color={on ? MIZAN.colors.navyDeep : colors.goldText} />
                        <Text style={[styles.chipText, { color: on ? MIZAN.colors.navyDeep : colors.foreground }]}>{z.city ?? t("mkAllCities")}</Text>
                        <Text style={[styles.zoneCount, { color: on ? MIZAN.colors.navyDeep : colors.textMuted }]}>{z.listings}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {/* Categories */}
              {saved ? null : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Pressable
                  testID="market-filters"
                  onPress={() => setShowFilters((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showFilters }}
                  accessibilityLabel={t("mkFilters")}
                  style={[styles.chip, { backgroundColor: showFilters || activeFilters ? colors.navy : colors.card, borderColor: showFilters || activeFilters ? colors.navy : colors.border }]}
                >
                  <Feather name="sliders" size={14} color={showFilters || activeFilters ? "#FFFFFF" : colors.tint} />
                  <Text style={[styles.chipText, { color: showFilters || activeFilters ? "#FFFFFF" : colors.foreground }]}>{t("mkFilters")}</Text>
                  {activeFilters ? (
                    <View style={[styles.filterBadge, { backgroundColor: colors.gold }]}>
                      <Text style={[styles.filterBadgeText, { color: MIZAN.colors.navyDeep }]}>{activeFilters}</Text>
                    </View>
                  ) : null}
                </Pressable>
                {[{ value: null as string | null, labelKey: "mkAll", icon: "grid" as const }, ...CATEGORIES].map((c) => {
                  const on = category === c.value;
                  return (
                    <Pressable
                      key={c.labelKey}
                      onPress={() => setCategory(c.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.chip, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border }]}
                    >
                      <Feather name={c.icon} size={14} color={on ? "#FFFFFF" : colors.tint} />
                      <Text style={[styles.chipText, { color: on ? "#FFFFFF" : colors.foreground }]}>{t(c.labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>}

              {/* Sort, price, availability — all applied by the server */}
              {saved || !showFilters ? null : (
                <Animated.View entering={FadeInDown.duration(DURATION.quick)}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {SORTS.map((o) => {
                    const on = sort === o.key;
                    return (
                      <Pressable key={o.key} onPress={() => setSort(o.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, styles.chipSmall, { backgroundColor: on ? colors.navy : colors.card, borderColor: on ? colors.navy : colors.border }]}>
                        <Feather name={o.icon} size={13} color={on ? "#FFFFFF" : colors.tint} />
                        <Text style={[styles.chipText, { color: on ? "#FFFFFF" : colors.foreground }]}>{t(o.labelKey)}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
                  {PRICE_BRACKETS.map((b) => {
                    const on = price === b.key;
                    return (
                      <Pressable key={b.key} onPress={() => setPrice(on ? null : b.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, styles.chipSmall, { backgroundColor: on ? colors.navy : colors.card, borderColor: on ? colors.navy : colors.border }]}>
                        <Text style={[styles.chipText, { color: on ? "#FFFFFF" : colors.foreground }]}>{t(b.labelKey)}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
                  <Pressable onPress={() => setWithReserved((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: withReserved }} style={[styles.chip, styles.chipSmall, { backgroundColor: withReserved ? colors.navy : colors.card, borderColor: withReserved ? colors.navy : colors.border }]}>
                    <Feather name={withReserved ? "check-square" : "square"} size={13} color={withReserved ? "#FFFFFF" : colors.tint} />
                    <Text style={[styles.chipText, { color: withReserved ? "#FFFFFF" : colors.foreground }]}>{t("mkShowReserved")}</Text>
                  </Pressable>
                  {activeFilters ? (
                    <Pressable onPress={() => { setSort("recent"); setPrice(null); setWithReserved(false); }} accessibilityRole="button" style={[styles.chip, styles.chipSmall, { backgroundColor: "transparent", borderColor: colors.border }]}>
                      <Feather name="x" size={13} color={colors.danger} />
                      <Text style={[styles.chipText, { color: colors.danger }]}>{t("mkResetFilters")}</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
                </Animated.View>
              )}

              {/* Featured */}
              {!saved && !filtersOn && !search && (featured.data?.length ?? 0) > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }, ar && { fontFamily: displayFace(lang) }]}>{t("mkFeatured")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap }}>
                    {featured.data!.map((p) => (
                      <ProductCard key={p.id} product={p} ticket={ticket} size="large" onPress={() => openProduct(p.id)} />
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {/* Listings */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }, ar && { fontFamily: displayFace(lang) }]}>
                    {saved
                      ? t("mkSaved")
                      : category
                        ? t(CATEGORIES.find((c) => c.value === category)?.labelKey ?? "mkAll")
                        : reach === "all"
                          ? zone ? t("mkListingsIn").replace("{city}", zone) : t("mkAllResidences")
                          : t("mkLatest")}
                  </Text>
                  <View style={styles.headRight}>
                    {!products.isLoading ? (
                      <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("mkCount").replace("{n}", String(total))}</Text>
                    ) : null}
                    {!saved ? (
                      <View style={[styles.viewToggle, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="radiogroup">
                        {(["grid", "discover"] as const).map((v) => {
                          const on = view === v;
                          return (
                            <Pressable
                              key={v}
                              testID={`market-view-${v}`}
                              onPress={() => setView(v)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on, checked: on }}
                              accessibilityLabel={v === "grid" ? t("mkViewGrid") : t("mkViewDiscover")}
                              style={[styles.viewBtn, on && { backgroundColor: colors.primary }]}
                            >
                              <Feather name={v === "grid" ? "grid" : "layers"} size={15} color={on ? "#FFFFFF" : colors.textMuted} />
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                </View>
                {products.isLoading ? (
                  <SkeletonProductGrid count={cols * 2} cardWidth={cardW} gap={gap} />
                ) : products.isError && !products.data ? (
                  <ErrorState title={t("uiLoadErrorTitle")} description={t("uiLoadErrorHint")} retryLabel={t("retry")} onRetry={() => products.refetch()} />
                ) : list.length === 0 ? (
                  <Card padding="lg" style={{ alignItems: "center", gap: 10 }}>
                    <Feather name="package" size={28} color={colors.tint} />
                    <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "center" }]}>{saved ? t("mkSavedEmpty") : search || category ? t("mkEmptyFiltered") : t("mkEmpty")}</Text>
                    <Text style={[TYPE.secondary, { color: colors.textMuted, textAlign: "center" }]}>{saved ? t("mkSavedEmptyHint") : t("mkEmptyHint")}</Text>
                  </Card>
                ) : view === "discover" && !saved ? (
                  <DiscoverDeck
                    products={list}
                    ticket={ticket}
                    savedIds={savedIds}
                    onSave={(id) => setFavorite(id, true)}
                    onUnsave={(id) => setFavorite(id, false)}
                    onOpen={openProduct}
                    onNeedMore={loadMore}
                    hasMore={!!products.hasNextPage}
                  />
                ) : (
                  null
                )}
              </View>
            </>
          ) : (
            <View style={styles.section}>
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("mkProvidersIntro")}</Text>
              {providers.isLoading ? (
                <ActivityIndicator color={colors.tint} style={{ marginTop: 24 }} />
              ) : providers.isError ? (
                <ErrorState title={t("uiLoadErrorTitle")} description={t("uiLoadErrorHint")} retryLabel={t("retry")} onRetry={() => providers.refetch()} />
              ) : (
                (providers.data ?? [])
                  .filter((p) => !search.trim() || `${p.name} ${p.type}`.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((p, i) => (
                    <Animated.View key={p.id} entering={FadeInDown.duration(DURATION.base).delay(Math.min(i, STAGGER_MAX) * STAGGER)}>
                      <Card padding="md" elevation="raised" style={{ gap: SPACING.MD }}>
                        <View style={styles.provHead}>
                          <View style={[styles.provIcon, { backgroundColor: colors.primarySoft }]}>
                            <Feather name={PROVIDER_ICONS[p.type] ?? "tool"} size={20} color={colors.tint} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2}>{p.name}</Text>
                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                              {t(`mkProv_${p.type}`) !== `mkProv_${p.type}` ? t(`mkProv_${p.type}`) : p.type}
                              {p.contactName ? ` · ${p.contactName}` : ""}
                            </Text>
                          </View>
                          {p.rating && Number(p.evaluationsCount ?? 0) > 0 ? (
                            <View style={[styles.rating, { backgroundColor: colors.goldSoft }]}>
                              <Feather name="star" size={12} color={colors.goldText} />
                              <Text style={[styles.ratingText, { color: colors.goldText }]}>{Number(p.rating).toFixed(1)}</Text>
                            </View>
                          ) : null}
                        </View>
                        {Number(p.activeContracts ?? 0) > 0 ? (
                          <View style={styles.badgeRow}>
                            <Feather name="file-text" size={13} color={colors.success} />
                            <Text style={[TYPE.caption, { color: colors.successText }]}>{t("mkUnderContract")}</Text>
                          </View>
                        ) : null}
                        <View style={styles.provActions}>
                          {p.phone ? (
                            <Pressable onPress={() => Linking.openURL(`tel:${p.phone!.replace(/\s/g, "")}`)} accessibilityRole="button" style={[styles.provBtn, { backgroundColor: colors.primary }]}>
                              <Feather name="phone" size={15} color="#FFFFFF" />
                              <Text style={[styles.provBtnText, { color: "#FFFFFF" }]}>{t("mkCall")}</Text>
                            </Pressable>
                          ) : null}
                          {p.email ? (
                            <Pressable onPress={() => Linking.openURL(`mailto:${p.email}`)} accessibilityRole="button" style={[styles.provBtn, { borderWidth: 1, borderColor: colors.border }]}>
                              <Feather name="mail" size={15} color={colors.tint} />
                              <Text style={[styles.provBtnText, { color: colors.tint }]}>{t("mkWrite")}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </Card>
                    </Animated.View>
                  ))
              )}
              {!providers.isLoading && (providers.data ?? []).length === 0 ? (
                <Card padding="lg"><Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("mkNoProviders")}</Text></Card>
              ) : null}
            </View>
          )}
        </View>
    </>
  );
  const showGrid = space === "neighbours" && !products.isLoading && !(products.isError && !products.data) && (view === "grid" || saved);
  const gridFooter =
    showGrid && list.length > 0 ? (
      <View style={[styles.footer, { paddingHorizontal: pagePad }]}>
        {products.isFetchingNextPage ? (
          <ActivityIndicator color={colors.tint} />
        ) : products.isFetchNextPageError ? (
          <Pressable onPress={() => products.fetchNextPage()} accessibilityRole="button" style={[styles.moreBtn, { borderColor: colors.danger }]}>
            <Feather name="refresh-cw" size={14} color={colors.danger} />
            <Text style={[styles.moreText, { color: colors.danger }]}>{t("mkLoadMoreFailed")}</Text>
          </Pressable>
        ) : products.hasNextPage ? (
          <Pressable onPress={loadMore} accessibilityRole="button" style={[styles.moreBtn, { borderColor: colors.border }]} testID="market-load-more">
            <Text style={[styles.moreText, { color: colors.tint }]}>{t("mkLoadMore")}</Text>
          </Pressable>
        ) : (
          <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("mkAllShown").replace("{n}", String(list.length))}</Text>
        )}
      </View>
    ) : null;
  const renderProduct = useCallback(
    ({ item, index }: { item: MarketProduct; index: number }) => (
      <Animated.View entering={FadeInDown.duration(DURATION.base).delay(Math.min(index % PAGE_SIZE, STAGGER_MAX) * STAGGER)} style={{ width: cardW }}>
        <ProductCard product={item} ticket={ticket} onPress={() => openProduct(item.id)} />
      </Animated.View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardW, ticket],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <FlatList
        key={`market-${cols}`}
        data={showGrid ? list : []}
        keyExtractor={(p) => p.id}
        renderItem={renderProduct}
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? { gap, paddingHorizontal: pagePad } : undefined}
        ItemSeparatorComponent={GridGap}
        ListHeaderComponent={listHeader}
        ListFooterComponent={gridFooter ?? undefined}
        onEndReached={() => { if (space === "neighbours") loadMore(); }}
        onEndReachedThreshold={0.6}
        initialNumToRender={cols * 4}
        maxToRenderPerBatch={cols * 4}
        windowSize={9}
        removeClippedSubviews={Platform.OS === "android"}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={products.isRefetching && !products.isFetchingNextPage}
            onRefresh={() => { products.refetch(); featured.refetch(); if (space === "providers") providers.refetch(); }}
            tintColor={colors.tint}
          />
        }
      />

      {space === "neighbours" ? (
        <Pressable
          onPress={() => router.push("/my-shop" as any)}
          accessibilityRole="button"
          accessibilityLabel={t("mkSell")}
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + (isWide ? 24 : 96), backgroundColor: colors.primary }, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.fabText}>{t("mkSell")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modBanner: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  modBannerText: { fontFamily: FONT.semibold, fontSize: 13, color: MIZAN.colors.navyDeep },
  chipSmall: { paddingVertical: 6 },
  chipDivider: { width: 1, alignSelf: "stretch", marginHorizontal: 2 },
  footer: { alignItems: "center", paddingVertical: SPACING.LG },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  moreText: { fontFamily: FONT.semibold, fontSize: 14 },
  hero: { paddingHorizontal: SPACING.LG, paddingBottom: SPACING.LG, gap: SPACING.MD, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: SPACING.SM },
  eyebrow: { fontFamily: FONT.semibold, fontSize: 12, letterSpacing: 1, color: "#E3B75C" },
  heroTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 28, lineHeight: 34, color: "#FFFFFF" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: RADIUS.MD + 2, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.22)" },
  searchInput: { flex: 1, fontFamily: FONT.regular, fontSize: 15, color: "#FFFFFF", paddingVertical: 10 },
  segment: { flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)", gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 40, borderRadius: 999 },
  segText: { fontFamily: FONT.semibold, fontSize: 14 },
  page: { gap: SPACING.XL, paddingTop: SPACING.LG, maxWidth: 1100, width: "100%", alignSelf: "center" },
  trust: { gap: 10, padding: 14, borderRadius: RADIUS.LG, borderWidth: 1 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  trustIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  trustText: { flex: 1, fontFamily: FONT.medium, fontSize: 13, lineHeight: 18 },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  filterBadgeText: { fontFamily: FONT.semibold, fontSize: 11 },
  reachRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  reachBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  reachText: { fontFamily: FONT.semibold, fontSize: 12.5 },
  zoneCount: { fontFamily: FONT.medium, fontSize: 11 },
  chips: { gap: 8, paddingEnd: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: FONT.semibold, fontSize: 13 },
  section: { gap: SPACING.MD },
  headRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  viewToggle: { flexDirection: "row", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 2 },
  viewBtn: { width: 34, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  sectionTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 21, lineHeight: 28 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  provHead: { flexDirection: "row", alignItems: "center", gap: SPACING.MD },
  provIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rating: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  ratingText: { fontFamily: FONT.bold, fontSize: 12 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  provActions: { flexDirection: "row", gap: SPACING.SM },
  provBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, borderRadius: RADIUS.MD },
  provBtnText: { fontFamily: FONT.semibold, fontSize: 14 },
  fab: { position: "absolute", end: SPACING.LG, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingHorizontal: 20, borderRadius: 999, ...({ boxShadow: "0 10px 24px rgba(90,74,214,0.35)" } as object), elevation: 6 },
  fabText: { fontFamily: FONT.bold, fontSize: 15, color: "#FFFFFF" },
});
