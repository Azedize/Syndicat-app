import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import RoleGuard from "@/components/RoleGuard";
import { Button, Card, Chip, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";
import { localDate } from "@/lib/localDate";

type FeatherName = keyof typeof Feather.glyphMap;

const TYPE_CONFIG: Record<string, { label: string; icon: FeatherName; tone: StatusTone }> = {
  degat_eau: { label: "sinistreTypeWater", icon: "droplet", tone: "info" },
  incendie: { label: "sinistreTypeFire", icon: "alert-octagon", tone: "danger" },
  vol: { label: "sinistreTypeTheft", icon: "unlock", tone: "warning" },
  ascenseur: { label: "sinistreTypeElevator", icon: "chevrons-up", tone: "primary" },
  dommage_commun: { label: "sinistreTypeCommon", icon: "tool", tone: "warning" },
  autre: { label: "sinistreTypeOther", icon: "alert-triangle", tone: "neutral" },
};

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone; icon: FeatherName }> = {
  declared: { label: "sinistreStatusDeclared", tone: "warning", icon: "flag" },
  in_progress: { label: "sinistreStatusProgress", tone: "info", icon: "loader" },
  expert: { label: "sinistreStatusExpert", tone: "primary", icon: "search" },
  repair: { label: "sinistreStatusRepair", tone: "warning", icon: "tool" },
  closed: { label: "sinistreStatusClosed", tone: "success", icon: "check-circle" },
};

const URGENCY_CONFIG: Record<string, { label: string; tone: StatusTone; icon: FeatherName }> = {
  low: { label: "sinistreUrgencyLow", tone: "success", icon: "arrow-down-circle" },
  medium: { label: "sinistreUrgencyMedium", tone: "warning", icon: "minus-circle" },
  high: { label: "sinistreUrgencyHigh", tone: "danger", icon: "arrow-up-circle" },
  critical: { label: "sinistreUrgencyCritical", tone: "danger", icon: "alert-octagon" },
};

type Sinistre = {
  id: string;
  type: string;
  description: string;
  date: string;
  status: string;
  urgency?: string | null;
  buildingId: string;
  lotId?: string;
  estimatedAmount?: number | string | null;
  indemnisedAmount?: number | string | null;
  claimNumber?: string;
  reportedByName?: string;
  lot?: { number: string; floor: number } | null;
};

type Building = { id: string; name: string };

const today = () => localDate();
const emptyForm = () => ({ type: "degat_eau", urgency: "medium", description: "", date: today(), buildingId: "", estimatedAmount: "" });

// The API scopes the list: the syndicate team sees every incident of the
// syndicate, residents only the ones they reported themselves.
export default function SinistresScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"]}>
      <SinistresScreenInner />
    </RoleGuard>
  );
}

function SinistresScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, isRTL } = useLanguage();
  const { money, date } = useFormat();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const isResident = user?.role === "member" || user?.role === "tenant";

  const [sinistres, setSinistres] = useState<Sinistre[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [myLot, setMyLot] = useState<{ id: string; buildingId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError(false);
        }
        const data = await apiRequest("/sinistres", "GET", undefined, token);
        setSinistres(data.data ?? []);
        setLoadError(false);
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Buildings the person may declare for (scoped by the API) and, for a resident, their own lot.
  useEffect(() => {
    apiRequest("/buildings", "GET", undefined, token)
      .then((r) => setBuildings((r?.data ?? []).map((b: any) => ({ id: b.id, name: b.name }))))
      .catch(() => setBuildings([]));
    if (isResident) {
      apiRequest("/lots/my-lot", "GET", undefined, token)
        .then((r) => (r?.data?.id ? setMyLot({ id: r.data.id, buildingId: r.data.buildingId }) : null))
        .catch(() => setMyLot(null));
    }
  }, [token, isResident]);

  const openForm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm({ ...emptyForm(), buildingId: myLot?.buildingId ?? (buildings.length === 1 ? buildings[0].id : "") });
    setShowModal(true);
  };

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(form.date) && !Number.isNaN(new Date(form.date).getTime());
  const amountValid = !form.estimatedAmount || (Number.isFinite(Number(form.estimatedAmount.replace(",", "."))) && Number(form.estimatedAmount.replace(",", ".")) >= 0);

  const handleSubmit = async () => {
    if (!form.description.trim()) {
      showToast({ type: "warning", title: t("requiredFields"), message: t("sinistreDescriptionRequired") });
      return;
    }
    if (!form.buildingId || !dateValid || !amountValid) {
      showToast({ type: "warning", title: t("requiredFields"), message: t("uiSinistreFormInvalid") });
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest(
        "/sinistres",
        "POST",
        {
          type: form.type,
          urgency: form.urgency,
          description: form.description.trim(),
          date: form.date,
          buildingId: form.buildingId,
          lotId: myLot && myLot.buildingId === form.buildingId ? myLot.id : undefined,
          estimatedAmount: form.estimatedAmount ? Number(form.estimatedAmount.replace(",", ".")) : undefined,
        },
        token,
      );
      setShowModal(false);
      setForm(emptyForm());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("sinistreDeclaredTitle"), message: t("sinistreDeclaredMessage") });
      load(true);
    } catch {
      showToast({ type: "error", title: t("error"), message: t("sinistreCreateError") });
    } finally {
      setSubmitting(false);
    }
  };

  const openCount = sinistres.filter((s) => s.status !== "closed").length;
  const closedCount = sinistres.length - openCount;
  const totalEstimated = sinistres.reduce((s, si) => s + (Number(si.estimatedAmount) || 0), 0);
  const visible = filter === "all" ? sinistres : sinistres.filter((s) => (filter === "closed" ? s.status === "closed" : s.status !== "closed"));

  const header = (
    <ScreenHeader
      title={t("sinistresTitle")}
      subtitle={!loading ? t("sinistreDeclaredCount").replace("{count}", String(sinistres.length)) : undefined}
      action={{ icon: "plus", label: t("newSinistre"), onPress: openForm }}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      {header}

      {loading ? (
        <View style={{ padding: 16, gap: 12 }} accessibilityLabel={t("sinistresLoadingTitle")}>
          <Skeleton height={86} radius={RADIUS.LG} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={130} radius={RADIUS.LG} />
          ))}
        </View>
      ) : loadError ? (
        <ErrorState title={t("sinistresUnavailableTitle")} description={t("sinistresUnavailableDescription")} retryLabel={t("retry")} onRetry={() => void load()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: isWide ? 32 : insets.bottom + 100, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {sinistres.length > 0 ? (
            <Card padding="md">
              <View style={styles.stats}>
                {[
                  { label: t("sinistreOpen"), value: String(openCount), tone: "warning" as StatusTone },
                  { label: t("sinistreClosed"), value: String(closedCount), tone: "success" as StatusTone },
                  { label: t("sinistreEstimated"), value: money(totalEstimated, { decimals: 0 }), tone: "neutral" as StatusTone },
                ].map((s) => (
                  <View key={s.label} style={styles.stat}>
                    <Text style={[TYPE.subtitle, { color: toneColors(colors, s.tone).text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {s.value}
                    </Text>
                    <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "center" }]} numberOfLines={2}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {sinistres.length > 0 ? (
            <View style={styles.chips}>
              {(
                [
                  ["all", `${t("filterToutes")} · ${sinistres.length}`],
                  ["open", `${t("sinistreOpen")} · ${openCount}`],
                  ["closed", `${t("sinistreClosed")} · ${closedCount}`],
                ] as const
              ).map(([k, label]) => (
                <Chip key={k} label={label} selected={filter === k} onPress={() => setFilter(k)} />
              ))}
            </View>
          ) : null}

          {sinistres.length === 0 ? (
            <EmptyState icon="shield" title={t("noSinistres")} description={t("sinistresEmptyDescription")} actionLabel={t("newSinistre")} onAction={openForm} />
          ) : (
            visible.map((s) => {
              const tc = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.autre;
              const sc = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.declared;
              const uc = s.urgency ? URGENCY_CONFIG[s.urgency] : undefined;
              const tone = toneColors(colors, tc.tone);
              const meta = [date(s.date), s.lot ? `${t("lotLabel")} ${s.lot.number}` : null, !isResident ? s.reportedByName : null].filter(Boolean).join(" · ");
              return (
                <Card key={s.id} padding="md" style={{ gap: 12 }}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeIcon, { backgroundColor: tone.bg }]}>
                      <Feather name={tc.icon} size={20} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]}>{t(tc.label)}</Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]} numberOfLines={1}>
                        {meta}
                      </Text>
                    </View>
                    <StatusBadge label={t(sc.label)} tone={sc.tone} icon={sc.icon} />
                  </View>
                  <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]} numberOfLines={3}>
                    {s.description}
                  </Text>
                  {uc || s.claimNumber || s.estimatedAmount ? (
                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                      {uc ? <StatusBadge label={t(uc.label)} tone={uc.tone} icon={uc.icon} /> : null}
                      {s.claimNumber ? (
                        <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                          {t("sinistreDossier")} {s.claimNumber}
                        </Text>
                      ) : null}
                      {s.estimatedAmount ? (
                        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                          {t("sinistreEstimated")} {money(s.estimatedAmount)}
                          {s.indemnisedAmount ? ` · ${t("sinistreIndemnised")} ${money(s.indemnisedAmount)}` : ""}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("sinistreDeclareTitle")} onClose={() => setShowModal(false)} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>
                {t("building")} <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              {buildings.length === 0 ? (
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("uiSinistreNoBuilding")}</Text>
              ) : (
                <View style={styles.chips}>
                  {buildings.map((b) => (
                    <Chip key={b.id} label={b.name} icon="home" selected={form.buildingId === b.id} onPress={() => setForm((p) => ({ ...p, buildingId: b.id }))} />
                  ))}
                </View>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{t("sinistreType")}</Text>
              <View style={styles.chips}>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <Chip key={k} label={t(v.label)} icon={v.icon} selected={form.type === k} onPress={() => setForm((p) => ({ ...p, type: k }))} />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{t("sinistreUrgency")}</Text>
              <View style={styles.chips}>
                {Object.entries(URGENCY_CONFIG).map(([k, v]) => (
                  <Chip key={k} label={t(v.label)} icon={v.icon} selected={form.urgency === k} onPress={() => setForm((p) => ({ ...p, urgency: k }))} />
                ))}
              </View>
            </View>

            <TextField
              label={t("uiDescription")}
              required
              placeholder={t("sinistreDescriptionPlaceholder")}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              multiline
            />
            <TextField
              label={t("sinistreDate")}
              placeholder={today()}
              value={form.date}
              onChangeText={(v) => setForm((p) => ({ ...p, date: v }))}
              error={form.date && !dateValid ? t("uiDateFormat") : undefined}
              keyboardType="numbers-and-punctuation"
            />
            <TextField
              label={`${t("sinistreEstimatedDamage")} (MAD)`}
              placeholder={t("sinistreEstimatedPlaceholder")}
              value={form.estimatedAmount}
              onChangeText={(v) => setForm((p) => ({ ...p, estimatedAmount: v }))}
              error={!amountValid ? t("uiAmountInvalid") : undefined}
              keyboardType="decimal-pad"
            />

            <Button
              label={t("sinistreDeclareAction")}
              icon="send"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!form.description.trim() || !form.buildingId || !dateValid || !amountValid}
              onPress={handleSubmit}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  typeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  field: { gap: 8 },
});
