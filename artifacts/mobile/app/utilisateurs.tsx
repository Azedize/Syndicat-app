import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
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

type Role = "super_admin" | "syndicate_admin" | "member";
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

const ROLE_CONFIG: Record<Role, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  super_admin: { label: "Super Admin", color: "#7c3aed", icon: "shield" },
  syndicate_admin: { label: "Admin Syndicat", color: "#3b82f6", icon: "briefcase" },
  member: { label: "Membre", color: "#10b981", icon: "user" },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  active: { label: "Actif", color: "#10b981" },
  inactive: { label: "Inactif", color: "#6b7280" },
  suspended: { label: "Suspendu", color: "#ef4444" },
  pending: { label: "En attente", color: "#f59e0b" },
};

const SYNDICATES = [
  "SNE — Syndicat National de l'Éducation",
  "CDT — Confédération Démocratique du Travail",
  "UMT — Union Marocaine du Travail",
  "FNTE — Fédération Nationale des Travailleurs",
  "Plateforme Globale",
];

const INITIAL_USERS: User[] = [
  { id: "u1", name: "Ahmed Benali", email: "admin@syndycat.com", phone: "+212 6 61 11 22 33", role: "super_admin", status: "active", syndicate: "Plateforme Globale", joinDate: "2023-01-01", lastLogin: "Il y a 2 min", avatar: "AB" },
  { id: "u2", name: "Fatima Zahra El Alami", email: "admin@syndicat.com", phone: "+212 6 62 33 44 55", role: "syndicate_admin", status: "active", syndicate: "SNE — Syndicat National de l'Éducation", joinDate: "2023-03-15", lastLogin: "Il y a 1h", avatar: "FZ" },
  { id: "u3", name: "Mohammed Alaoui", email: "membre@email.com", phone: "+212 6 63 44 55 66", role: "member", status: "active", syndicate: "SNE — Syndicat National de l'Éducation", joinDate: "2023-09-01", lastLogin: "Il y a 3h", avatar: "MA" },
  { id: "u4", name: "Nadia Benkiran", email: "n.benkiran@cdt.ma", phone: "+212 6 64 55 66 77", role: "syndicate_admin", status: "active", syndicate: "CDT — Confédération Démocratique du Travail", joinDate: "2023-04-20", lastLogin: "Hier", avatar: "NB" },
  { id: "u5", name: "Omar Slimani", email: "o.slimani@sne.ma", phone: "+212 6 65 66 77 88", role: "member", status: "active", syndicate: "SNE — Syndicat National de l'Éducation", joinDate: "2024-01-10", lastLogin: "Il y a 2j", avatar: "OS" },
  { id: "u6", name: "Zineb Mansour", email: "z.mansour@umt.ma", phone: "+212 6 66 77 88 99", role: "member", status: "pending", syndicate: "UMT — Union Marocaine du Travail", joinDate: "2026-05-01", lastLogin: "Jamais", avatar: "ZM" },
  { id: "u7", name: "Rachid Amrani", email: "r.amrani@fnte.ma", phone: "+212 6 67 88 99 00", role: "syndicate_admin", status: "active", syndicate: "FNTE — Fédération Nationale des Travailleurs", joinDate: "2023-06-15", lastLogin: "Il y a 5h", avatar: "RA" },
  { id: "u8", name: "Sanaa Benchekroun", email: "s.bench@cdt.ma", phone: "+212 6 68 99 00 11", role: "member", status: "suspended", syndicate: "CDT — Confédération Démocratique du Travail", joinDate: "2023-11-20", lastLogin: "Il y a 30j", avatar: "SB" },
  { id: "u9", name: "Karim Zouheir", email: "k.zouheir@sne.ma", phone: "+212 6 69 00 11 22", role: "member", status: "active", syndicate: "SNE — Syndicat National de l'Éducation", joinDate: "2024-02-14", lastLogin: "Il y a 6h", avatar: "KZ" },
  { id: "u10", name: "Laila Berrada", email: "l.berrada@umt.ma", phone: "+212 6 70 11 22 33", role: "member", status: "inactive", syndicate: "UMT — Union Marocaine du Travail", joinDate: "2022-08-30", lastLogin: "Il y a 60j", avatar: "LB" },
  { id: "u11", name: "Hassan Berrada", email: "h.berrada@sne.ma", phone: "+212 6 71 22 33 44", role: "member", status: "active", syndicate: "SNE — Syndicat National de l'Éducation", joinDate: "2024-03-01", lastLogin: "Il y a 1j", avatar: "HB" },
  { id: "u12", name: "Khadija Tahiri", email: "k.tahiri@fnte.ma", phone: "+212 6 72 33 44 55", role: "member", status: "pending", syndicate: "FNTE — Fédération Nationale des Travailleurs", joinDate: "2026-04-15", lastLogin: "Jamais", avatar: "KT" },
];

