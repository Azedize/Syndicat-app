import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/components/DataState";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import { Card, Chip, SheetHeader } from "@/components/ui";
import { Feather } from "@/components/ui/Feather";
import { categoryLabelKey } from "@/features/marketplace/catalog";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFileTicket } from "@/hooks/useFileTicket";
import { useFormat } from "@/hooks/useFormat";
import { apiRequest } from "@/lib/api";
import { listingImages, resolveMediaUrl } from "@/lib/media";

type Queue = "pending_review" | "modification_requested" | "rejected";
type Listing = {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  category: string;
  imageUrls?: string | null;
  sellerName?: string | null;
  createdAt: string;
  status: string;
  rejectionReason?: string | null;
};
type Page = { data: Listing[]; pagination: { page: number; pages: number; total: number } };
type HistoryRow = { at: string; details: string | null; byRole: string | null };

const QUEUES: { key: Queue; labelKey: string }[] = [
  { key: "pending_review", labelKey: "modQueuePending" },
  { key: "modification_requested", labelKey: "modQueueChanges" },
  { key: "rejected", labelKey: "modQueueRejected" },
];

/**
 * The syndic validates the listings of their residence before they are
 * published: approve, ask for changes or refuse — always with a reason the
 * seller reads. Every decision is kept (history). Nothing here changes a
 * reserved or sold listing.
 */
function ModerationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const fmt = useFormat();
  const ticket = useFileTicket();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<Queue>("pending_review");
  const [decision, setDecision] = useState<{ listing: Listing; action: "reject" | "request_modification" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<{ listing: Listing; rows: HistoryRow[] | null } | null>(null);

  const q = useInfiniteQuery({
    queryKey: ["moderation-queue", queue],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => apiRequest<Page>(`/products/moderation-queue?status=${queue}&limit=20&page=${pageParam}`),
    getNextPageParam: (last) => (last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined),
  });
  const rows = (q.data?.pages ?? []).flatMap((p) => p.data);
  const total = q.data?.pages?.[0]?.pagination.total ?? 0;

  const act = async (listing: Listing, action: "approve" | "reject" | "request_modification", why?: string) => {
    setBusy(listing.id);
    try {
      await apiRequest(`/products/${listing.id}/moderate`, "POST", { action, ...(why ? { reason: why } : {}) });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDecision(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["moderation-queue"] });
      await qc.invalidateQueries({ queryKey: ["market-products"] });
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("error"));
    } finally {
      setBusy(null);
    }
  };

  const openHistory = async (listing: Listing) => {
    setHistory({ listing, rows: null });
    try {
      const r = await apiRequest<{ data: HistoryRow[] }>(`/products/${listing.id}/moderation-history`);
      setHistory({ listing, rows: r.data });
    } catch {
      setHistory({ listing, rows: [] });
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("modTitle")} subtitle={t("modSubtitle")} />
      <View style={styles.tabs}>
        {QUEUES.map((x) => (
          <Chip key={x.key} label={t(x.labelKey)} selected={queue === x.key} onPress={() => setQueue(x.key)} />
        ))}
      </View>
      {q.isLoading ? (
        <ActivityIndicator color={colors.tint} style={{ marginTop: 32 }} />
      ) : q.isError && !q.data ? (
        <ErrorState title={t("uiLoadErrorTitle")} description={t("uiLoadErrorHint")} retryLabel={t("retry")} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.LG, gap: SPACING.MD, paddingBottom: insets.bottom + 40 }}>
          <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("mkCount").replace("{n}", String(total))}</Text>
          {rows.length === 0 ? (
            <Card padding="lg" style={{ alignItems: "center", gap: 8 }}>
              <Feather name="check-circle" size={26} color={colors.success} />
              <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "center" }]}>{t("modEmpty")}</Text>
            </Card>
          ) : (
            rows.map((l) => {
              const cover = resolveMediaUrl(listingImages(l.imageUrls)[0], ticket);
              return (
                <Card key={l.id} padding="md" style={{ gap: SPACING.MD }}>
                  <View style={styles.row}>
                    {cover ? (
                      <Image source={{ uri: cover }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }]}>
                        <Feather name="image" size={22} color={colors.tint} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2}>{l.name}</Text>
                      <Text style={[TYPE.amount, { color: colors.foreground }]}>{fmt.money(l.price, { decimals: 0 })}</Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {[t(categoryLabelKey(l.category)), l.sellerName, fmt.date(l.createdAt)].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  </View>
                  {l.description ? <Text style={[TYPE.secondary, { color: colors.textSecondary }]} numberOfLines={4}>{l.description}</Text> : null}
                  {l.rejectionReason && queue !== "pending_review" ? (
                    <Text style={[TYPE.caption, { color: colors.warningText }]}>{t("modReason").replace("{r}", l.rejectionReason)}</Text>
                  ) : null}
                  <View style={styles.actions}>
                    {queue === "pending_review" ? (
                      <>
                        <Pressable disabled={busy === l.id} onPress={() => act(l, "approve")} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.success }]}>
                          {busy === l.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="check" size={15} color="#FFFFFF" />}
                          <Text style={[styles.btnText, { color: "#FFFFFF" }]}>{t("modApprove")}</Text>
                        </Pressable>
                        <Pressable onPress={() => { setReason(""); setDecision({ listing: l, action: "request_modification" }); }} accessibilityRole="button" style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}>
                          <Feather name="edit-3" size={15} color={colors.tint} />
                          <Text style={[styles.btnText, { color: colors.tint }]}>{t("modAskChanges")}</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {queue !== "rejected" ? (
                      <Pressable onPress={() => { setReason(""); setDecision({ listing: l, action: "reject" }); }} accessibilityRole="button" style={[styles.btn, { borderWidth: 1, borderColor: colors.danger }]}>
                        <Feather name="x" size={15} color={colors.danger} />
                        <Text style={[styles.btnText, { color: colors.danger }]}>{t("modReject")}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => openHistory(l)} accessibilityRole="button" style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}>
                      <Feather name="clock" size={15} color={colors.textSecondary} />
                      <Text style={[styles.btnText, { color: colors.textSecondary }]}>{t("modHistory")}</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })
          )}
          {q.hasNextPage ? (
            <Pressable onPress={() => q.fetchNextPage()} accessibilityRole="button" style={[styles.more, { borderColor: colors.border }]}>
              {q.isFetchingNextPage ? <ActivityIndicator color={colors.tint} /> : <Text style={[styles.btnText, { color: colors.tint }]}>{t("mkLoadMore")}</Text>}
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {/* Reason (refusal / changes) */}
      <Modal visible={!!decision} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDecision(null)}>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <SheetHeader title={decision?.action === "reject" ? t("modReject") : t("modAskChanges")} subtitle={decision?.listing.name} onClose={() => setDecision(null)} />
          <View style={{ padding: SPACING.LG, gap: SPACING.MD }}>
            <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("modReasonHint")}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder={t("modReasonPlaceholder")}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            />
            <Pressable
              disabled={reason.trim().length < 5 || busy === decision?.listing.id}
              onPress={() => decision && act(decision.listing, decision.action, reason.trim())}
              accessibilityRole="button"
              style={[styles.btn, { justifyContent: "center", paddingVertical: 14, backgroundColor: reason.trim().length >= 5 ? (decision?.action === "reject" ? colors.danger : colors.primary) : colors.muted }]}
            >
              <Text style={[styles.btnText, { color: "#FFFFFF" }]}>{t("modConfirm")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* History */}
      <Modal visible={!!history} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistory(null)}>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <SheetHeader title={t("modHistory")} subtitle={history?.listing.name} onClose={() => setHistory(null)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={{ padding: SPACING.LG, gap: SPACING.SM }}>
            {history?.rows === null ? (
              <ActivityIndicator color={colors.tint} />
            ) : history?.rows?.length ? (
              history.rows.map((h, i) => (
                <Card key={i} padding="md" style={{ gap: 2 }}>
                  <Text style={[TYPE.caption, { color: colors.textMuted }]}>{fmt.date(h.at)}{h.byRole ? ` · ${h.byRole === "super_admin" ? t("modByPlatform") : t("modBySyndic")}` : ""}</Text>
                  <Text style={[TYPE.secondary, { color: colors.foreground }]}>{h.details}</Text>
                </Card>
              ))
            ) : (
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("modNoHistory")}</Text>
            )}
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

export default function ModerationAnnonces() {
  return (
    <RoleGuard allow={["syndicate_admin", "super_admin"]}>
      <ModerationScreen />
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.SM, paddingHorizontal: SPACING.LG, paddingTop: SPACING.MD },
  row: { flexDirection: "row", gap: SPACING.MD, alignItems: "center" },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.MD },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.SM },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  more: { alignItems: "center", paddingVertical: 12, borderRadius: 999, borderWidth: 1 },
  input: { minHeight: 110, borderWidth: 1, borderRadius: RADIUS.MD, padding: SPACING.MD, textAlignVertical: "top", fontSize: 15 },
});
