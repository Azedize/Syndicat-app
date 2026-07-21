import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useRequireRole } from "@/hooks/useRequireRole";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";

type Role = "super_admin" | "syndicate_admin" | "member" | "tenant";
type Status = "active" | "inactive" | "suspended" | "pending";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: Status;
  syndicate: string;
  joinDate: string;
  lastLogin: string;
  avatar: string;
}

const STRINGS = {
  superAdmin: { fr: "Super Admin", en: "Super Admin", ar: "مدير عام", es: "Super Admin" },
  syndicateAdmin: { fr: "Admin Syndicat", en: "Syndicate Admin", ar: "مدير النقابة", es: "Admin Sindicato" },
  member: { fr: "Membre", en: "Member", ar: "عضو", es: "Miembro" },
  tenant: { fr: "Locataire", en: "Tenant", ar: "مستأجر", es: "Inquilino" },
  active: { fr: "Actif", en: "Active", ar: "نشط", es: "Activo" },
  inactive: { fr: "Inactif", en: "Inactive", ar: "غير نشط", es: "Inactivo" },
  suspended: { fr: "Suspendu", en: "Suspended", ar: "موقوف", es: "Suspendido" },
  pending: { fr: "En attente", en: "Pending", ar: "في الانتظار", es: "Pendiente" },
  deleteUserTitle: { fr: "Supprimer l'utilisateur", en: "Delete User", ar: "حذف المستخدم", es: "Eliminar usuario" },
  deleteUserConfirm: { fr: "Êtes-vous sûr de vouloir supprimer {name} ?", en: "Are you sure you want to delete {name}?", ar: "هل أنت متأكد أنك تريد حذف {name}؟", es: "¿Está seguro de que desea eliminar a {name}?" },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  delete: { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  requiredFields: { fr: "Champs requis", en: "Required Fields", ar: "الحقول المطلوبة", es: "Campos obligatorios" },
  nameEmailRequired: { fr: "Le nom et l'email sont obligatoires.", en: "Name and email are required.", ar: "الاسم والبريد الإلكتروني مطلوبان.", es: "El nombre y el correo electrónico son obligatorios." },
  never: { fr: "Jamais", en: "Never", ar: "أبداً", es: "Nunca" },
  userCreated: { fr: "Utilisateur créé", en: "User Created", ar: "تم إنشاء المستخدم", es: "Usuario creado" },
  userAddedPending: { fr: "{name} a été ajouté avec le statut \"En attente de validation\".", en: "{name} has been added with \"Pending validation\" status.", ar: "تم إضافة {name} مع حالة \"في انتظار التحقق\".", es: "{name} ha sido añadido con el estado \"Pendiente de validación\"." },
  all: { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  superAdmins: { fr: "Super Admins", en: "Super Admins", ar: "المديرون العامون", es: "Super Admins" },
  admins: { fr: "Admins", en: "Admins", ar: "المديرون", es: "Admins" },
  members: { fr: "Membres", en: "Members", ar: "الأعضاء", es: "Miembros" },
  tenants: { fr: "Locataires", en: "Tenants", ar: "المستأجرون", es: "Inquilinos" },
  suspendedPlural: { fr: "Suspendus", en: "Suspended", ar: "الموقوفون", es: "Suspendidos" },
  userManagement: { fr: "Gestion des Utilisateurs", en: "User Management", ar: "إدارة المستخدمين", es: "Gestión de usuarios" },
  globalAdmin: { fr: "Administration globale de la plateforme", en: "Global platform administration", ar: "الإدارة العامة للمنصة", es: "Administración global de la plataforma" },
  total: { fr: "Total", en: "Total", ar: "المجموع", es: "Total" },
  activeStats: { fr: "Actifs", en: "Active", ar: "النشطون", es: "Activos" },
  searchPlaceholder: { fr: "Rechercher par nom, email, syndicat...", en: "Search by name, email, syndicate...", ar: "البحث بالاسم ، البريد الإلكتروني ، النقابة ...", es: "Buscar por nombre, email, sindicato..." },
  noUserFound: { fr: "Aucun utilisateur trouvé", en: "No user found", ar: "لم يتم العثور على مستخدم", es: "No se encontró ningún usuario" },
  email: { fr: "Email", en: "Email", ar: "البريد الإلكتروني", es: "Correo electrónico" },
  phone: { fr: "Téléphone", en: "Phone", ar: "الهاتف", es: "Teléfono" },
  notProvided: { fr: "Non renseigné", en: "Not provided", ar: "غير محدد", es: "No proporcionado" },
  syndicate: { fr: "Syndicat", en: "Syndicate", ar: "النقابة", es: "Sindicato" },
  memberSince: { fr: "Membre depuis", en: "Member since", ar: "عضو منذ", es: "Miembro desde" },
  lastLogin: { fr: "Dernière connexion", en: "Last login", ar: "آخر تسجيل دخول", es: "Último inicio de sesión" },
  accountStatus: { fr: "Statut du compte", en: "Account Status", ar: "حالة الحساب", es: "Estado de la cuenta" },
  role: { fr: "Rôle", en: "Role", ar: "الدور", es: "Rol" },
  emailSent: { fr: "Email envoyé", en: "Email Sent", ar: "تم إرسال البريد الإلكتروني", es: "Email enviado" },
  resetEmailSent: { fr: "Un lien de réinitialisation de mot de passe a été envoyé à {email}.", en: "A password reset link has been sent to {email}.", ar: "تم إرسال رابط إعادة تعيين كلمة المرور إلى {email}.", es: "Se ha enviado un enlace de restablecimiento de contraseña a {email}." },
  resetPassword: { fr: "Réinitialiser MDP", en: "Reset Password", ar: "إعادة تعيين كلمة المرور", es: "Restablecer contraseña" },
  newUser: { fr: "Nouvel Utilisateur", en: "New User", ar: "مستخدم جديد", es: "Nuevo usuario" },
  create: { fr: "Créer", en: "Create", ar: "إنشاء", es: "Crear" },
  fullName: { fr: "Nom complet *", en: "Full Name *", ar: "الاسم الكامل *", es: "Nombre completo *" },
  fullNamePlaceholder: { fr: "Ex: Mohammed Alaoui", en: "Ex: John Doe", ar: "مثال: محمد العلوي", es: "Ej: Juan Pérez" },
  emailPlaceholder: { fr: "Ex: m.alaoui@syndicat.ma", en: "Ex: john.doe@email.com", ar: "مثال: m.alaoui@syndicat.ma", es: "Ej: juan.perez@email.com" },
  phonePlaceholder: { fr: "+212 6 XX XX XX XX", en: "+1 23 45 67 89", ar: "+212 6 XX XX XX XX", es: "+34 6 XX XX XX XX" },
  lastLogin2m: { fr: "Il y a 2 min", en: "2 min ago", ar: "منذ دقيقتين", es: "Hace 2 min" },
  lastLogin1h: { fr: "Il y a 1h", en: "1h ago", ar: "منذ ساعة", es: "Hace 1h" },
  lastLogin3h: { fr: "Il y a 3h", en: "3h ago", ar: "منذ 3 ساعات", es: "Hace 3 horas" },
  lastLoginYesterday: { fr: "Hier", en: "Yesterday", ar: "أمس", es: "Ayer" },
  lastLogin2j: { fr: "Il y a 2j", en: "2d ago", ar: "منذ يومين", es: "Hace 2 días" },
  lastLogin5h: { fr: "Il y a 5h", en: "5h ago", ar: "منذ 5 ساعات", es: "Hace 5 horas" },
  lastLogin30j: { fr: "Il y a 30j", en: "30d ago", ar: "منذ 30 يوماً", es: "Hace 30 días" },
  lastLogin6h: { fr: "Il y a 6h", en: "6h ago", ar: "منذ 6 ساعات", es: "Hace 6 horas" },
  lastLogin60j: { fr: "Il y a 60j", en: "60d ago", ar: "منذ 60 يوماً", es: "Hace 60 días" },
  lastLogin1j: { fr: "Il y a 1j", en: "1d ago", ar: "منذ يوم", es: "Hace 1 día" },
};

const ROLE_CONFIG: Record<Role, { labelKey: keyof typeof STRINGS; color: string; icon: keyof typeof Feather.glyphMap }> = {
  super_admin: { labelKey: "superAdmin", color: "#7c3aed", icon: "shield" },
  syndicate_admin: { labelKey: "syndicateAdmin", color: "#3b82f6", icon: "briefcase" },
  member: { labelKey: "member", color: "#10b981", icon: "user" },
  tenant: { labelKey: "tenant", color: "#f97316", icon: "key" },
};

const STATUS_CONFIG: Record<Status, { labelKey: keyof typeof STRINGS; color: string }> = {
  active: { labelKey: "active", color: "#10b981" },
  inactive: { labelKey: "inactive", color: "#6b7280" },
  suspended: { labelKey: "suspended", color: "#ef4444" },
  pending: { labelKey: "pending", color: "#f59e0b" },
};


type TabFilter = "all" | Role | "suspended" | "pending";

export default function UtilisateursScreen() {
  const { allowed } = useRequireRole(["super_admin", "syndicate_admin"]);
  const colors = useColors();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const { lang } = useLanguage();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<Role>("member");

  const mapApiUser = useCallback((u: any): User => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    role: u.role as Role,
    status: u.status as Status,
    syndicate: u.syndicateName || "Global",
    joinDate: u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-MA") : "",
    lastLogin: "",
    avatar: u.name.split(" ").filter(Boolean).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
  }), []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ data: any[]; total: number }>("/users");
      setUsers((data.data || []).map(mapApiUser));
    } catch (e) {
      console.error("Failed to fetch users", e);
    } finally {
      setLoading(false);
    }
  }, [mapApiUser]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  if (!allowed) return null;
  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const filtered = (() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.syndicate.toLowerCase().includes(q));
    }
    if (tab === "suspended") list = list.filter((u) => u.status === "suspended");
    else if (tab === "pending") list = list.filter((u) => u.status === "pending");
    else if (tab !== "all") list = list.filter((u) => u.role === tab);
    return list;
  })();

  const counts = {
    all: users.length,
    super_admin: users.filter((u) => u.role === "super_admin").length,
    syndicate_admin: users.filter((u) => u.role === "syndicate_admin").length,
    member: users.filter((u) => u.role === "member").length,
    tenant: users.filter((u) => u.role === "tenant").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    pending: users.filter((u) => u.status === "pending").length,
    active: users.filter((u) => u.status === "active").length,
  };

  const handleStatusChange = async (uid: string, status: Status) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, status } : u));
    if (selected?.id === uid) setSelected((prev) => prev ? { ...prev, status } : null);
    try {
      await apiRequest(`/users/${uid}/status`, "PUT", { status });
    } catch (e) {
      console.error("Failed to update status", e);
      fetchUsers();
    }
  };

  const handleDelete = (uid: string, name: string) => {
    Alert.alert(STRINGS.deleteUserTitle[lang], STRINGS.deleteUserConfirm[lang].replace("{name}", name), [
      { text: STRINGS.cancel[lang], style: "cancel" },
      {
        text: STRINGS.delete[lang],
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setUsers((prev) => prev.filter((u) => u.id !== uid));
          setSelected(null);
          try {
            await apiRequest(`/users/${uid}`, "DELETE");
          } catch (e) {
            console.error("Failed to delete user", e);
            fetchUsers();
          }
        },
      },
    ]);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      showToast({ type: "warning", title: STRINGS.requiredFields[lang], message: STRINGS.nameEmailRequired[lang] });
      return;
    }
    try {
      const result = await apiRequest<{ data: any }>("/users", "POST", {
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim() || undefined,
        role: newRole,
        password: "ChangeMe@2026!",
      });
      if (result?.data) setUsers((prev) => [mapApiUser(result.data), ...prev]);
      setShowAdd(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewRole("member");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: STRINGS.userCreated[lang], message: STRINGS.userAddedPending[lang].replace("{name}", newName.trim()) });
    } catch (e: any) {
      showToast({ type: "error", title: STRINGS.requiredFields[lang], message: e?.message || "Erreur lors de la création" });
    }
  };

  const TABS: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: STRINGS.all[lang], count: counts.all },
    { key: "super_admin", label: STRINGS.superAdmins[lang], count: counts.super_admin },
    { key: "syndicate_admin", label: STRINGS.admins[lang], count: counts.syndicate_admin },
    { key: "member", label: STRINGS.members[lang], count: counts.member },
    { key: "tenant", label: STRINGS.tenants[lang], count: counts.tenant },
    { key: "pending", label: STRINGS.pending[lang], count: counts.pending },
    { key: "suspended", label: STRINGS.suspendedPlural[lang], count: counts.suspended },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{STRINGS.userManagement[lang]}</Text>
            <Text style={styles.headerSub}>{STRINGS.globalAdmin[lang]}</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setShowAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Feather name="user-plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: STRINGS.total[lang], value: counts.all, color: "#fff" },
            { label: STRINGS.activeStats[lang], value: counts.active, color: "#6ee7b7" },
            { label: STRINGS.pending[lang], value: counts.pending, color: "#fcd34d" },
            { label: STRINGS.suspendedPlural[lang], value: counts.suspended, color: "#fca5a5" },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLab}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={STRINGS.searchPlaceholder[lang]}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, { backgroundColor: tab === t.key ? colors.primary : colors.muted }]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? "rgba(255,255,255,0.25)" : colors.border }]}>
                <Text style={[styles.tabBadgeText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{STRINGS.noUserFound[lang]}</Text>
          </View>
        }
        renderItem={({ item: u }) => {
          const roleCfg = ROLE_CONFIG[u.role];
          const statusCfg = STATUS_CONFIG[u.status];
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelected(u); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={[styles.avatar, { backgroundColor: roleCfg.color + "20" }]}>
                <Text style={[styles.avatarText, { color: roleCfg.color }]}>{u.avatar}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.cardTop}>
                  <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{u.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "18" }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
                    <Text style={[styles.statusText, { color: statusCfg.color }]}>{STRINGS[statusCfg.labelKey][lang]}</Text>
                  </View>
                </View>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{u.email}</Text>
                <View style={styles.cardMeta}>
                  <View style={[styles.roleBadge, { backgroundColor: roleCfg.color + "12" }]}>
                    <Feather name={roleCfg.icon} size={10} color={roleCfg.color} />
                    <Text style={[styles.roleText, { color: roleCfg.color }]}>{STRINGS[roleCfg.labelKey][lang]}</Text>
                  </View>
                  <Text style={[styles.lastLogin, { color: colors.mutedForeground }]}>{STRINGS[u.lastLogin as keyof typeof STRINGS] ? STRINGS[u.lastLogin as keyof typeof STRINGS][lang] : u.lastLogin}</Text>
                </View>
                <Text style={[styles.syndicate, { color: colors.mutedForeground }]} numberOfLines={1}>{u.syndicate}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (() => {
          const u = selected;
          const roleCfg = ROLE_CONFIG[u.role];
          const statusCfg = STATUS_CONFIG[u.status];
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: roleCfg.color }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.modalAvatarBox}>
                  <View style={[styles.modalAvatar, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                    <Text style={styles.modalAvatarText}>{u.avatar}</Text>
                  </View>
                  <Text style={styles.modalName}>{u.name}</Text>
                  <View style={[styles.modalRoleBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                    <Feather name={roleCfg.icon} size={12} color="#fff" />
                    <Text style={styles.modalRoleText}>{STRINGS[roleCfg.labelKey][lang]}</Text>
                  </View>
                </View>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
                {/* Info card */}
                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "mail" as const, label: STRINGS.email[lang], value: u.email },
                    { icon: "phone" as const, label: STRINGS.phone[lang], value: u.phone || STRINGS.notProvided[lang] },
                    { icon: "briefcase" as const, label: STRINGS.syndicate[lang], value: u.syndicate },
                    { icon: "calendar" as const, label: STRINGS.memberSince[lang], value: u.joinDate },
                    { icon: "clock" as const, label: STRINGS.lastLogin[lang], value: STRINGS[u.lastLogin as keyof typeof STRINGS] ? STRINGS[u.lastLogin as keyof typeof STRINGS][lang] : u.lastLogin },
                  ].map(({ icon, label, value }, i) => (
                    <View key={label}>
                      {i > 0 && <View style={[styles.infoSep, { backgroundColor: colors.border }]} />}
                      <View style={styles.infoRow}>
                        <View style={[styles.infoIcon, { backgroundColor: roleCfg.color + "15" }]}>
                          <Feather name={icon} size={13} color={roleCfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
                          <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Status */}
                <View style={{ gap: 8 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{STRINGS.accountStatus[lang]}</Text>
                  <View style={styles.statusActions}>
                    {(["active", "inactive", "suspended", "pending"] as Status[]).map((s) => {
                      const cfg = STATUS_CONFIG[s];
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.statusBtn, {
                            backgroundColor: u.status === s ? cfg.color : colors.muted,
                            borderColor: u.status === s ? cfg.color : colors.border,
                          }]}
                          onPress={() => handleStatusChange(u.id, s)}
                        >
                          <Text style={[styles.statusBtnText, { color: u.status === s ? "#fff" : colors.mutedForeground }]}>{STRINGS[cfg.labelKey][lang]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Role change */}
                <View style={{ gap: 8 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{STRINGS.role[lang]}</Text>
                  <View style={styles.roleActions}>
                    {(["super_admin", "syndicate_admin", "member", "tenant"] as Role[]).map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      return (
                        <TouchableOpacity
                          key={r}
                          style={[styles.roleBtn, {
                            backgroundColor: u.role === r ? cfg.color + "15" : colors.muted,
                            borderColor: u.role === r ? cfg.color : colors.border,
                          }]}
                          onPress={async () => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const prevRole = u.role;
                            setUsers((prev) => prev.map((usr) => usr.id === u.id ? { ...usr, role: r } : usr));
                            setSelected((prev) => prev ? { ...prev, role: r } : null);
                            try {
                              await apiRequest(`/users/${u.id}/role`, "PUT", { role: r });
                            } catch (e) {
                              console.error("Failed to update role", e);
                              setUsers((prev) => prev.map((usr) => usr.id === u.id ? { ...usr, role: prevRole } : usr));
                              setSelected((prev) => prev ? { ...prev, role: prevRole } : null);
                            }
                          }}
                        >
                          <Feather name={cfg.icon} size={14} color={u.role === r ? cfg.color : colors.mutedForeground} />
                          <Text style={[styles.roleBtnText, { color: u.role === r ? cfg.color : colors.mutedForeground }]}>{STRINGS[cfg.labelKey][lang]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.actionBtns}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" }]}
                    onPress={async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); try { await apiRequest("/auth/forgot-password", "POST", { email: u.email }); } catch {} showToast({ type: "info", title: STRINGS.emailSent[lang], message: STRINGS.resetEmailSent[lang].replace("{email}", u.email) }); }}
                  >
                    <Feather name="key" size={15} color="#f59e0b" />
                    <Text style={[styles.actionBtnText, { color: "#f59e0b" }]}>{STRINGS.resetPassword[lang]}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#ef444415", borderColor: "#ef444440" }]}
                    onPress={() => handleDelete(u.id, u.name)}
                  >
                    <Feather name="trash-2" size={15} color="#ef4444" />
                    <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>{STRINGS.delete[lang]}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* Add user modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.primary }]}>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{STRINGS.newUser[lang]}</Text>
            <TouchableOpacity onPress={handleAdd}>
              <Text style={styles.modalSave}>{STRINGS.create[lang]}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            {[
              { label: STRINGS.fullName[lang], val: newName, set: setNewName, placeholder: STRINGS.fullNamePlaceholder[lang] },
              { label: STRINGS.email[lang] + " *", val: newEmail, set: setNewEmail, placeholder: STRINGS.emailPlaceholder[lang] },
              { label: STRINGS.phone[lang], val: newPhone, set: setNewPhone, placeholder: STRINGS.phonePlaceholder[lang] },
            ].map(({ label, val, set, placeholder }) => (
              <View key={label} style={{ gap: 6 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={val}
                  onChangeText={set}
                />
              </View>
            ))}

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.role[lang]}</Text>
              <View style={styles.roleActions}>
                {(["super_admin", "syndicate_admin", "member", "tenant"] as Role[]).map((r) => {
                  const cfg = ROLE_CONFIG[r];
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleBtn, { backgroundColor: newRole === r ? cfg.color + "15" : colors.muted, borderColor: newRole === r ? cfg.color : colors.border }]}
                      onPress={() => { setNewRole(r); Haptics.selectionAsync(); }}
                    >
                      <Feather name={cfg.icon} size={14} color={newRole === r ? cfg.color : colors.mutedForeground} />
                      <Text style={[styles.roleBtnText, { color: newRole === r ? cfg.color : colors.mutedForeground }]}>{STRINGS[cfg.labelKey][lang]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, padding: 14 },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", textAlign: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  tabBar: { flexShrink: 0, borderBottomWidth: 1 },
  tabContent: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  userName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  roleText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  lastLogin: { fontSize: 11, fontFamily: "Inter_400Regular" },
  syndicate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  modal: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modalAvatarBox: { flex: 1, alignItems: "center", gap: 8 },
  modalAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  modalAvatarText: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff" },
  modalName: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  modalRoleBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  modalRoleText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },

  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 1 },
  infoSep: { height: 1, marginHorizontal: 14 },

  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statusBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  roleActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  roleBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  syndicateOption: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  syndicateText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});
