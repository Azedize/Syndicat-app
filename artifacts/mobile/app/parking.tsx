import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { ErrorState, LoadingState } from "@/components/DataState";
import { captureAndUploadPhoto, pickAndUploadPhoto } from "@/lib/upload";
import { parking } from "@/services/api";

type Tab = "vehicles" | "violations" | "reservations";

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

const STATUS_COLORS: Record<string, string> = {
  open: "#ef4444",
  resolved: "#10b981",
  dismissed: "#6b7280",
  confirmed: "#2563EB",
  cancelled: "#6b7280",
  expired: "#f59e0b",
  active: "#10b981",
  inactive: "#6b7280",
  available: "#10b981",
  occupied: "#ef4444",
  reserved: "#f59e0b",
  maintenance: "#6b7280",
};

function getStatusLabel(status: string, t: (key: string) => string) {
  const keys: Record<string, string> = {
    open: "statusOpen",
    resolved: "statusResolved",
    dismissed: "parkingStatusDismissed",
    confirmed: "parkingStatusConfirmed",
    cancelled: "statusCancelled",
    expired: "statusExpired",
    active: "statusActive",
    inactive: "statusInactive",
    available: "spotAvailable",
    occupied: "spotOccupied",
    reserved: "spotReserved",
    maintenance: "parkingStatusMaintenance",
  };
  return t(keys[status] ?? "unknown");
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "44" }]}>
      <Text style={[styles.badgeText, { color }]}>{getStatusLabel(status, t)}</Text>
    </View>
  );
}

