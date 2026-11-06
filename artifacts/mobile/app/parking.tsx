import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { localeOf } from "@/hooks/useFormat";
import { useToast } from "@/context/ToastContext";
import { ErrorState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { Button, Card, Chip, IconButton, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE, FONT } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";
import { captureAndUploadPhoto, pickAndUploadPhoto } from "@/lib/upload";
import { parking } from "@/features/parking/api";

type Tab = "vehicles" | "violations" | "reservations";
type FeatherName = keyof typeof Feather.glyphMap;

interface ApiSpot {
  id: string;
  buildingId: string;
  spotNumber: string;
  type: string;
  floor?: string | null;
  status: string;
  lot?: { number: string } | null;
}
interface ApiVehicle {
  id: string;
  plateNumber: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  status: string;
  lot?: { number: string } | null;
}
interface ApiViolation {
  id: string;
  plateNumber: string;
  notes?: string | null;
  photoUrl?: string | null;
  status: string;
  reportedAt: string;
  reportedByName: string;
  spot?: { spotNumber: string } | null;
}
interface ApiReservation {
  id: string;
  visitorName: string;
  visitorPlate?: string | null;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string | null;
  spot?: { spotNumber: string; floor?: string | null } | null;
}

const STATUS_META: Record<string, { key: string; tone: StatusTone }> = {
  open: { key: "statusOpen", tone: "danger" },
  resolved: { key: "statusResolved", tone: "success" },
  dismissed: { key: "parkingStatusDismissed", tone: "neutral" },
  confirmed: { key: "parkingStatusConfirmed", tone: "info" },
  cancelled: { key: "statusCancelled", tone: "neutral" },
  expired: { key: "statusExpired", tone: "warning" },
  active: { key: "statusActive", tone: "success" },
  inactive: { key: "statusInactive", tone: "neutral" },
  available: { key: "spotAvailable", tone: "success" },
  occupied: { key: "spotOccupied", tone: "danger" },
  reserved: { key: "spotReserved", tone: "warning" },
  maintenance: { key: "parkingStatusMaintenance", tone: "neutral" },
};

/** Labels from the translations already carry " *"; TextField draws its own marker. */
const bare = (label: string) => label.replace(/\s*\*\s*$/, "");

/** dd/mm/yyyy + HH:MM read in the phone's time zone; null if not a real date. */
function localDateTime(day: string, time: string): Date | null {
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(day.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [d, m, y, h, min] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  if (h > 23 || min > 59) return null;
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export default function ParkingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, lang, isRTL } = useLanguage();
  const { showToast } = useToast();
  const locale = localeOf(lang);
  const dateTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  };
  const statusBadge = (status: string) => {
    const m = STATUS_META[status];
    return <StatusBadge label={m ? t(m.key) : status} tone={m?.tone ?? "neutral"} icon={null} />;
  };

  const [activeTab, setActiveTab] = useState<Tab>("vehicles");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [mySpot, setMySpot] = useState<ApiSpot | null>(null);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [violations, setViolations] = useState<ApiViolation[]>([]);
  const [reservations, setReservations] = useState<ApiReservation[]>([]);
  const [allSpots, setAllSpots] = useState<ApiSpot[]>([]); // all accessible spots for selectors
  const [visitorSpots, setVisitorSpots] = useState<ApiSpot[]>([]);

  // ─── Vehicle sheet ────────────────────────────────────────────────────────
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vPlate, setVPlate] = useState("");
  const [vBrand, setVBrand] = useState("");
  const [vModel, setVModel] = useState("");
  const [vColor, setVColor] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);

  // ─── Violation sheet ──────────────────────────────────────────────────────
  const [showReportViolation, setShowReportViolation] = useState(false);
  const [rPlate, setRPlate] = useState("");
  const [rNotes, setRNotes] = useState("");
  const [rPhotoUrl, setRPhotoUrl] = useState<string | null>(null);
  const [rSpot, setRSpot] = useState<ApiSpot | null>(null); // selected spot (provides buildingId)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingViolation, setSavingViolation] = useState(false);

  // ─── Reservation sheet ────────────────────────────────────────────────────
  const [showReserve, setShowReserve] = useState(false);
  const [resSpotId, setResSpotId] = useState("");
  const [resVisitorName, setResVisitorName] = useState("");
  const [resVisitorPlate, setResVisitorPlate] = useState("");
  const [resStartDate, setResStartDate] = useState("");
  const [resStartTime, setResStartTime] = useState("09:00");
  const [resEndTime, setResEndTime] = useState("18:00");
  const [resNotes, setResNotes] = useState("");
  const [savingReservation, setSavingReservation] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [spotsRes, allSpotsRes, vehiclesRes, violationsRes, reservationsRes] = await Promise.allSettled([
        parking.mySpot(),
        parking.spots(),
        parking.vehicles(),
        parking.violations(),
        parking.reservations(),
      ]);

      if (spotsRes.status === "fulfilled") setMySpot((spotsRes.value as any).data ?? null);
      if (allSpotsRes.status === "fulfilled") {
        const fetched = ((allSpotsRes.value as any).data ?? []) as ApiSpot[];
        setAllSpots(fetched);
        setVisitorSpots(fetched.filter((s) => s.type === "visitor" && s.status === "available"));
      }
      if (vehiclesRes.status === "fulfilled") setVehicles(((vehiclesRes.value as any).data ?? []) as ApiVehicle[]);
      if (violationsRes.status === "fulfilled") setViolations(((violationsRes.value as any).data ?? []) as ApiViolation[]);
      if (reservationsRes.status === "fulfilled") setReservations(((reservationsRes.value as any).data ?? []) as ApiReservation[]);
      if ([spotsRes, allSpotsRes, vehiclesRes, violationsRes, reservationsRes].some((result) => result.status === "rejected")) {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  // ─── Add vehicle ──────────────────────────────────────────────────────────
  const handleAddVehicle = async () => {
    if (!vPlate.trim()) {
      showToast({ type: "warning", title: t("required"), message: t("parkingPlateRequiredError") });
      return;
    }
    setSavingVehicle(true);
    try {
      await parking.registerVehicle({
        plateNumber: vPlate.trim().toUpperCase(),
        brand: vBrand.trim() || undefined,
        model: vModel.trim() || undefined,
        color: vColor.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddVehicle(false);
      setVPlate("");
      setVBrand("");
      setVModel("");
      setVColor("");
      showToast({ type: "success", title: t("parkingVehicleSaved"), message: t("parkingVehicleSavedMessage") });
      load(true);
    } catch {
      showToast({ type: "error", title: t("error"), message: t("parkingOperationError") });
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleDeleteVehicle = (id: string, plate: string) => {
    Alert.alert(t("parkingDeleteVehicle"), t("parkingDeleteVehicleQuestion").replace("{plate}", plate), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("parkingDeleteVehicle"),
        style: "destructive",
        onPress: async () => {
          try {
            await parking.deleteVehicle(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast({ type: "success", title: t("parkingVehicleDeleted"), message: t("parkingVehicleRemoved") });
            load(true);
          } catch {
            showToast({ type: "error", title: t("error"), message: t("parkingOperationError") });
          }
        },
      },
    ]);
  };

  // ─── Report violation ─────────────────────────────────────────────────────
  const handlePhoto = async (camera: boolean) => {
    setUploadingPhoto(true);
    try {
      const result = camera ? await captureAndUploadPhoto() : await pickAndUploadPhoto();
      if (result) {
        setRPhotoUrl(result.objectPath);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      Alert.alert(t("error"), t("parkingPhotoError"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleReportViolation = async () => {
    if (!rPlate.trim()) return Alert.alert(t("error"), t("parkingPlateRequiredError"));
    if (!rSpot) return Alert.alert(t("error"), t("parkingSpotRequiredError"));
    setSavingViolation(true);
    try {
      await parking.reportViolation({
        buildingId: rSpot.buildingId,
        spotId: rSpot.id,
        plateNumber: rPlate.trim().toUpperCase(),
        photoUrl: rPhotoUrl ?? undefined,
        notes: rNotes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReportViolation(false);
      setRPlate("");
      setRNotes("");
      setRPhotoUrl(null);
      setRSpot(null);
      setActiveTab("violations");
      load(true);
    } catch {
      Alert.alert(t("error"), t("parkingOperationError"));
    } finally {
      setSavingViolation(false);
    }
  };

  // ─── Reserve visitor spot ─────────────────────────────────────────────────
  const resStart = localDateTime(resStartDate, resStartTime);
  const resEnd = localDateTime(resStartDate, resEndTime);
  const resDateError = resStartDate.trim() && !localDateTime(resStartDate, "00:00") ? t("parkingDateFormatError") : undefined;
  const resTimeError = resStart && resEnd && resEnd <= resStart ? t("uiParkingEndAfterStart") : resStartDate.trim() && !resDateError && (!resStart || !resEnd) ? t("uiParkingTimeFormat") : undefined;

  const handleReserve = async () => {
    if (!resSpotId) return Alert.alert(t("error"), t("parkingVisitorSpotRequiredError"));
    if (!resVisitorName.trim()) return Alert.alert(t("error"), t("parkingVisitorNameRequiredError"));
    if (!resStartDate) return Alert.alert(t("error"), t("parkingDateRequiredError"));
    if (!resStart || !resEnd || resEnd <= resStart) return Alert.alert(t("error"), resTimeError ?? t("parkingDateFormatError"));

    setSavingReservation(true);
    try {
      await parking.reserve({
        spotId: resSpotId,
        visitorName: resVisitorName.trim(),
        visitorPlate: resVisitorPlate.trim().toUpperCase() || undefined,
        // Absolute instants: the phone's local time, not the server's time zone.
        startTime: resStart.toISOString(),
        endTime: resEnd.toISOString(),
        notes: resNotes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReserve(false);
      setResVisitorName("");
      setResVisitorPlate("");
      setResStartDate("");
      setResStartTime("09:00");
      setResEndTime("18:00");
      setResNotes("");
      setResSpotId("");
      setActiveTab("reservations");
      load(true);
    } catch {
      Alert.alert(t("error"), t("parkingOperationError"));
    } finally {
      setSavingReservation(false);
    }
  };

  const handleCancelReservation = (id: string) => {
    Alert.alert(t("cancel"), t("parkingCancelReservation"), [
      { text: t("no"), style: "cancel" },
      {
        text: `${t("yes")}, ${t("cancel").toLowerCase()}`,
        style: "destructive",
        onPress: async () => {
          try {
            await parking.cancelReservation(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            load(true);
          } catch {
            Alert.alert(t("error"), t("parkingOperationError"));
          }
        },
      },
    ]);
  };

  const Plate = ({ plate, tone }: { plate: string; tone: StatusTone }) => {
    const tc = toneColors(colors, tone);
    return (
      <View style={[styles.plate, { borderColor: tc.fg, backgroundColor: colors.card }]}>
        <Text style={[styles.plateText, { color: colors.foreground }]}>{plate}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("parkingTitle")} />
        <View style={{ padding: 16, gap: 12 }} accessibilityLabel={t("parkingLoadingTitle")}>
          <Skeleton height={76} radius={RADIUS.LG} />
          <Skeleton height={44} radius={RADIUS.MD} />
          {[0, 1].map((i) => (
            <Skeleton key={i} height={92} radius={RADIUS.LG} />
          ))}
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("parkingTitle")} />
        <ErrorState title={t("parkingUnavailableTitle")} description={t("parkingUnavailableDescription")} retryLabel={t("retry")} onRetry={() => void load()} accentColor={colors.primary} />
      </View>
    );
  }

  const TABS: { key: Tab; label: string; icon: FeatherName; count: number }[] = [
    { key: "vehicles", label: t("parkingVehicles"), icon: "truck", count: vehicles.length },
    { key: "violations", label: t("parkingViolations"), icon: "alert-circle", count: violations.length },
    { key: "reservations", label: t("parkingVisitors"), icon: "calendar", count: reservations.length },
  ];

  const spotTypeLabel = (type: string) => (type === "garage" ? t("parkingGarage") : type === "visitor" ? t("parkingVisitor") : t("parkingResident"));

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader title={t("parkingTitle")} />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {mySpot ? (
          <View style={[styles.spotHero, { backgroundColor: colors.navy }]}>
            <View style={[styles.spotSign, { borderColor: colors.gold }]}>
              <Text style={[styles.spotSignP, { color: colors.gold }]}>P</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[TYPE.caption, { color: "rgba(255,255,255,0.7)", textAlign: "auto" }]}>{spotTypeLabel(mySpot.type)}</Text>
              <Text style={[TYPE.title, { color: "#fff", textAlign: "auto" }]}>
                {t("parkingPlace")} {mySpot.spotNumber}
              </Text>
              <Text style={[TYPE.caption, { color: "rgba(255,255,255,0.7)", textAlign: "auto" }]} numberOfLines={1}>
                {[mySpot.floor, mySpot.lot ? `${t("parkingLot")} ${mySpot.lot.number}` : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {statusBadge(mySpot.status)}
          </View>
        ) : null}

        <View style={[styles.segment, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
          {TABS.map((tb) => {
            const active = activeTab === tb.key;
            return (
              <Pressable
                key={tb.key}
                onPress={() => setActiveTab(tb.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.segBtn, active && { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name={tb.icon} size={14} color={active ? colors.primary : colors.textMuted} />
                <Text style={[TYPE.label, { color: active ? colors.foreground : colors.textMuted }]} numberOfLines={1}>
                  {tb.label}
                  {tb.count ? ` · ${tb.count}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Vehicles ── */}
        {activeTab === "vehicles" && (
          <>
            <Button label={t("parkingAddVehicle")} icon="plus" fullWidth onPress={() => setShowAddVehicle(true)} />
            {vehicles.length === 0 ? (
              <EmptyState icon="truck" title={t("parkingNoVehicles")} />
            ) : (
              vehicles.map((v) => (
                <Card key={v.id} padding="md" style={{ gap: 10 }}>
                  <View style={styles.row}>
                    <Plate plate={v.plateNumber} tone="primary" />
                    {statusBadge(v.status)}
                    <View style={{ flex: 1 }} />
                    <IconButton icon="trash-2" accessibilityLabel={`${t("parkingDeleteVehicle")} ${v.plateNumber}`} onPress={() => handleDeleteVehicle(v.id, v.plateNumber)} />
                  </View>
                  <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]}>
                    {[v.brand, v.model, v.color].filter(Boolean).join(" · ") || t("parkingNoBrand")}
                    {v.lot ? ` · ${t("parkingLot")} ${v.lot.number}` : ""}
                  </Text>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── Violations ── */}
        {activeTab === "violations" && (
          <>
            <Button label={t("parkingReportViolation")} icon="camera" variant="secondary" fullWidth onPress={() => setShowReportViolation(true)} />
            {violations.length === 0 ? (
              <EmptyState icon="check-circle" title={t("parkingNoViolations")} />
            ) : (
              violations.map((v) => (
                <Card key={v.id} padding="md" style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Plate plate={v.plateNumber} tone="danger" />
                    {statusBadge(v.status)}
                    {v.photoUrl ? <Feather name="image" size={14} color={colors.textMuted} accessibilityLabel={t("parkingProofPhoto")} /> : null}
                  </View>
                  {v.spot || v.notes ? (
                    <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]}>
                      {[v.spot ? `${t("parkingPlace")} ${v.spot.spotNumber}` : null, v.notes].filter(Boolean).join(" — ")}
                    </Text>
                  ) : null}
                  <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]}>
                    {dateTime(v.reportedAt)} · {v.reportedByName}
                  </Text>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── Visitor reservations ── */}
        {activeTab === "reservations" && (
          <>
            {visitorSpots.length > 0 ? (
              <Button label={t("parkingReserveVisitor")} icon="calendar" fullWidth onPress={() => setShowReserve(true)} />
            ) : (
              <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
                <Feather name="info" size={15} color={colors.textMuted} />
                <Text style={[TYPE.secondary, { color: colors.textSecondary, flex: 1 }]}>{t("parkingNoVisitorAvailable")}</Text>
              </View>
            )}
            {reservations.length === 0 ? (
              <EmptyState icon="calendar" title={t("parkingNoReservations")} />
            ) : (
              reservations.map((r) => (
                <Card key={r.id} padding="md" style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Text style={[TYPE.bodyStrong, { color: colors.foreground, flex: 1, textAlign: "auto" }]} numberOfLines={1}>
                      {r.visitorName}
                    </Text>
                    {statusBadge(r.status)}
                  </View>
                  <View style={styles.row}>
                    {r.visitorPlate ? <Plate plate={r.visitorPlate} tone="success" /> : null}
                    {r.spot ? (
                      <Text style={[TYPE.secondary, { color: colors.textSecondary }]}>
                        {t("parkingPlace")} {r.spot.spotNumber}
                        {r.spot.floor ? ` · ${r.spot.floor}` : ""}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]}>
                    {dateTime(r.startTime)} → {dateTime(r.endTime)}
                  </Text>
                  {r.status === "confirmed" ? <Button label={t("cancel")} icon="x" variant="ghost" size="sm" onPress={() => handleCancelReservation(r.id)} /> : null}
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* ── Add vehicle ── */}
      <Modal visible={showAddVehicle} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddVehicle(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("parkingRegisterVehicle")} onClose={() => setShowAddVehicle(false)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <TextField label={bare(t("parkingPlateRequired"))} required placeholder={t("parkingPlatePlaceholder")} value={vPlate} onChangeText={(x) => setVPlate(x.toUpperCase())} autoCapitalize="characters" />
            <TextField label={t("parkingBrand")} placeholder={t("parkingBrandPlaceholder")} value={vBrand} onChangeText={setVBrand} />
            <TextField label={t("parkingModel")} placeholder={t("parkingModelPlaceholder")} value={vModel} onChangeText={setVModel} />
            <TextField label={t("parkingColor")} placeholder={t("parkingColorPlaceholder")} value={vColor} onChangeText={setVColor} />
            <Button label={t("save")} icon="check" size="lg" fullWidth loading={savingVehicle} disabled={!vPlate.trim()} onPress={handleAddVehicle} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      {/* ── Report a violation ── */}
      <Modal visible={showReportViolation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReportViolation(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("parkingReportViolation")} onClose={() => setShowReportViolation(false)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>
                {bare(t("parkingPlaceRequired"))} <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              {allSpots.length === 0 ? (
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("parkingNoAccessibleSpot")}</Text>
              ) : (
                <View style={styles.chips}>
                  {allSpots.map((s) => (
                    <Chip key={s.id} label={s.floor ? `${s.spotNumber} · ${s.floor}` : s.spotNumber} selected={rSpot?.id === s.id} onPress={() => setRSpot(s)} />
                  ))}
                </View>
              )}
            </View>
            <TextField label={bare(t("parkingViolationPlate"))} required placeholder={t("parkingPlatePlaceholder")} value={rPlate} onChangeText={(x) => setRPlate(x.toUpperCase())} autoCapitalize="characters" />
            <TextField label={t("notesLabel")} placeholder={t("parkingDescribeSituation")} value={rNotes} onChangeText={setRNotes} multiline />
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{t("parkingProofPhoto")}</Text>
              {rPhotoUrl ? (
                <View style={[styles.note, { backgroundColor: colors.successSoft }]}>
                  <Feather name="check-circle" size={16} color={colors.success} />
                  <Text style={[TYPE.secondary, { color: colors.successText, flex: 1 }]}>{t("parkingPhotoAdded")}</Text>
                  <IconButton icon="x" accessibilityLabel={t("cancel")} onPress={() => setRPhotoUrl(null)} />
                </View>
              ) : uploadingPhoto ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={styles.row}>
                  <Button label={t("parkingTakePhoto")} icon="camera" variant="secondary" size="sm" onPress={() => handlePhoto(true)} />
                  <Button label={t("uiPhotoGallery")} icon="image" variant="secondary" size="sm" onPress={() => handlePhoto(false)} />
                </View>
              )}
            </View>
            <Button label={t("parkingSubmitViolation")} icon="send" size="lg" fullWidth loading={savingViolation} disabled={!rPlate.trim() || !rSpot || uploadingPhoto} onPress={handleReportViolation} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      {/* ── Reserve a visitor spot ── */}
      <Modal visible={showReserve} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReserve(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={t("parkingReservationTitle")} onClose={() => setShowReserve(false)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>
                {t("parkingAvailableVisitorSpot")} <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              {visitorSpots.length === 0 ? (
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("parkingNoVisitorAvailable")}</Text>
              ) : (
                <View style={styles.chips}>
                  {visitorSpots.map((s) => (
                    <Chip key={s.id} label={s.floor ? `${s.spotNumber} · ${s.floor}` : s.spotNumber} selected={resSpotId === s.id} onPress={() => setResSpotId(s.id)} />
                  ))}
                </View>
              )}
            </View>
            <TextField label={bare(t("parkingVisitorName"))} required placeholder={t("nameLabel")} value={resVisitorName} onChangeText={setResVisitorName} />
            <TextField label={t("parkingVisitorPlate")} placeholder={t("parkingPlatePlaceholder")} value={resVisitorPlate} onChangeText={(x) => setResVisitorPlate(x.toUpperCase())} autoCapitalize="characters" />
            <TextField label={bare(t("parkingDateRequired"))} required placeholder={t("parkingDatePlaceholder")} value={resStartDate} onChangeText={setResStartDate} keyboardType="numbers-and-punctuation" error={resDateError} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField label={t("parkingStartTime")} placeholder="09:00" value={resStartTime} onChangeText={setResStartTime} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label={t("parkingEndTime")} placeholder="18:00" value={resEndTime} onChangeText={setResEndTime} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            {resTimeError ? <Text style={[TYPE.caption, { color: colors.dangerText }]}>{resTimeError}</Text> : null}
            <TextField label={t("notesLabel")} placeholder={t("parkingVisitPurpose")} value={resNotes} onChangeText={setResNotes} multiline />
            <Button
              label={t("parkingConfirmReservation")}
              icon="check"
              size="lg"
              fullWidth
              loading={savingReservation}
              disabled={!resSpotId || !resVisitorName.trim() || !resStart || !resEnd || resEnd <= resStart}
              onPress={handleReserve}
            />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  spotHero: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: RADIUS.LG, padding: 16 },
  spotSign: { width: 52, height: 52, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  spotSignP: { fontFamily: FONT.bold, fontSize: 28, lineHeight: 34 },
  segment: { flexDirection: "row", borderRadius: RADIUS.MD, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, borderRadius: RADIUS.SM, borderWidth: 1, borderColor: "transparent", paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  plate: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  plateText: { fontFamily: FONT.bold, fontSize: 14, letterSpacing: 1.5 },
  note: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: RADIUS.MD },
  sheetBody: { padding: 20, gap: 16, paddingBottom: 60 },
});