type TabFilter = "all" | Role | "suspended" | "pending";

export default function UtilisateursScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [tab, setTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<Role>("member");
  const [newSyndicate, setNewSyndicate] = useState(SYNDICATES[0]);

  const filtered = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.syndicate.toLowerCase().includes(q));
    }
    if (tab === "suspended") list = list.filter((u) => u.status === "suspended");
    else if (tab === "pending") list = list.filter((u) => u.status === "pending");
    else if (tab !== "all") list = list.filter((u) => u.role === tab);
    return list;
  }, [users, tab, search]);

  const counts = useMemo(() => ({
    all: users.length,
    super_admin: users.filter((u) => u.role === "super_admin").length,
    syndicate_admin: users.filter((u) => u.role === "syndicate_admin").length,
    member: users.filter((u) => u.role === "member").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    pending: users.filter((u) => u.status === "pending").length,
    active: users.filter((u) => u.status === "active").length,
  }), [users]);

  const handleStatusChange = (uid: string, status: Status) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, status } : u));
    if (selected?.id === uid) setSelected((prev) => prev ? { ...prev, status } : null);
  };

  const handleDelete = (uid: string, name: string) => {
    Alert.alert("Supprimer l'utilisateur", `Êtes-vous sûr de vouloir supprimer ${name} ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setUsers((prev) => prev.filter((u) => u.id !== uid));
          setSelected(null);
        },
      },
    ]);
  };

  const handleAdd = () => {
    if (!newName.trim() || !newEmail.trim()) {
      Alert.alert("Champs requis", "Le nom et l'email sont obligatoires.");
      return;
    }
    const newUser: User = {
      id: `u${Date.now()}`,
      name: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim(),
      role: newRole,
      status: "pending",
      syndicate: newSyndicate,
      joinDate: new Date().toISOString().split("T")[0],
      lastLogin: "Jamais",
      avatar: newName.trim().split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
    };
    setUsers((prev) => [newUser, ...prev]);
    setShowAdd(false);
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewRole("member");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Utilisateur créé", `${newUser.name} a été ajouté avec le statut "En attente de validation".`);
  };

  const TABS: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "Tous", count: counts.all },
    { key: "super_admin", label: "Super Admins", count: counts.super_admin },
    { key: "syndicate_admin", label: "Admins", count: counts.syndicate_admin },
    { key: "member", label: "Membres", count: counts.member },
    { key: "pending", label: "En attente", count: counts.pending },
    { key: "suspended", label: "Suspendus", count: counts.suspended },
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
            <Text style={styles.headerTitle}>Gestion des Utilisateurs</Text>
            <Text style={styles.headerSub}>Administration globale de la plateforme</Text>
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
            { label: "Total", value: counts.all, color: "#fff" },
            { label: "Actifs", value: counts.active, color: "#6ee7b7" },
            { label: "En attente", value: counts.pending, color: "#fcd34d" },
            { label: "Suspendus", value: counts.suspended, color: "#fca5a5" },
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
          placeholder="Rechercher par nom, email, syndicat..."
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
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun utilisateur trouvé</Text>
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
                    <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                  </View>
                </View>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{u.email}</Text>
                <View style={styles.cardMeta}>
                  <View style={[styles.roleBadge, { backgroundColor: roleCfg.color + "12" }]}>
                    <Feather name={roleCfg.icon} size={10} color={roleCfg.color} />
                    <Text style={[styles.roleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
                  </View>
                  <Text style={[styles.lastLogin, { color: colors.mutedForeground }]}>{u.lastLogin}</Text>
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
                    <Text style={styles.modalRoleText}>{roleCfg.label}</Text>
                  </View>
                </View>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
                {/* Info card */}
                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "mail" as const, label: "Email", value: u.email },
                    { icon: "phone" as const, label: "Téléphone", value: u.phone || "Non renseigné" },
                    { icon: "briefcase" as const, label: "Syndicat", value: u.syndicate },
                    { icon: "calendar" as const, label: "Membre depuis", value: u.joinDate },
                    { icon: "clock" as const, label: "Dernière connexion", value: u.lastLogin },
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
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Statut du compte</Text>
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
                          <Text style={[styles.statusBtnText, { color: u.status === s ? "#fff" : colors.mutedForeground }]}>{cfg.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Role change */}
                <View style={{ gap: 8 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rôle</Text>
                  <View style={styles.roleActions}>
                    {(["super_admin", "syndicate_admin", "member"] as Role[]).map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      return (
                        <TouchableOpacity
                          key={r}
                          style={[styles.roleBtn, {
                            backgroundColor: u.role === r ? cfg.color + "15" : colors.muted,
                            borderColor: u.role === r ? cfg.color : colors.border,
                          }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setUsers((prev) => prev.map((usr) => usr.id === u.id ? { ...usr, role: r } : usr));
                            setSelected((prev) => prev ? { ...prev, role: r } : null);
                          }}
                        >
                          <Feather name={cfg.icon} size={14} color={u.role === r ? cfg.color : colors.mutedForeground} />
                          <Text style={[styles.roleBtnText, { color: u.role === r ? cfg.color : colors.mutedForeground }]}>{cfg.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.actionBtns}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" }]}
                    onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Email envoyé", `Un lien de réinitialisation de mot de passe a été envoyé à ${u.email}.`); }}
                  >
                    <Feather name="key" size={15} color="#f59e0b" />
                    <Text style={[styles.actionBtnText, { color: "#f59e0b" }]}>Réinitialiser MDP</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#ef444415", borderColor: "#ef444440" }]}
                    onPress={() => handleDelete(u.id, u.name)}
                  >
                    <Feather name="trash-2" size={15} color="#ef4444" />
                    <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Supprimer</Text>
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
            <Text style={styles.modalTitle}>Nouvel Utilisateur</Text>
            <TouchableOpacity onPress={handleAdd}>
              <Text style={styles.modalSave}>Créer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            {[
              { label: "Nom complet *", val: newName, set: setNewName, placeholder: "Ex: Mohammed Alaoui" },
              { label: "Email *", val: newEmail, set: setNewEmail, placeholder: "Ex: m.alaoui@syndicat.ma" },
              { label: "Téléphone", val: newPhone, set: setNewPhone, placeholder: "+212 6 XX XX XX XX" },
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
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Rôle</Text>
              <View style={styles.roleActions}>
                {(["super_admin", "syndicate_admin", "member"] as Role[]).map((r) => {
                  const cfg = ROLE_CONFIG[r];
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleBtn, { backgroundColor: newRole === r ? cfg.color + "15" : colors.muted, borderColor: newRole === r ? cfg.color : colors.border }]}
                      onPress={() => { setNewRole(r); Haptics.selectionAsync(); }}
                    >
                      <Feather name={cfg.icon} size={14} color={newRole === r ? cfg.color : colors.mutedForeground} />
                      <Text style={[styles.roleBtnText, { color: newRole === r ? cfg.color : colors.mutedForeground }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Syndicat</Text>
              {SYNDICATES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.syndicateOption, {
                    backgroundColor: newSyndicate === s ? colors.primary + "12" : colors.card,
                    borderColor: newSyndicate === s ? colors.primary : colors.border,
                  }]}
                  onPress={() => { setNewSyndicate(s); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.syndicateText, { color: newSyndicate === s ? colors.primary : colors.foreground }]} numberOfLines={1}>{s}</Text>
                  {newSyndicate === s && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
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
