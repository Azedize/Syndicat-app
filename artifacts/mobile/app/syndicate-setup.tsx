import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { syndicates as syndicatesApi } from "@/services/api";

const TOTAL_STEPS = 4;
const STEP_ICONS: Array<keyof typeof Feather.glyphMap> = ["home", "phone", "file-text", "settings"];
const STEP_LABELS = ["Identité", "Contact", "Légal", "Config"];

// ─── Constants ────────────────────────────────────────────────────────────────

const MOROCCAN_CITIES = [
  "Casablanca", "Rabat", "Tanger", "Fès", "Marrakech", "Agadir", "Meknès",
  "Oujda", "Tétouan", "El Jadida", "Nador", "Khouribga", "Kénitra", "Safi",
  "Mohammedia", "Laâyoune", "Dakhla", "Béni Mellal", "Settat", "Taza",
  "Ksar El-Kébir", "Salé", "Temara", "Khémisset", "Berrechid", "Larache",
  "Guelmim", "Tiznit", "Essaouira", "Taroudant", "Ouarzazate", "Errachidia",
  "Khénifra", "Azrou", "Midelt", "Ifrane", "Al Hoceïma", "Chefchaouen",
  "Asilah", "Sidi Ifni",
];

const SECTORS = [
  "Copropriété résidentielle",
  "Copropriété commerciale",
  "Usage mixte (résidentiel + commercial)",
  "Résidence fermée (gated community)",
  "Complexe hôtelier / touristique",
  "Immeubles de bureaux",
  "Zone industrielle",
  "Quartier administratif",
  "Complexe universitaire",
  "Santé / cliniques",
  "Autre",
];

const REGIONS = [
  "Casablanca-Settat",
  "Rabat-Salé-Kénitra",
  "Fès-Meknès",
  "Marrakech-Safi",
  "Souss-Massa",
  "Tanger-Tétouan-Al Hoceïma",
  "Oriental",
  "Béni Mellal-Khénifra",
  "Drâa-Tafilalet",
  "Guelmim-Oued Noun",
  "Laâyoune-Sakia El Hamra",
  "Dakhla-Oued Ed Dahab",
];

const LEGAL_FORMS = [
  "Syndicat de copropriété (Dahir 1957)",
  "Association syndicale libre (ASL)",
  "Association syndicale autorisée (ASA)",
  "Société civile immobilière (SCI)",
  "Coopérative immobilière (Al Omrane)",
  "Groupement de copropriétaires (GCP)",
  "Association de quartier (Loi 1958)",
  "Autre forme juridique",
];

const COTISATION_CYCLES = [
  { key: "monthly", label: "Mensuel" },
  { key: "quarterly", label: "Trimestriel" },
  { key: "yearly", label: "Annuel" },
];

const LOGO_COLORS = [
  "#2563EB", "#2563eb", "#0891b2", "#059669",
  "#16a34a", "#ca8a04", "#dc2626", "#db2777",
  "#9333ea", "#0f172a",
];

const LOGO_PRESETS: { icon: keyof typeof Feather.glyphMap; color: string; label: string }[] = [
  { icon: "home",        color: "#2563EB", label: "Résidence"     },
  { icon: "grid",        color: "#2563eb", label: "Immeuble"      },
  { icon: "shield",      color: "#059669", label: "Sécurité"      },
  { icon: "users",       color: "#0891b2", label: "Communauté"    },
  { icon: "star",        color: "#ca8a04", label: "Premium"       },
  { icon: "award",       color: "#dc2626", label: "Excellence"    },
  { icon: "globe",       color: "#9333ea", label: "National"      },
  { icon: "layers",      color: "#16a34a", label: "Copropriété"   },
  { icon: "key",         color: "#db2777", label: "Accès"         },
  { icon: "map-pin",     color: "#0f172a", label: "Quartier"      },
  { icon: "briefcase",   color: "#f97316", label: "Professionnel" },
  { icon: "trending-up", color: "#6366f1", label: "Croissance"    },
];

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateEmail(v: string): string | null {
  if (!v.trim()) return "L'email est obligatoire.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return "Format email invalide.";
  return null;
}

function validatePhone(v: string): string | null {
  if (!v.trim()) return "Le téléphone est obligatoire.";
  const clean = v.replace(/\s/g, "");
  if (!/^(\+212|0)[0-9]{9}$/.test(clean)) return "Format invalide (ex: +212600000000 ou 0600000000).";
  return null;
}

