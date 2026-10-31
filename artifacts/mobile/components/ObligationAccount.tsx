import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { FormSheet } from "@/components/FormSheet";
import { BalanceMeter, Button, StatusBadge, TextField, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCallStatus } from "@/hooks/useCallStatus";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { apiRequest } from "@/lib/api";

type Account = {
  id: string;
  callReference: string | null;
  lotNumber: string;
  period: string;
  originalAmount: string;
  amount: string;
  amountPaid: string;
  remaining: string;
  pendingAmount: string;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  overdue: boolean;
  cancellationReason: string | null;
  payments: { id: string; amount: string; method: string; status: "pending" | "validated" | "rejected" | "reversed"; declaredAt: string; receiptNumber: string | null; rejectionReason: string | null }[];
  adjustments: { previousAmount: string; newAmount: string; reason: string; at: string }[];
  reminders: { kind: string; remaining: string; at: string }[];
  paymentOptions: { methods: string[]; online: boolean; bankAccount: { label: string; bankName: string | null; rib: string | null } | null } | null;
};

const PAY_TONE: Record<Account["payments"][number]["status"], StatusTone> = { pending: "info", validated: "success", rejected: "danger", reversed: "neutral" };

/**
 * Everything about one obligation, from GET /appels-de-fonds/:id/account:
 * amounts (issued, due, paid, remaining), dates, payments of every status,
 * adjustments, reminders and how to pay. The finance team can remind, the
 * syndic can adjust (with a reason). Nothing is computed here.
 */