function formatDateTime(iso: string, lang: string) {
  try {
    const d = new Date(iso);
    const locale = lang === "ar" ? "ar-MA" : lang === "es" ? "es-ES" : lang === "en" ? "en-GB" : "fr-FR";
    return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

export default function ParkingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const { showToast } = useToast();

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

  // ─── Vehicle modal ────────────────────────────────────────────────────────
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vPlate, setVPlate] = useState("");
  const [vBrand, setVBrand] = useState("");
  const [vModel, setVModel] = useState("");
  const [vColor, setVColor] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);

  // ─── Violation modal ──────────────────────────────────────────────────────
  const [showReportViolation, setShowReportViolation] = useState(false);
  const [rPlate, setRPlate] = useState("");
  const [rNotes, setRNotes] = useState("");
  const [rPhotoUrl, setRPhotoUrl] = useState<string | null>(null);
  const [rSpot, setRSpot] = useState<ApiSpot | null>(null); // selected spot (provides buildingId)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingViolation, setSavingViolation] = useState(false);

  // ─── Reservation modal ────────────────────────────────────────────────────
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

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

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
      setVPlate(""); setVBrand(""); setVModel(""); setVColor("");
      showToast({ type: "success", title: t("parkingVehicleSaved"), message: t("parkingVehicleSavedMessage") });
      load(true);
    } catch (e: any) {
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
          } catch (e: any) {
            showToast({ type: "error", title: t("error"), message: t("parkingOperationError") });
          }
        },
      },
    ]);
  };

  // ─── Report violation ─────────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    setUploadingPhoto(true);
    try {
      const result = await captureAndUploadPhoto();
      if (result) {
        setRPhotoUrl(result.objectPath);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        // Fallback to gallery if camera not available or permission denied
        const galleryResult = await pickAndUploadPhoto();
        if (galleryResult) setRPhotoUrl(galleryResult.objectPath);
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
      setRPlate(""); setRNotes(""); setRPhotoUrl(null); setRSpot(null);
      setActiveTab("violations");
      load(true);
    } catch (e: any) {
      Alert.alert(t("error"), t("parkingOperationError"));
    } finally {
      setSavingViolation(false);
    }
  };

  // ─── Reserve visitor spot ─────────────────────────────────────────────────
  const handleReserve = async () => {
    if (!resSpotId) return Alert.alert(t("error"), t("parkingVisitorSpotRequiredError"));
    if (!resVisitorName.trim()) return Alert.alert(t("error"), t("parkingVisitorNameRequiredError"));
    if (!resStartDate) return Alert.alert(t("error"), t("parkingDateRequiredError"));

    const dateParts = resStartDate.split("/");
    if (dateParts.length !== 3) return Alert.alert(t("error"), t("parkingDateFormatError"));
    const [d, m, y] = dateParts;
    const startISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${resStartTime}:00`;
    const endISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${resEndTime}:00`;

    setSavingReservation(true);
    try {
      await parking.reserve({
        spotId: resSpotId,
        visitorName: resVisitorName.trim(),
        visitorPlate: resVisitorPlate.trim().toUpperCase() || undefined,
        startTime: startISO,
        endTime: endISO,
        notes: resNotes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReserve(false);
      setResVisitorName(""); setResVisitorPlate(""); setResStartDate(""); setResStartTime("09:00"); setResEndTime("18:00"); setResNotes(""); setResSpotId("");
      setActiveTab("reservations");
      load(true);
    } catch (e: any) {
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
          } catch (e: any) {
            Alert.alert(t("error"), t("parkingOperationError"));
          }
        },
      },
    ]);
  };

  // ─── Colors ───────────────────────────────────────────────────────────────
  const bg = colors.background;
  const card = colors.card;
  const text = colors.text;
  const sub = colors.mutedForeground;
  const border = colors.border;
  const primary = "#2563EB";

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>
        <LoadingState
          title={t("parkingLoadingTitle")}
          description={t("parkingLoadingDescription")}
          accentColor={primary}
        />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>
        <ErrorState
          title={t("parkingUnavailableTitle")}
          description={t("parkingUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => void load()}
          accentColor={primary}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: text }]}>{t("parkingTitle")}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* My Spot Banner */}
      {mySpot && (
        <View style={[styles.spotBanner, { backgroundColor: primary + "15", borderColor: primary + "33" }]}>
          <Feather name="map-pin" size={18} color={primary} />
          <View style={{ flex: 1, marginStart: 10 }}>
            <Text style={[styles.spotNum, { color: primary }]}>{t("parkingPlace")} {mySpot.spotNumber}</Text>
            <Text style={[styles.spotSub, { color: sub }]}>
              {mySpot.type === "garage" ? t("parkingGarage") : mySpot.type === "visitor" ? t("parkingVisitor") : t("parkingResident")}
              {mySpot.floor ? ` · ${mySpot.floor}` : ""}
              {mySpot.lot ? ` · ${t("parkingLot")} ${mySpot.lot.number}` : ""}
            </Text>
          </View>
          <StatusBadge status={mySpot.status} t={t} />
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: border }]}>
        {(["vehicles", "violations", "reservations"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = { vehicles: t("parkingVehicles"), violations: t("parkingViolations"), reservations: t("parkingVisitors") };
          const icons: Record<Tab, keyof typeof Feather.glyphMap> = { vehicles: "truck", violations: "alert-circle", reservations: "calendar" };
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, active && { borderBottomColor: primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
            >
              <Feather name={icons[tab]} size={14} color={active ? primary : sub} />
              <Text style={[styles.tabLabel, { color: active ? primary : sub }]}>{labels[tab]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        {/* ── VEHICLES TAB ── */}
        {activeTab === "vehicles" && (
          <>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: primary }]}
              onPress={() => setShowAddVehicle(true)}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>{t("parkingAddVehicle")}</Text>
            </TouchableOpacity>

            {vehicles.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: card, borderColor: border }]}>
                <Feather name="truck" size={32} color={sub} />
                <Text style={[styles.emptyText, { color: sub }]}>{t("parkingNoVehicles")}</Text>
              </View>
            ) : (
              vehicles.map((v) => (
                <View key={v.id} style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                  <View style={styles.cardRow}>
                    <View style={[styles.plateChip, { backgroundColor: primary + "15" }]}>
                      <Text style={[styles.plateText, { color: primary }]}>{v.plateNumber}</Text>
                    </View>
                    <StatusBadge status={v.status} t={t} />
                    <TouchableOpacity onPress={() => handleDeleteVehicle(v.id, v.plateNumber)} style={{ marginStart: 8 }}>
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.cardSub, { color: sub, marginTop: 6 }]}>
                    {[v.brand, v.model, v.color].filter(Boolean).join(" · ") || t("parkingNoBrand")}
                  </Text>
                  {v.lot && <Text style={[styles.cardSub, { color: sub }]}>{t("parkingLot")} {v.lot.number}</Text>}
                </View>
              ))
            )}
          </>
        )}

        {/* ── VIOLATIONS TAB ── */}
        {activeTab === "violations" && (
          <>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: "#ef4444" }]}
              onPress={() => setShowReportViolation(true)}
            >
              <Feather name="camera" size={16} color="#fff" />
              <Text style={styles.addBtnText}>{t("parkingReportViolation")}</Text>
            </TouchableOpacity>

            {violations.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: card, borderColor: border }]}>
                <Feather name="check-circle" size={32} color={sub} />
                <Text style={[styles.emptyText, { color: sub }]}>{t("parkingNoViolations")}</Text>
              </View>
            ) : (
              violations.map((v) => (
                <View key={v.id} style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                  <View style={styles.cardRow}>
                    <View style={[styles.plateChip, { backgroundColor: "#ef444415" }]}>
                      <Text style={[styles.plateText, { color: "#ef4444" }]}>{v.plateNumber}</Text>
                    </View>
                    <StatusBadge status={v.status} t={t} />
                  </View>
                  {v.spot && (
                    <Text style={[styles.cardSub, { color: sub, marginTop: 4 }]}>
                      {t("parkingPlace")} {v.spot.spotNumber}
                    </Text>
                  )}
                  {v.notes && <Text style={[styles.cardSub, { color: sub }]}>{v.notes}</Text>}
                  <View style={[styles.cardRow, { marginTop: 6 }]}>
                    <Feather name="clock" size={12} color={sub} />
                    <Text style={[styles.cardDate, { color: sub }]}> {formatDateTime(v.reportedAt, lang)}</Text>
                    <Text style={[styles.cardDate, { color: sub, marginStart: 8 }]}>· {v.reportedByName}</Text>
                    {v.photoUrl && <Feather name="image" size={12} color={primary} style={{ marginStart: 8 }} />}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── RESERVATIONS TAB ── */}
        {activeTab === "reservations" && (
          <>
            {visitorSpots.length > 0 && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: "#10b981" }]}
                onPress={() => setShowReserve(true)}
              >
                <Feather name="calendar" size={16} color="#fff" />
                <Text style={styles.addBtnText}>{t("parkingReserveVisitor")}</Text>
              </TouchableOpacity>
            )}

            {reservations.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: card, borderColor: border }]}>
                <Feather name="calendar" size={32} color={sub} />
                <Text style={[styles.emptyText, { color: sub }]}>{t("parkingNoReservations")}</Text>
              </View>
            ) : (
              reservations.map((r) => (
                <View key={r.id} style={[styles.card, { backgroundColor: card, borderColor: border }]}>
                  <View style={styles.cardRow}>
                    <Text style={[styles.visitorName, { color: text }]}>{r.visitorName}</Text>
                    <StatusBadge status={r.status} t={t} />
                  </View>
                  {r.spot && <Text style={[styles.cardSub, { color: sub, marginTop: 2 }]}>{t("parkingPlace")} {r.spot.spotNumber}{r.spot.floor ? ` · ${r.spot.floor}` : ""}</Text>}
                  {r.visitorPlate && (
                    <View style={[styles.plateChip, { backgroundColor: "#10b98115", marginTop: 4 }]}>
                      <Text style={[styles.plateText, { color: "#10b981" }]}>{r.visitorPlate}</Text>
                    </View>
                  )}
                  <View style={[styles.cardRow, { marginTop: 6 }]}>
                    <Feather name="clock" size={12} color={sub} />
                    <Text style={[styles.cardDate, { color: sub }]}> {formatDateTime(r.startTime, lang)} → {formatDateTime(r.endTime, lang)}</Text>
                  </View>
                  {r.status === "confirmed" && (
                    <TouchableOpacity style={[styles.cancelBtn, { borderColor: "#ef4444" }]} onPress={() => handleCancelReservation(r.id)}>
                      <Text style={{ color: "#ef4444", fontSize: 13 }}>{t("cancel")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* ── ADD VEHICLE MODAL ── */}
      <Modal visible={showAddVehicle} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddVehicle(false)}>
        <View style={[styles.modal, { backgroundColor: bg, paddingTop: Platform.OS === "android" ? 24 : 0 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => setShowAddVehicle(false)}><Feather name="x" size={22} color={text} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: text }]}>{t("parkingRegisterVehicle")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingPlateRequired")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder={t("parkingPlatePlaceholder")}
              placeholderTextColor={sub}
              value={vPlate}
              onChangeText={(t) => setVPlate(t.toUpperCase())}
              autoCapitalize="characters"
            />
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingBrand")}</Text>
            <TextInput style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]} placeholder={t("parkingBrandPlaceholder")} placeholderTextColor={sub} value={vBrand} onChangeText={setVBrand} />
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingModel")}</Text>
            <TextInput style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]} placeholder={t("parkingModelPlaceholder")} placeholderTextColor={sub} value={vModel} onChangeText={setVModel} />
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingColor")}</Text>
            <TextInput style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]} placeholder={t("parkingColorPlaceholder")} placeholderTextColor={sub} value={vColor} onChangeText={setVColor} />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: primary, opacity: savingVehicle ? 0.7 : 1 }]}
              onPress={handleAddVehicle}
              disabled={savingVehicle}
            >
              {savingVehicle ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>{t("save")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── REPORT VIOLATION MODAL ── */}
      <Modal visible={showReportViolation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReportViolation(false)}>
        <View style={[styles.modal, { backgroundColor: bg, paddingTop: Platform.OS === "android" ? 24 : 0 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => setShowReportViolation(false)}><Feather name="x" size={22} color={text} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: text }]}>{t("parkingReportViolation")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {/* Spot selector (provides buildingId automatically) */}
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingPlaceRequired")}</Text>
            {allSpots.length === 0 ? (
              <Text style={[styles.cardSub, { color: sub }]}>{t("parkingNoAccessibleSpot")}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {allSpots.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.spotChip, { borderColor: rSpot?.id === s.id ? "#ef4444" : border, backgroundColor: rSpot?.id === s.id ? "#ef444415" : card }]}
                    onPress={() => setRSpot(s)}
                  >
                    <Text style={{ color: rSpot?.id === s.id ? "#ef4444" : text, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{s.spotNumber}</Text>
                    {s.floor && <Text style={{ color: sub, fontSize: 11 }}>{s.floor}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {rSpot && (
              <Text style={[styles.cardSub, { color: sub, marginBottom: 4 }]}>
                {t("parkingSelectedPlace")} {rSpot.spotNumber}{rSpot.floor ? ` · ${rSpot.floor}` : ""}
              </Text>
            )}

            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingViolationPlate")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder={t("parkingPlatePlaceholder")}
              placeholderTextColor={sub}
              value={rPlate}
              onChangeText={(t) => setRPlate(t.toUpperCase())}
              autoCapitalize="characters"
            />
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("notesLabel")}</Text>
            <TextInput
              style={[styles.inputMulti, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder={t("parkingDescribeSituation")}
              placeholderTextColor={sub}
              value={rNotes}
              onChangeText={setRNotes}
              multiline
              numberOfLines={3}
            />

            {/* Photo capture */}
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingProofPhoto")}</Text>
            <TouchableOpacity
              style={[styles.photoBtn, { borderColor: rPhotoUrl ? "#10b981" : border, backgroundColor: rPhotoUrl ? "#10b98115" : card }]}
              onPress={handleTakePhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color={primary} size="small" />
              ) : (
                <>
                  <Feather name={rPhotoUrl ? "check-circle" : "camera"} size={20} color={rPhotoUrl ? "#10b981" : sub} />
                  <Text style={[styles.photoBtnText, { color: rPhotoUrl ? "#10b981" : sub }]}>
                    {rPhotoUrl ? `${t("parkingPhotoAdded")} ✓` : t("parkingTakePhoto")}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#ef4444", opacity: savingViolation ? 0.7 : 1 }]}
              onPress={handleReportViolation}
              disabled={savingViolation}
            >
              {savingViolation ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>{t("parkingSubmitViolation")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── RESERVE VISITOR SPOT MODAL ── */}
      <Modal visible={showReserve} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReserve(false)}>
        <View style={[styles.modal, { backgroundColor: bg, paddingTop: Platform.OS === "android" ? 24 : 0 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => setShowReserve(false)}><Feather name="x" size={22} color={text} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: text }]}>{t("parkingReservationTitle")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingAvailableVisitorSpot")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {visitorSpots.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.spotChip, { borderColor: resSpotId === s.id ? primary : border, backgroundColor: resSpotId === s.id ? primary + "15" : card }]}
                  onPress={() => setResSpotId(s.id)}
                >
                  <Text style={{ color: resSpotId === s.id ? primary : text, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{s.spotNumber}</Text>
                  {s.floor && <Text style={{ color: sub, fontSize: 11 }}>{s.floor}</Text>}
                </TouchableOpacity>
              ))}
              {visitorSpots.length === 0 && <Text style={{ color: sub }}>{t("parkingNoVisitorAvailable")}</Text>}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingVisitorName")}</Text>
            <TextInput style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]} placeholder={t("nameLabel")} placeholderTextColor={sub} value={resVisitorName} onChangeText={setResVisitorName} />
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingVisitorPlate")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder={t("parkingPlatePlaceholder")}
              placeholderTextColor={sub}
              value={resVisitorPlate}
              onChangeText={(t) => setResVisitorPlate(t.toUpperCase())}
              autoCapitalize="characters"
            />
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingDateRequired")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder={t("parkingDatePlaceholder")}
              placeholderTextColor={sub}
              value={resStartDate}
              onChangeText={setResStartDate}
              keyboardType="numeric"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingStartTime")}</Text>
                <TextInput style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]} placeholder="09:00" placeholderTextColor={sub} value={resStartTime} onChangeText={setResStartTime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: sub }]}>{t("parkingEndTime")}</Text>
                <TextInput style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]} placeholder="18:00" placeholderTextColor={sub} value={resEndTime} onChangeText={setResEndTime} />
              </View>
            </View>
            <Text style={[styles.fieldLabel, { color: sub }]}>{t("notesLabel")}</Text>
            <TextInput style={[styles.inputMulti, { backgroundColor: card, color: text, borderColor: border }]} placeholder={t("parkingVisitPurpose")} placeholderTextColor={sub} value={resNotes} onChangeText={setResNotes} multiline numberOfLines={3} />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#10b981", opacity: savingReservation ? 0.7 : 1 }]}
              onPress={handleReserve}
              disabled={savingReservation}
            >
              {savingReservation ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>{t("parkingConfirmReservation")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold" },
  spotBanner: { flexDirection: "row", alignItems: "center", margin: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  spotNum: { fontSize: 15, fontFamily: "Inter_700Bold" },
  spotSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12, marginBottom: 12 },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", justifyContent: "center", padding: 40, borderRadius: 12, borderWidth: 1, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  plateChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  plateText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  visitorName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { marginTop: 8, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: "center" },
  // Modal
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 16, gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  inputMulti: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 14, borderStyle: "dashed" },
  photoBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  spotChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginEnd: 8, alignItems: "center", minWidth: 60 },
});
