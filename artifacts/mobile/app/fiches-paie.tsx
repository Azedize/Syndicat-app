import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData, type PayslipRecord } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type Tab = "mois" | "historique" | "employes";

const MONTHS = ["Mai 2026", "Avril 2026", "Mars 2026", "Février 2026", "Janvier 2026", "Déc 2025"];

const STATUS_CFG = {
  paid: { label: "Payé", color: "#10b981", bg: "#10b98118" },
  pending: { label: "En attente", color: "#f59e0b", bg: "#f59e0b18" },
  draft: { label: "Brouillon", color: "#6b7280", bg: "#6b728018" },
};

function LineRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  const colors = useColors();
  return (
    <View style={styles.lineRow}>
      <Text style={[styles.lineLabel, { color: colors.mutedForeground, fontFamily: bold ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: color ?? colors.foreground, fontFamily: bold ? "Inter_700Bold" : "Inter_500Medium" }]}>{value}</Text>
    </View>
  );
}

export default function FichesPaieScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { payslips, salaries, generatePayslip } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<Tab>("mois");
  const [selectedMonth, setSelectedMonth] = useState("Mai 2026");
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genMonth, setGenMonth] = useState("Juin 2026");

  const monthPayslips = payslips.filter((ps) => ps.month === selectedMonth);
  const totalNet = monthPayslips.reduce((s, ps) => s + ps.netSalary, 0);
  const totalBrut = monthPayslips.reduce((s, ps) => s + ps.baseSalary + ps.allowances, 0);
  const totalDeductions = monthPayslips.reduce((s, ps) => s + ps.deductions, 0);
  const paidCount = monthPayslips.filter((ps) => ps.status === "paid").length;

  const employees = Array.from(new Set(payslips.map((ps) => ps.employee))).map((name) => {
    const emp = payslips.find((ps) => ps.employee === name)!;
    const empPayslips = payslips.filter((ps) => ps.employee === name);
    return { id: emp.employeeId, name, role: emp.role, payslips: empPayslips };
  });

  const handleGenerate = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    employees.forEach((emp) => generatePayslip(emp.id, genMonth));
    setShowGenerate(false);
    Alert.alert("Fiches générées", `${employees.length} fiches de paie créées pour ${genMonth}.`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Fiches de Paie</Text>
        <TouchableOpacity
          style={[styles.genBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowGenerate(true); }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.genBtnText}>Générer</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([["mois", "Par mois"], ["historique", "Historique"], ["employes", "Employés"]] as [Tab, string][]).map(([t, l]) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { Haptics.selectionAsync(); setTab(t); }}
          >
            <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: isWide ? 32 : insets.bottom + 100 }}>

        {tab === "mois" && (
          <>
            {/* Month selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingVertical: 2 }}>
              {MONTHS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.monthChip, { backgroundColor: selectedMonth === m ? colors.primary : colors.card, borderColor: selectedMonth === m ? colors.primary : colors.border }]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedMonth(m); }}
                >
                  <Text style={[styles.monthChipText, { color: selectedMonth === m ? "#fff" : colors.foreground }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Summary strip */}
            <View style={[styles.summaryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Masse salariale brute", value: `${totalBrut.toLocaleString()} MAD`, color: colors.foreground },
                { label: "Total cotisations", value: `${totalDeductions.toLocaleString()} MAD`, color: "#ef4444" },
                { label: "Net à payer", value: `${totalNet.toLocaleString()} MAD`, color: "#10b981" },
              ].map((s, i, arr) => (
                <View key={s.label} style={[styles.summaryCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                  <Text style={[styles.summaryVal, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.summaryLab, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Status indicator */}
            <View style={[styles.statusBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statusDot, { backgroundColor: paidCount === monthPayslips.length ? "#10b981" : "#f59e0b" }]} />
              <Text style={[styles.statusText, { color: colors.foreground }]}>
                {paidCount}/{monthPayslips.length} fiches payées pour {selectedMonth}
              </Text>
            </View>

            {monthPayslips.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="file-text" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune fiche pour ce mois</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Appuyez sur "Générer" pour créer les fiches</Text>
              </View>
            ) : (
              monthPayslips.map((ps) => {
                const st = STATUS_CFG[ps.status];
                return (
                  <TouchableOpacity
                    key={ps.id}
                    style={[styles.payslipCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPayslip(ps); setShowDetail(true); }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.employeeAvatar, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>
                        {ps.employee.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.empName, { color: colors.foreground }]}>{ps.employee}</Text>
                      <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{ps.role}</Text>
                      <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                        <Text style={[styles.statusChipText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.netSalary, { color: "#10b981" }]}>{ps.netSalary.toLocaleString()}</Text>
                      <Text style={[styles.netLabel, { color: colors.mutedForeground }]}>MAD net</Text>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {tab === "historique" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TOUTES LES FICHES DE PAIE</Text>
            {payslips.map((ps) => {
              const st = STATUS_CFG[ps.status];
              return (
                <TouchableOpacity
                  key={ps.id}
                  style={[styles.payslipCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPayslip(ps); setShowDetail(true); }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.employeeAvatar, { backgroundColor: colors.primary + "18" }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>
                      {ps.employee.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.empName, { color: colors.foreground }]}>{ps.employee}</Text>
                    <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{ps.month}</Text>
                    <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusChipText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.netSalary, { color: "#10b981" }]}>{ps.netSalary.toLocaleString()}</Text>
                    <Text style={[styles.netLabel, { color: colors.mutedForeground }]}>MAD net</Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {tab === "employes" && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LISTE DES EMPLOYÉS</Text>
            {employees.map((emp) => {
              const lastPs = emp.payslips[0];
              const totalPaid = emp.payslips.filter((ps) => ps.status === "paid").reduce((s, ps) => s + ps.netSalary, 0);
              return (
                <View key={emp.id} style={[styles.empCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.empCardHeader}>
                    <View style={[styles.employeeAvatar, { backgroundColor: colors.primary + "18", width: 50, height: 50, borderRadius: 25 }]}>
                      <Text style={[styles.avatarText, { color: colors.primary, fontSize: 18 }]}>
                        {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empName, { color: colors.foreground }]}>{emp.name}</Text>
                      <Text style={[styles.empRole, { color: colors.mutedForeground }]}>{emp.role}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.netSalary, { color: colors.foreground, fontSize: 15 }]}>
                        {lastPs?.baseSalary.toLocaleString()} MAD
                      </Text>
                      <Text style={[styles.netLabel, { color: colors.mutedForeground }]}>Salaire de base</Text>
                    </View>
                  </View>

                  <View style={[styles.empStats, { borderTopColor: colors.border }]}>
                    {[
                      { label: "Fiches émises", value: `${emp.payslips.length}` },
                      { label: "Fiches payées", value: `${emp.payslips.filter((p) => p.status === "paid").length}` },
                      { label: "Total versé", value: `${totalPaid.toLocaleString()} MAD` },
                    ].map((s, i, arr) => (
                      <View key={s.label} style={[styles.empStatCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                        <Text style={[styles.empStatVal, { color: colors.foreground }]}>{s.value}</Text>
                        <Text style={[styles.empStatLab, { color: colors.mutedForeground }]}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Payslip detail modal */}
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            {selectedPayslip && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={[styles.payslipHeader, { backgroundColor: colors.primary + "10", borderRadius: 14 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payslipTitle, { color: colors.foreground }]}>Fiche de Paie</Text>
                    <Text style={[styles.payslipPeriod, { color: colors.primary }]}>{selectedPayslip.month}</Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: STATUS_CFG[selectedPayslip.status].bg }]}>
                    <Text style={[styles.statusChipText, { color: STATUS_CFG[selectedPayslip.status].color }]}>
                      {STATUS_CFG[selectedPayslip.status].label}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 16, gap: 4 }}>
                  <Text style={[styles.detailSection, { color: colors.mutedForeground }]}>EMPLOYÉ</Text>
                  <LineRow label="Nom complet" value={selectedPayslip.employee} />
                  <LineRow label="Poste" value={selectedPayslip.role} />
                  {selectedPayslip.payDate && <LineRow label="Date de paiement" value={selectedPayslip.payDate} />}
                </View>

                <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />

                <View style={{ gap: 4 }}>
                  <Text style={[styles.detailSection, { color: colors.mutedForeground }]}>RÉMUNÉRATION BRUTE</Text>
                  <LineRow label="Salaire de base" value={`${selectedPayslip.baseSalary.toLocaleString()} MAD`} />
                  <LineRow label="Indemnités & primes" value={`+${selectedPayslip.allowances.toLocaleString()} MAD`} color="#10b981" />
                  <LineRow label="Total brut" value={`${(selectedPayslip.baseSalary + selectedPayslip.allowances).toLocaleString()} MAD`} bold />
                </View>

                <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />

                <View style={{ gap: 4 }}>
                  <Text style={[styles.detailSection, { color: colors.mutedForeground }]}>COTISATIONS & RETENUES</Text>
                  <LineRow label="CNSS (8%)" value={`-${selectedPayslip.cnss.toLocaleString()} MAD`} color="#ef4444" />
                  <LineRow label="IR (retenue à la source)" value={`-${selectedPayslip.ir.toLocaleString()} MAD`} color="#ef4444" />
                  <LineRow label="Mutuelle" value={`-${selectedPayslip.mutuelle.toLocaleString()} MAD`} color="#ef4444" />
                  <LineRow label="Total retenues" value={`-${selectedPayslip.deductions.toLocaleString()} MAD`} bold color="#ef4444" />
                </View>

                <View style={[styles.netBlock, { backgroundColor: "#10b98115", borderColor: "#10b98130" }]}>
                  <Text style={[styles.netBlockLabel, { color: "#10b981" }]}>NET À PAYER</Text>
                  <Text style={[styles.netBlockValue, { color: "#10b981" }]}>
                    {selectedPayslip.netSalary.toLocaleString()} MAD
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Téléchargement", "Fiche PDF téléchargée."); }}
                  >
                    <Feather name="download" size={16} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>Télécharger PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Envoi", "Fiche envoyée par email."); }}
                  >
                    <Feather name="send" size={16} color="#3b82f6" />
                    <Text style={[styles.actionBtnText, { color: "#3b82f6" }]}>Envoyer par email</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowDetail(false)}
                >
                  <Text style={styles.closeBtnText}>Fermer</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Generate modal */}
      <Modal visible={showGenerate} transparent animationType="slide" onRequestClose={() => setShowGenerate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Générer les fiches de paie</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Sélectionnez le mois pour générer les {employees.length} fiches de paie.
            </Text>

            <View style={{ gap: 8, marginTop: 12 }}>
              {["Juin 2026", "Juillet 2026", "Août 2026"].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.monthOption, { borderColor: genMonth === m ? colors.primary : colors.border, backgroundColor: genMonth === m ? colors.primary + "10" : colors.background }]}
                  onPress={() => { Haptics.selectionAsync(); setGenMonth(m); }}
                >
                  <View style={[styles.optionDot, { borderColor: colors.primary, backgroundColor: genMonth === m ? colors.primary : "transparent" }]} />
                  <Text style={[styles.optionText, { color: colors.foreground }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: colors.border }]}
                onPress={() => setShowGenerate(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: colors.primary }]}
                onPress={handleGenerate}
              >
                <Feather name="file-text" size={15} color="#fff" />
                <Text style={styles.modalConfirmText}>Générer ({employees.length} fiches)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    gap: 10,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  genBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  genBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  monthChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  monthChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryRow: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4, paddingHorizontal: 4 },
  summaryVal: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  summaryLab: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  statusBar: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  payslipCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  employeeAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  empName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  empRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  netSalary: { fontSize: 16, fontFamily: "Inter_700Bold" },
  netLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  empCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  empCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  empStats: { flexDirection: "row", borderTopWidth: 1 },
  empStatCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 3 },
  empStatVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  empStatLab: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginLeft: 4 },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  payslipHeader: { padding: 16, flexDirection: "row", alignItems: "center" },
  payslipTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  payslipPeriod: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  detailSection: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  lineRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  lineLabel: { fontSize: 13 },
  lineValue: { fontSize: 13 },
  detailDivider: { height: 1, marginVertical: 12 },
  netBlock: { borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  netBlockLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  netBlockValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 14 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  closeBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12 },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  monthOption: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14 },
  optionDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  optionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalConfirm: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  modalConfirmText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