export default function ObligationAccount({ appelId, onClose, onChanged }: { appelId: string | null; onClose: () => void; onChanged?: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { money, date } = useFormat();
  const callStatus = useCallStatus();
  const [data, setData] = useState<Account | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjErr, setAdjErr] = useState<string | null>(null);

  const isFinance = user?.role === "syndicate_admin" || user?.role === "treasurer";
  const isSyndic = user?.role === "syndicate_admin";

  const load = useCallback(async () => {
    if (!appelId) return;
    setErr(null);
    try {
      setData((await apiRequest<{ data: Account }>(`/appels-de-fonds/${appelId}/account`)).data);
    } catch (e: any) {
      setErr(e?.message ?? t("uiLoadError"));
    }
  }, [appelId, t]);

  useEffect(() => {
    setData(null);
    setAdjusting(false);
    load();
  }, [load]);

  const remind = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await apiRequest(`/appels-de-fonds/${data.id}/remind`, "POST", {});
      Alert.alert(t("fcRemindSent"));
      load();
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const adjust = async () => {
    if (!data) return;
    setAdjErr(null);
    if (!/^\d+(\.\d{1,2})?$/.test(newAmount.trim().replace(",", "."))) return setAdjErr(t("fcInvalidAmount"));
    if (reason.trim().length < 5) return setAdjErr(t("fcReason"));
    setBusy(true);
    try {
      await apiRequest(`/appels-de-fonds/${data.id}/adjust`, "POST", { newAmount: newAmount.trim().replace(",", "."), reason: reason.trim() });
      setAdjusting(false);
      setNewAmount("");
      setReason("");
      await load();
      onChanged?.();
    } catch (e: any) {
      setAdjErr(e?.message ?? t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const st = data ? callStatus(data.status) : null;
  const open = data && !["paid", "cancelled"].includes(data.status);

  return (
    <FormSheet visible={!!appelId} title={t("fcAccount")} onClose={onClose}>
      {err ? (
        <Text style={[TYPE.body, { color: colors.dangerText }]}>{err}</Text>
      ) : !data ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.subtitle, { color: colors.foreground }]}>
                {data.period} · {t("lotLabel")} {data.lotNumber}
              </Text>
              {data.callReference ? <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("fcCall").replace("{r}", data.callReference)}</Text> : null}
            </View>
            {st ? <StatusBadge label={st.label} tone={st.tone} icon={st.icon} size="md" /> : null}
          </View>

          <View style={styles.dates}>
            {data.issueDate ? <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("fcIssued").replace("{d}", date(data.issueDate))}</Text> : null}
            {data.dueDate ? (
              <Text style={[TYPE.caption, { color: data.overdue ? colors.dangerText : colors.textMuted }]}>
                {t("fcDue").replace("{d}", date(data.dueDate))}
                {data.overdue ? ` · ${t("fcOverdue")}` : ""}
              </Text>
            ) : null}
          </View>

          {data.status === "cancelled" ? (
            <StatusBadge label={t("fcCancelled").replace("{r}", data.cancellationReason ?? "")} tone="neutral" icon="slash" size="md" />
          ) : (
            <BalanceMeter
              paid={Number(data.amountPaid)}
              total={Number(data.amount)}
              paidLabel={t("fcPaid")}
              remainingLabel={t("fcRemaining")}
              paidText={money(data.amountPaid)}
              remainingText={money(data.remaining)}
              overdue={data.overdue}
            />
          )}
          {data.originalAmount !== data.amount ? (
            <Text style={[TYPE.caption, { color: colors.textMuted }]}>
              {t("fcOriginal")} : {money(data.originalAmount)} → {t("fcCurrent")} : {money(data.amount)}
            </Text>
          ) : null}
          {Number(data.pendingAmount) > 0 ? <StatusBadge label={`${t("fcPending")} : ${money(data.pendingAmount)}`} tone="info" icon="clock" size="md" /> : null}

          <Text style={[TYPE.label, styles.section, { color: colors.foreground }]}>{t("fcPayments")}</Text>
          {data.payments.length === 0 ? (
            <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("fcNoPayments")}</Text>
          ) : (
            data.payments.map((p) => (
              <View key={p.id} style={[styles.row, { borderColor: colors.border }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.bodyStrong, { color: colors.foreground, fontVariant: ["tabular-nums"] }]}>{money(p.amount)}</Text>
                  <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                    {date(p.declaredAt)} · {p.method}
                    {p.receiptNumber ? ` · ${t("fcReceipt").replace("{n}", p.receiptNumber)}` : ""}
                  </Text>
                  {p.rejectionReason ? <Text style={[TYPE.caption, { color: colors.dangerText }]}>{p.rejectionReason}</Text> : null}
                </View>
                <StatusBadge label={t(`fcPayStatus_${p.status}`)} tone={PAY_TONE[p.status]} />
              </View>
            ))
          )}

          {data.paymentOptions ? (
            <View style={[styles.box, { backgroundColor: colors.infoSoft }]}>
              <Text style={[TYPE.label, { color: colors.infoText }]}>{t("fcHowToPay")}</Text>
              {data.paymentOptions.bankAccount ? (
                <Text style={[TYPE.secondary, { color: colors.infoText }]} selectable>
                  {t("fcBank").replace("{bank}", data.paymentOptions.bankAccount.bankName ?? data.paymentOptions.bankAccount.label).replace("{rib}", data.paymentOptions.bankAccount.rib ?? "—")}
                </Text>
              ) : null}
              <Text style={[TYPE.caption, { color: colors.infoText }]}>{t("fcNoOnline")}</Text>
            </View>
          ) : null}

          {data.adjustments.length ? (
            <>
              <Text style={[TYPE.label, styles.section, { color: colors.foreground }]}>{t("fcAdjustments")}</Text>
              {data.adjustments.map((a, i) => (
                <Text key={i} style={[TYPE.caption, { color: colors.textSecondary }]}>
                  {date(a.at)} · {money(a.previousAmount)} → {money(a.newAmount)} — {a.reason}
                </Text>
              ))}
            </>
          ) : null}

          {data.reminders.length ? (
            <>
              <Text style={[TYPE.label, styles.section, { color: colors.foreground }]}>{t("fcReminders")}</Text>
              {data.reminders.map((r, i) => (
                <Text key={i} style={[TYPE.caption, { color: colors.textSecondary }]}>
                  {date(r.at)} · {money(r.remaining)}
                </Text>
              ))}
            </>
          ) : null}

          {isFinance && open ? (
            <View style={styles.actions}>
              {data.overdue ? <Button label={t("fcRemind")} icon="bell" variant="secondary" style={{ flex: 1 }} loading={busy} onPress={remind} /> : null}
              {isSyndic && data.status !== "pending_validation" ? (
                <Button label={t("fcAdjust")} icon="edit-3" variant="secondary" style={{ flex: 1 }} onPress={() => setAdjusting((v) => !v)} />
              ) : null}
            </View>
          ) : null}

          {adjusting ? (
            <View style={{ gap: 12 }}>
              <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("fcAdjustHint")}</Text>
              <TextField label={t("fcNewAmount")} value={newAmount} onChangeText={setNewAmount} keyboardType="decimal-pad" required />
              <TextField label={t("fcReason")} value={reason} onChangeText={setReason} multiline required error={adjErr ?? undefined} />
              <Button label={t("save")} icon="check" fullWidth loading={busy} onPress={adjust} />
            </View>
          ) : null}
          <View style={styles.hint}>
            <Feather name="info" size={13} color={colors.textMuted} />
            <Text style={[TYPE.caption, { color: colors.textMuted, flex: 1 }]}>{t("uiNotDuePending")}</Text>
          </View>
        </>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  dates: { gap: 2 },
  section: { marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  box: { borderRadius: 12, padding: 12, gap: 6 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
});