function validateRegNumber(v: string): string | null {
  if (!v.trim()) return "Le numéro d'enregistrement est obligatoire.";
  if (!/^[A-Za-z0-9\-\/\.]{3,50}$/.test(v.trim())) return "Format invalide (ex: 2024-SYN-001234).";
  return null;
}

function validateFoundingDate(v: string): string | null {
  if (!v.trim()) return "La date de fondation est obligatoire.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return "Format requis: AAAA-MM-JJ.";
  return null;
}

function validateICE(v: string): string | null {
  if (!v) return null; // optional
  if (!/^[0-9]{15}$/.test(v.trim())) return "L'ICE doit comporter exactement 15 chiffres.";
  return null;
}

function validateRC(v: string): string | null {
  if (!v) return null; // optional
  if (!/^[A-Za-z0-9\-\/\.]{3,20}$/.test(v.trim())) return "Format RC invalide.";
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetupForm {
  name: string;
  abbreviation: string;
  sector: string;
  region: string;
  legalForm: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  country: string;
  registrationNumber: string;
  iceNumber: string;
  rcNumber: string;
  foundingDate: string;
  memberCount: string;
  cotisationAmount: string;
  cotisationCycle: string;
  logoColor: string;
  logoUri: string;
  logoUrl: string;
  logoPreset: string;
  mission: string;
}

type FieldErrors = Partial<Record<keyof SetupForm, string>>;

interface CreatedSyndicate {
  id: string;
  name: string;
  registrationNumber?: string | null;
  createdAt?: string | null;
  legalForm?: string | null;
  city?: string | null;
  region?: string | null;
  adminId?: string | null;
  membersCount?: number | null;
  logoColor?: string | null;
  logoUrl?: string | null;
  abbreviation?: string | null;
  sector?: string | null;
  status?: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  colors,
  error,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View
        style={[
          styles.fieldBox,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.border,
          },
        ]}
      >
        {children}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={12} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CityPicker({
  value,
  onChange,
  colors,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useColors>;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = MOROCCAN_CITIES.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Ville *</Text>
      <TouchableOpacity
        style={[
          styles.fieldBox,
          styles.pickerBtn,
          { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.input,
            { color: value ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {value || "Sélectionnez une ville…"}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
      {error ? (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={12} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.pickerModal, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerModalTitle, { color: colors.foreground }]}>
              Choisir une ville
            </Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={[styles.pickerSearch, { backgroundColor: colors.muted, margin: 16, borderRadius: 12 }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginStart: 10 }} />
            <TextInput
              style={[styles.pickerSearchInput, { color: colors.foreground }]}
              placeholder="Rechercher une ville…"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  {
                    backgroundColor: item === value ? colors.primary + "15" : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery("");
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    { color: item === value ? colors.primary : colors.foreground },
                  ]}
                >
                  {item}
                </Text>
                {item === value ? (
                  <Feather name="check" size={16} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

function SimplePicker({
  label,
  value,
  onChange,
  options,
  colors,
  error,
  title,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  colors: ReturnType<typeof useColors>;
  error?: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const showSearch = options.length > 8;
  const filtered = showSearch
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.fieldBox,
          styles.pickerBtn,
          { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.input, { color: value ? colors.foreground : colors.mutedForeground }]}>
          {value || `Sélectionnez…`}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
      {error ? (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={12} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.pickerModal, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerModalTitle, { color: colors.foreground }]}>{title}</Text>
            <TouchableOpacity onPress={() => { setOpen(false); setQuery(""); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {showSearch ? (
            <View style={[styles.pickerSearch, { backgroundColor: colors.muted, margin: 16, borderRadius: 12 }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginStart: 10 }} />
              <TextInput
                style={[styles.pickerSearchInput, { color: colors.foreground }]}
                placeholder={`Rechercher…`}
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  {
                    backgroundColor: item === value ? colors.primary + "15" : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery("");
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.pickerItemText, { color: item === value ? colors.primary : colors.foreground }]}>
                  {item}
                </Text>
                {item === value ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

function SuccessScreen({
  created,
  adminName,
  colors,
  insets,
}: {
  created: CreatedSyndicate;
  adminName: string;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
}) {
  const createdDate = created.createdAt
    ? new Date(created.createdAt).toLocaleDateString("fr-MA", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("fr-MA", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.successHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.successIconWrap, { backgroundColor: "#10b98120" }]}>
          <Feather name="check-circle" size={40} color="#10b981" />
        </View>
        <Text style={[styles.successTitle, { color: colors.foreground }]}>Syndicat créé avec succès !</Text>
        <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
          Votre syndicat est maintenant actif sur la plateforme.
        </Text>
      </View>

      {/* Details card */}
      <View style={[styles.successDetails, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.successDetailHeader}>
          <View style={[styles.successLogo, { backgroundColor: created.logoColor ?? "#2563EB" }]}>
            {created.logoUrl ? (
              <Image source={{ uri: created.logoUrl }} style={styles.successLogoImg} />
            ) : (
              <Text style={styles.successLogoText}>
                {created.abbreviation ?? created.name.slice(0, 3).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.successName, { color: colors.foreground }]} numberOfLines={2}>
              {created.name}
            </Text>
            {created.legalForm ? (
              <Text style={[styles.successMeta, { color: colors.primary }]}>{created.legalForm}</Text>
            ) : null}
            {created.city || created.region ? (
              <Text style={[styles.successMeta, { color: colors.mutedForeground }]}>
                {[created.city, created.region].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.successSep, { backgroundColor: colors.border }]} />

        {[
          { icon: "hash" as const, label: "N° d'enregistrement", value: created.registrationNumber ?? "—" },
          { icon: "calendar" as const, label: "Date de création", value: createdDate },
          { icon: "user" as const, label: "Administrateur", value: adminName },
          { icon: "users" as const, label: "Membres initiaux", value: `${created.membersCount ?? 0}` },
          { icon: "activity" as const, label: "Statut", value: "Actif" },
        ].map((row) => (
          <View key={row.label} style={styles.successRow}>
            <View style={[styles.successRowIcon, { backgroundColor: colors.muted }]}>
              <Feather name={row.icon} size={14} color={colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.successRowLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
              <Text style={[styles.successRowValue, { color: colors.foreground }]}>{row.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.successActions}>
        <TouchableOpacity
          style={[styles.successActionPrimary, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace("/(tabs)/" as any);
          }}
          activeOpacity={0.85}
        >
          <Feather name="eye" size={18} color="#fff" />
          <Text style={styles.successActionPrimaryText}>Voir le Syndicat</Text>
        </TouchableOpacity>

        <View style={styles.successActionsRow}>
          <TouchableOpacity
            style={[styles.successActionSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/(tabs)/members" as any);
            }}
            activeOpacity={0.8}
          >
            <Feather name="user-plus" size={16} color={colors.primary} />
            <Text style={[styles.successActionSecondaryText, { color: colors.primary }]}>
              Ajouter des Membres
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.successActionSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/buildings" as any);
            }}
            activeOpacity={0.8}
          >
            <Feather name="home" size={16} color="#3b82f6" />
            <Text style={[styles.successActionSecondaryText, { color: "#3b82f6" }]}>
              Ajouter un Immeuble
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.successActionOutline, { borderColor: colors.border }]}
          onPress={() => {
            Haptics.selectionAsync();
            router.replace("/(tabs)/" as any);
          }}
          activeOpacity={0.8}
        >
          <Feather name="grid" size={16} color={colors.mutedForeground} />
          <Text style={[styles.successActionOutlineText, { color: colors.mutedForeground }]}>
            Retour au Tableau de Bord
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Creating a new syndicate on the platform is a Super Admin-only action.
export default function SyndicateSetupScreen() {
  return (
    <RoleGuard allow={["super_admin"]}>
      <SyndicateSetupScreenInner />
    </RoleGuard>
  );
}

function SyndicateSetupScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addSyndicate } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [created, setCreated] = useState<CreatedSyndicate | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof SetupForm, boolean>>>({});

  const [form, setForm] = useState<SetupForm>({
    name: "",
    abbreviation: "",
    sector: "Copropriété résidentielle",
    region: "Casablanca-Settat",
    legalForm: "Syndicat de copropriété (Dahir 1957)",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    country: "Maroc",
    registrationNumber: "",
    iceNumber: "",
    rcNumber: "",
    foundingDate: "",
    memberCount: "",
    cotisationAmount: "150",
    cotisationCycle: "monthly",
    logoColor: "#2563EB",
    logoUri: "",
    logoUrl: "",
    logoPreset: "home",
    mission: "",
  });

  const up = useCallback(<K extends keyof SetupForm>(field: K, value: SetupForm[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (touched[field]) {
      validateField(field, value as string);
    }
  }, [touched]); // eslint-disable-line react-hooks/exhaustive-deps

  const touch = (field: keyof SetupForm) => {
    setTouched((t) => ({ ...t, [field]: true }));
    validateField(field, form[field] as string);
  };

  const validateField = (field: keyof SetupForm, value: string) => {
    let err: string | null = null;
    switch (field) {
      case "name":
        if (!value.trim()) err = "Le nom du syndicat est obligatoire.";
        break;
      case "abbreviation":
        if (!value.trim()) err = "Le sigle/abréviation est obligatoire.";
        break;
      case "city":
        if (!value.trim()) err = "La ville est obligatoire.";
        break;
      case "country":
        if (!value.trim()) err = "Le pays est obligatoire.";
        break;
      case "email":
        err = validateEmail(value);
        break;
      case "phone":
        err = validatePhone(value);
        break;
      case "registrationNumber":
        err = validateRegNumber(value);
        break;
      case "foundingDate":
        err = validateFoundingDate(value);
        break;
      case "iceNumber":
        err = validateICE(value);
        break;
      case "rcNumber":
        err = validateRC(value);
        break;
    }
    setErrors((e) => ({ ...e, [field]: err ?? undefined }));
  };

  const validateStep = (): boolean => {
    const newErrors: FieldErrors = {};
    const newTouched: Partial<Record<keyof SetupForm, boolean>> = {};

    if (step === 1) {
      newTouched.name = true;
      newTouched.abbreviation = true;
      if (!form.name.trim()) newErrors.name = "Le nom du syndicat est obligatoire.";
      if (!form.abbreviation.trim()) newErrors.abbreviation = "Le sigle/abréviation est obligatoire.";
    }
    if (step === 2) {
      newTouched.email = true;
      newTouched.phone = true;
      newTouched.city = true;
      const emailErr = validateEmail(form.email);
      const phoneErr = validatePhone(form.phone);
      if (emailErr) newErrors.email = emailErr;
      if (phoneErr) newErrors.phone = phoneErr;
      if (!form.city.trim()) newErrors.city = "La ville est obligatoire.";
    }
    if (step === 3) {
      newTouched.registrationNumber = true;
      newTouched.foundingDate = true;
      const regErr = validateRegNumber(form.registrationNumber);
      const dateErr = validateFoundingDate(form.foundingDate);
      if (regErr) newErrors.registrationNumber = regErr;
      if (dateErr) newErrors.foundingDate = dateErr;
      if (form.iceNumber) {
        const iceErr = validateICE(form.iceNumber);
        if (iceErr) newErrors.iceNumber = iceErr;
      }
      if (form.rcNumber) {
        const rcErr = validateRC(form.rcNumber);
        if (rcErr) newErrors.rcNumber = rcErr;
      }
    }

    setErrors((e) => ({ ...e, ...newErrors }));
    setTouched((t) => ({ ...t, ...newTouched }));

    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => s - 1);
  };

  const pickImage = async (source: "gallery" | "camera") => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });
      }

      if (!result.canceled && result.assets[0]) {
        up("logoUri", result.assets[0].uri);
        up("logoUrl", ""); // clear remote URL until upload
        Haptics.selectionAsync();
      }
    } catch {
      // permission denied or camera unavailable — silently ignore
    }
  };

  const handleFinish = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let uploadedLogoUrl = form.logoUrl;

      // Upload logo if a local URI was selected
      if (form.logoUri && !form.logoUrl) {
        try {
          // Request a presigned upload URL
          const ext = form.logoUri.split(".").pop() ?? "jpg";
          const contentType = ext === "png" ? "image/png" : "image/jpeg";
          const fileName = `logo-${Date.now()}.${ext}`;

          const urlRes = await fetch(
            `${(() => {
              const domain = process.env.EXPO_PUBLIC_DOMAIN;
              if (domain) return `https://${domain}/api`;
              const port = process.env.EXPO_PUBLIC_API_PORT ?? "8080";
              return `http://localhost:${port}/api`;
            })()}/storage/uploads/request-url`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: fileName, size: 500000, contentType }),
            }
          );

          if (urlRes.ok) {
            const { uploadURL, objectPath } = await urlRes.json();
            // Upload to GCS
            const imgRes = await fetch(form.logoUri);
            const blob = await imgRes.blob();
            const uploadResp = await fetch(uploadURL, {
              method: "PUT",
              headers: { "Content-Type": contentType },
              body: blob,
            });
            if (uploadResp.ok) {
              uploadedLogoUrl = objectPath;
            }
          }
        } catch {
          // Logo upload failed — proceed without logo URL
        }
      }

      const payload = {
        name: form.name,
        abbreviation: form.abbreviation || undefined,
        sector: form.sector,
        region: form.region,
        mission: form.mission || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        country: form.country || "Maroc",
        legalForm: form.legalForm || undefined,
        registrationNumber: form.registrationNumber || undefined,
        iceNumber: form.iceNumber || undefined,
        rcNumber: form.rcNumber || undefined,
        foundingDate: form.foundingDate || undefined,
        cotisationAmount: form.cotisationAmount || undefined,
        cotisationCycle: form.cotisationCycle as "monthly" | "quarterly" | "yearly",
        logoColor: form.logoColor,
        logoUrl: uploadedLogoUrl || undefined,
        membersCount: parseInt(form.memberCount) || 0,
      };

      const response = await syndicatesApi.create(payload);
      const createdData = (response as any)?.data as CreatedSyndicate;

      if (createdData) {
        addSyndicate({
          id: createdData.id,
          name: createdData.name,
          sector: createdData.sector ?? form.sector,
          members: createdData.membersCount ?? 0,
          admin: user?.name ?? "Admin",
          status: "active" as const,
          createdAt: createdData.createdAt ?? new Date().toISOString().slice(0, 10),
          region: createdData.region ?? "",
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreated(createdData ?? { id: "", name: form.name });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.message ?? "Une erreur est survenue lors de la création du syndicat.";
      setErrors((e) => ({ ...e, name: msg }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── If created → success screen ────────────────────────────────────────────
  if (created) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.header,
            { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border },
          ]}
        >
          <View style={styles.headerTop}>
            <View style={{ width: 36 }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Syndicat créé !</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
        </View>
        <SuccessScreen
          created={created}
          adminName={user?.name ?? "Admin"}
          colors={colors}
          insets={insets}
        />
      </View>
    );
  }

  // ─── Wizard steps ────────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Renseignez les informations d'identité principales de votre syndicat.
            </Text>
            <Field label="Nom complet du syndicat *" colors={colors} error={errors.name}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Ex: Syndicat de Copropriété Résidence Al Andalous"
                placeholderTextColor={colors.mutedForeground}
                value={form.name}
                onChangeText={(v) => up("name", v)}
                onBlur={() => touch("name")}
              />
            </Field>
            <Field label="Sigle / Abréviation *" colors={colors} error={errors.abbreviation}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Ex: SCA"
                placeholderTextColor={colors.mutedForeground}
                value={form.abbreviation}
                onChangeText={(v) => up("abbreviation", v.toUpperCase())}
                onBlur={() => touch("abbreviation")}
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Mission / Description" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground, minHeight: 70 }]}
                placeholder="Décrivez la mission principale du syndicat..."
                placeholderTextColor={colors.mutedForeground}
                value={form.mission}
                onChangeText={(v) => up("mission", v)}
                multiline
              />
            </Field>
            <SimplePicker
              label="Secteur d'activité"
              value={form.sector}
              onChange={(v) => up("sector", v)}
              options={SECTORS}
              colors={colors}
              title="Secteur d'activité"
            />
            <SimplePicker
              label="Région"
              value={form.region}
              onChange={(v) => up("region", v)}
              options={REGIONS}
              colors={colors}
              title="Choisir une région"
            />
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Ces coordonnées seront visibles par les membres et affichées dans l'annuaire.
            </Text>
            <Field label="Email officiel *" colors={colors} error={errors.email}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="contact@syndicat.ma"
                placeholderTextColor={colors.mutedForeground}
                value={form.email}
                onChangeText={(v) => up("email", v)}
                onBlur={() => touch("email")}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>
            <Field label="Téléphone *" colors={colors} error={errors.phone}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="+212600000000"
                placeholderTextColor={colors.mutedForeground}
                value={form.phone}
                onChangeText={(v) => up("phone", v)}
                onBlur={() => touch("phone")}
                keyboardType="phone-pad"
              />
            </Field>
            <Field label="Site web (optionnel)" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="https://www.syndicat.ma"
                placeholderTextColor={colors.mutedForeground}
                value={form.website}
                onChangeText={(v) => up("website", v)}
                autoCapitalize="none"
              />
            </Field>
            <Field label="Adresse du siège" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground, minHeight: 60 }]}
                placeholder="Numéro, rue..."
                placeholderTextColor={colors.mutedForeground}
                value={form.address}
                onChangeText={(v) => up("address", v)}
                multiline
              />
            </Field>
            <CityPicker
              value={form.city}
              onChange={(v) => { up("city", v); setErrors((e) => ({ ...e, city: undefined })); }}
              colors={colors}
              error={errors.city}
            />
            <Field label="Pays" colors={colors} error={errors.country}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Maroc"
                placeholderTextColor={colors.mutedForeground}
                value={form.country}
                onChangeText={(v) => up("country", v)}
                onBlur={() => touch("country")}
              />
            </Field>

            {/* Logo section */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Logo du syndicat</Text>
            <View style={[styles.logoSection, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {/* Preview */}
              <View style={styles.logoPreviewRow}>
                <View style={[styles.logoCircle, { backgroundColor: form.logoUri ? "transparent" : form.logoColor }]}>
                  {form.logoUri ? (
                    <Image source={{ uri: form.logoUri }} style={styles.logoImg} />
                  ) : form.logoPreset ? (
                    <Feather name={form.logoPreset as keyof typeof Feather.glyphMap} size={28} color="#fff" />
                  ) : (
                    <Text style={styles.logoAbbr}>{form.abbreviation || "SYN"}</Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.logoName, { color: colors.foreground }]} numberOfLines={1}>
                    {form.name || "Nom du syndicat"}
                  </Text>
                  <Text style={[styles.logoSector, { color: colors.mutedForeground }]}>{form.sector}</Text>
                </View>
                {form.logoUri ? (
                  <TouchableOpacity
                    style={[styles.logoClearBtn, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "40" }]}
                    onPress={() => { up("logoUri", ""); up("logoUrl", ""); }}
                    activeOpacity={0.8}
                  >
                    <Feather name="trash-2" size={13} color={colors.destructive} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Preset gallery */}
              {!form.logoUri ? (
                <>
                  <Text style={[styles.logoColorLabel, { color: colors.mutedForeground }]}>
                    Choisissez un logo prédéfini
                  </Text>
                  <View style={styles.logoPresetGrid}>
                    {LOGO_PRESETS.map((p) => {
                      const selected = !form.logoUri && form.logoPreset === p.icon && form.logoColor === p.color;
                      return (
                        <TouchableOpacity
                          key={p.icon + p.color}
                          style={[
                            styles.logoPresetTile,
                            {
                              borderColor: selected ? p.color : colors.border,
                              borderWidth: selected ? 2 : 1,
                              backgroundColor: selected ? p.color + "15" : colors.card,
                            },
                          ]}
                          onPress={() => {
                            up("logoPreset", p.icon);
                            up("logoColor", p.color);
                            Haptics.selectionAsync();
                          }}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.logoPresetIcon, { backgroundColor: p.color }]}>
                            <Feather name={p.icon} size={20} color="#fff" />
                          </View>
                          <Text style={[styles.logoPresetLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {p.label}
                          </Text>
                          {selected ? (
                            <View style={[styles.logoPresetCheck, { backgroundColor: p.color }]}>
                              <Feather name="check" size={8} color="#fff" />
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={[styles.logoOrRow, { borderColor: colors.border }]}>
                    <View style={[styles.logoOrLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.logoOrText, { color: colors.mutedForeground }]}>ou</Text>
                    <View style={[styles.logoOrLine, { backgroundColor: colors.border }]} />
                  </View>
                </>
              ) : null}

              {/* Upload buttons */}
              <View style={styles.logoActions}>
                <TouchableOpacity
                  style={[
                    styles.logoBtn,
                    {
                      backgroundColor: form.logoUri ? colors.primary + "15" : colors.card,
                      borderColor: form.logoUri ? colors.primary : colors.border,
                      flex: 1,
                    },
                  ]}
                  onPress={() => pickImage("gallery")}
                  activeOpacity={0.8}
                >
                  <Feather name="upload" size={15} color={colors.primary} />
                  <Text style={[styles.logoBtnText, { color: colors.primary }]}>
                    {form.logoUri ? "Changer l'image" : "Téléverser depuis mon appareil"}
                  </Text>
                </TouchableOpacity>
                {Platform.OS !== "web" && !form.logoUri && (
                  <TouchableOpacity
                    style={[styles.logoBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => pickImage("camera")}
                    activeOpacity={0.8}
                  >
                    <Feather name="camera" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Informations juridiques requises conformément au Dahir n° 1-57-119 du 16 juillet 1957.
            </Text>
            <Field label="Numéro d'enregistrement *" colors={colors} error={errors.registrationNumber}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Ex: 2024-SYN-001234"
                placeholderTextColor={colors.mutedForeground}
                value={form.registrationNumber}
                onChangeText={(v) => up("registrationNumber", v)}
                onBlur={() => touch("registrationNumber")}
              />
            </Field>
            <Field label="Date de fondation *" colors={colors} error={errors.foundingDate}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={colors.mutedForeground}
                value={form.foundingDate}
                onChangeText={(v) => up("foundingDate", v)}
                onBlur={() => touch("foundingDate")}
              />
            </Field>
            <Field label="Numéro ICE (optionnel)" colors={colors} error={errors.iceNumber}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="15 chiffres"
                placeholderTextColor={colors.mutedForeground}
                value={form.iceNumber}
                onChangeText={(v) => up("iceNumber", v)}
                onBlur={() => touch("iceNumber")}
                keyboardType="number-pad"
                maxLength={15}
              />
            </Field>
            <Field label="Numéro RC (optionnel)" colors={colors} error={errors.rcNumber}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Ex: 123456"
                placeholderTextColor={colors.mutedForeground}
                value={form.rcNumber}
                onChangeText={(v) => up("rcNumber", v)}
                onBlur={() => touch("rcNumber")}
              />
            </Field>
            <Field label="Nombre initial de membres" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Ex: 50"
                placeholderTextColor={colors.mutedForeground}
                value={form.memberCount}
                onChangeText={(v) => up("memberCount", v)}
                keyboardType="numeric"
              />
            </Field>
            <SimplePicker
              label="Forme juridique"
              value={form.legalForm}
              onChange={(v) => up("legalForm", v)}
              options={LEGAL_FORMS}
              colors={colors}
              title="Forme juridique"
            />
            <View style={[styles.legalNote, { backgroundColor: "#3b82f618", borderColor: "#3b82f630" }]}>
              <Feather name="info" size={14} color="#3b82f6" />
              <Text style={[styles.legalNoteText, { color: "#3b82f6" }]}>
                Ces informations seront vérifiées lors de la validation de votre syndicat sur la plateforme.
                Assurez-vous de la conformité avec le Dahir 1-57-119.
              </Text>
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Configurez les paramètres financiers et vérifiez le récapitulatif.
            </Text>

            {/* Preview card */}
            <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.previewHeader}>
                <View style={[styles.previewLogo, { backgroundColor: form.logoUri ? "transparent" : form.logoColor }]}>
                  {form.logoUri ? (
                    <Image source={{ uri: form.logoUri }} style={styles.previewLogoImg} />
                  ) : form.logoPreset ? (
                    <Feather name={form.logoPreset as keyof typeof Feather.glyphMap} size={22} color="#fff" />
                  ) : (
                    <Text style={styles.previewAbbr}>{form.abbreviation || "SYN"}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.previewName, { color: colors.foreground }]}>
                    {form.name || "Nom du syndicat"}
                  </Text>
                  <Text style={[styles.previewMeta, { color: colors.primary }]}>{form.legalForm}</Text>
                  <Text style={[styles.previewMeta, { color: colors.mutedForeground }]}>
                    {form.city} · {form.region}
                  </Text>
                </View>
              </View>
              <View style={[styles.previewSep, { backgroundColor: colors.border }]} />
              {[
                { icon: "mail" as const, value: form.email || "Non renseigné" },
                { icon: "phone" as const, value: form.phone || "Non renseigné" },
                { icon: "map-pin" as const, value: form.city ? `${form.city}, ${form.country}` : "Non renseigné" },
                { icon: "file-text" as const, value: `N° ${form.registrationNumber || "Non renseigné"}` },
                { icon: "calendar" as const, value: `Fondé le ${form.foundingDate || "Non renseigné"}` },
              ].map(({ icon, value }, i) => (
                <View key={i} style={styles.previewRow}>
                  <Feather name={icon} size={13} color={colors.mutedForeground} />
                  <Text style={[styles.previewValue, { color: colors.mutedForeground }]}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Montant cotisation (MAD)</Text>
            <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="150"
                placeholderTextColor={colors.mutedForeground}
                value={form.cotisationAmount}
                onChangeText={(v) => up("cotisationAmount", v)}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Cycle de cotisation</Text>
            <View style={styles.cycleRow}>
              {COTISATION_CYCLES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.cycleChip,
                    {
                      backgroundColor:
                        form.cotisationCycle === c.key ? colors.primary + "18" : colors.muted,
                      borderColor: form.cotisationCycle === c.key ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => { up("cotisationCycle", c.key); Haptics.selectionAsync(); }}
                >
                  <Text
                    style={[
                      styles.cycleText,
                      {
                        color:
                          form.cotisationCycle === c.key ? colors.primary : colors.mutedForeground,
                      },
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.summaryBox, { backgroundColor: colors.muted }]}>
              <Text style={[styles.summaryLine, { color: colors.foreground }]}>
                Cotisation de{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
                  {form.cotisationAmount} MAD
                </Text>{" "}
                {COTISATION_CYCLES.find((c) => c.key === form.cotisationCycle)?.label.toLowerCase()} par membre
              </Text>
              {form.memberCount ? (
                <Text style={[styles.summaryLine, { color: colors.mutedForeground }]}>
                  Revenus estimés:{" "}
                  {(
                    parseInt(form.cotisationAmount || "0") * parseInt(form.memberCount || "0")
                  ).toLocaleString()}{" "}
                  MAD /{" "}
                  {form.cotisationCycle === "monthly"
                    ? "mois"
                    : form.cotisationCycle === "quarterly"
                    ? "trimestre"
                    : "an"}
                </Text>
              ) : null}
            </View>

            {/* Show API error here if any */}
            {errors.name && errors.name.length > 20 ? (
              <View
                style={[
                  styles.legalNote,
                  { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "30" },
                ]}
              >
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[styles.legalNoteText, { color: colors.destructive }]}>{errors.name}</Text>
              </View>
            ) : null}
          </View>
        );
    }
  };

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTop}>
          {step > 1 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Créer un syndicat</Text>
            <Text style={[styles.stepIndicator, { color: colors.mutedForeground }]}>
              Étape {step} / {TOTAL_STEPS}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` as any, backgroundColor: colors.primary },
            ]}
          />
        </View>
        <View style={styles.stepTabs}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <View key={label} style={styles.stepTab}>
                <View
                  style={[
                    styles.stepCircle,
                    {
                      backgroundColor: done
                        ? colors.primary
                        : active
                        ? colors.primary + "20"
                        : colors.muted,
                      borderColor: active ? colors.primary : "transparent",
                      borderWidth: active ? 2 : 0,
                    },
                  ]}
                >
                  {done ? (
                    <Feather name="check" size={12} color="#fff" />
                  ) : (
                    <Feather
                      name={STEP_ICONS[i]}
                      size={12}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.stepTabText,
                    { color: active ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>
          {
            [
              "Identité du syndicat",
              "Contact & Localisation",
              "Informations légales",
              "Configuration & Récapitulatif",
            ][step - 1]
          }
        </Text>
        {renderStep()}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.7 : 1 }]}
          onPress={step === TOTAL_STEPS ? handleFinish : handleNext}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.nextBtnText}>Création en cours…</Text>
            </>
          ) : step === TOTAL_STEPS ? (
            <>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.nextBtnText}>Créer le syndicat</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextBtnText}>Continuer</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stepIndicator: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepTabs: { flexDirection: "row", justifyContent: "space-between" },
  stepTab: { alignItems: "center", gap: 4, flex: 1 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTabText: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  stepTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
  stepContent: { gap: 16 },
  stepDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  fieldBox: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -2 },
  errorText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  // Logo
  logoSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  logoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoCircle: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: 60, height: 60, borderRadius: 18 },
  logoAbbr: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  logoName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  logoSector: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  logoActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  logoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  logoClearBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoColorLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  logoPresetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  logoPresetTile: {
    width: "22%",
    aspectRatio: 0.85,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 8,
    position: "relative",
  },
  logoPresetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPresetLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  logoPresetCheck: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  logoOrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  logoOrLine: { flex: 1, height: 1 },
  logoOrText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorDot: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  colorCheck: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  // Legal note
  legalNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  legalNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  // Preview card (step 4)
  previewCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  previewLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewLogoImg: { width: 52, height: 52, borderRadius: 16 },
  previewAbbr: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  previewName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  previewMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  previewSep: { height: 1, marginHorizontal: 16 },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  previewValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cycleRow: { flexDirection: "row", gap: 10 },
  cycleChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  cycleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryBox: { padding: 14, borderRadius: 14, gap: 4 },
  summaryLine: { fontSize: 13, fontFamily: "Inter_500Medium" },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16 },
  nextBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  nextBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  // City picker modal
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerModal: { flex: 1 },
  pickerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  pickerModalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    paddingEnd: 12,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerItemText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  // Success screen
  successHero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  successSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  successDetails: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  successDetailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  successLogo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  successLogoImg: { width: 56, height: 56, borderRadius: 18 },
  successLogoText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  successName: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
  successMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  successSep: { height: 1 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  successRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  successRowLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  successRowValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  successActions: { gap: 10 },
  successActionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  successActionPrimaryText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  successActionsRow: { flexDirection: "row", gap: 10 },
  successActionSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  successActionSecondaryText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  successActionOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  successActionOutlineText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
