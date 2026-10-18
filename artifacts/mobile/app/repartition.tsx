import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";

/**
 * Charge allocation (syndic and treasurer). Keys say how each category of
 * charges is shared between the lots — explicit coefficients, or equal parts
 * when the key says so, with explicit exclusions. A calculation is previewed,
 * reviewed (errors must be fixed), then confirmed: it is stored with its
 * inputs and issues the calls for funds. Nothing here is inferred.
 */
export default function RepartitionScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "treasurer", "president", "secretary", "committee_member"]}>
      <Inner />
    </RoleGuard>
  );
}

type Issue = { code: string; message: string };
type Lot = { id: string; number: string; archivedAt?: string | null };
const fmt = (v: string | number) => `${Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
const newKey = () => `alc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const CHARGE_TYPES = [
  { key: "charges_courantes", label: "Charges courantes" },
  { key: "fonds_reserve", label: "Fonds de réserve" },
  { key: "appel_special", label: "Appel spécial" },
];

function Issues({ errors, warnings }: { errors?: Issue[]; warnings?: Issue[] }) {
  if (!errors?.length && !warnings?.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {(errors ?? []).map((e, i) => (
        <Text key={`e${i}`} style={{ color: "#ef4444", fontSize: 13 }}>✕ {e.message}</Text>
      ))}
      {(warnings ?? []).map((w, i) => (
        <Text key={`w${i}`} style={{ color: "#b45309", fontSize: 13 }}>⚠ {w.message}</Text>
      ))}
    </View>
  );
}

// ─── Key form (new key or new version) ────────────────────────────────────────

function KeySheet({ visible, buildingId, lots, base, onClose, onDone }: { visible: boolean; buildingId: string; lots: Lot[]; base: any | null; onClose: () => void; onDone: () => void }) {
  const colors = useColors();
  const isVersion = !!base;
  const [f, setF] = useState({ code: "", name: "", purpose: "", method: "shares", categories: "", effectiveFrom: "", sourceReference: "", changeReason: "" });
  const [rows, setRows] = useState<Record<string, { coefficient: string; excluded: boolean; reason: string }>>({});
  const [issues, setIssues] = useState<{ errors?: Issue[]; warnings?: Issue[] }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const v = base?.versions?.[0];
    setF({ code: base?.code ?? "", name: base?.name ?? "", purpose: base?.purpose ?? "", method: v?.method ?? "shares", categories: (v?.categories ?? []).join(", "), effectiveFrom: "", sourceReference: v?.sourceReference ?? "", changeReason: "" });
    const init: Record<string, { coefficient: string; excluded: boolean; reason: string }> = {};
    // Start from the current version's values; a new lot starts EMPTY (no default).
    for (const l of lots.filter((x) => !x.archivedAt)) {
      const s = v?.shares?.find((x: any) => x.lotId === l.id);
      init[l.id] = { coefficient: s?.coefficient ? String(Number(s.coefficient)) : "", excluded: !!s?.excluded, reason: s?.exclusionReason ?? "" };
    }
    setRows(init);
    setIssues({});
  }, [visible, base, lots]);
  const submit = async (acknowledgeFinalized = false) => {
    setBusy(true);
    setIssues({});
    const body: any = {
      method: f.method,
      categories: f.categories.split(",").map((c) => c.trim()).filter(Boolean),
      effectiveFrom: f.effectiveFrom.trim(),
      sourceReference: f.sourceReference.trim(),
      shares: Object.entries(rows).map(([lotId, r]) =>
        r.excluded ? { lotId, excluded: true, exclusionReason: r.reason.trim() || undefined } : { lotId, ...(r.coefficient.trim() ? { coefficient: r.coefficient.trim().replace(",", ".") } : f.method === "equal" ? {} : {}) },
      ),
    };
    try {
      if (isVersion) {
        const res = await apiRequest<any>(`/allocation-keys/${base.id}/versions`, "POST", { ...body, changeReason: f.changeReason.trim(), acknowledgeFinalized });
        if (res.toCorrect?.length) Alert.alert("Répartitions à corriger", `Non recalculées : ${res.toCorrect.map((a: any) => `${a.reference} (${a.period})`).join(", ")}. Corrigez-les depuis l'historique si nécessaire.`);
      } else {
        await apiRequest("/allocation-keys", "POST", { ...body, buildingId, code: f.code.trim(), name: f.name.trim(), purpose: f.purpose.trim() || undefined });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      if (e?.code === "KEY_VERSION_IN_USE") {
        Alert.alert("Répartitions déjà finalisées", `${e.message}\n\n${(e.body?.affected ?? []).map((a: any) => `${a.reference} (${a.period})`).join("\n")}`, [
          { text: "Annuler", style: "cancel" },
          { text: "Confirmer la nouvelle version", onPress: () => submit(true) },
        ]);
      } else {
        setIssues({ errors: e?.body?.errors ?? [{ code: e?.code ?? "ERR", message: e?.message ?? "Erreur" }], warnings: e?.body?.warnings });
      }
    } finally {
      setBusy(false);
    }
  };
  const input = [formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }];
  return (
    <FormSheet visible={visible} title={isVersion ? `Nouvelle version — ${base?.code}` : "Nouvelle clé de répartition"} onClose={onClose} closeLabel="Fermer">
      {!isVersion && (
        <>
          <FieldLabel label="Code (ex. GEN, ASC) *" />
          <TextInput value={f.code} onChangeText={(v) => setF((p) => ({ ...p, code: v }))} style={input} autoCapitalize="characters" />
          <FieldLabel label="Nom *" />
          <TextInput value={f.name} onChangeText={(v) => setF((p) => ({ ...p, name: v }))} style={input} />
          <FieldLabel label="Objet" />
          <TextInput value={f.purpose} onChangeText={(v) => setF((p) => ({ ...p, purpose: v }))} style={input} />
        </>
      )}
      <FieldLabel label="Méthode" />
      <ChoiceChips value={f.method} onChange={(v) => setF((p) => ({ ...p, method: v }))} options={[{ key: "shares", label: "Coefficients par lot" }, { key: "equal", label: "Parts égales (lots listés)" }]} />
      <FieldLabel label="Catégories de charges couvertes (séparées par des virgules) *" />
      <TextInput value={f.categories} onChangeText={(v) => setF((p) => ({ ...p, categories: v }))} style={input} autoCapitalize="none" placeholder="entretien_general, eau" placeholderTextColor={colors.mutedForeground} />
      <FieldLabel label="En vigueur à partir du (AAAA-MM-JJ) *" />
      <TextInput value={f.effectiveFrom} onChangeText={(v) => setF((p) => ({ ...p, effectiveFrom: v }))} style={input} placeholder="2026-01-01" placeholderTextColor={colors.mutedForeground} />
      <FieldLabel label="Source de la règle (règlement, décision d'AG…) *" />
      <TextInput value={f.sourceReference} onChangeText={(v) => setF((p) => ({ ...p, sourceReference: v }))} style={input} />
      {isVersion && (
        <>
          <FieldLabel label="Raison du changement *" />
          <TextInput value={f.changeReason} onChangeText={(v) => setF((p) => ({ ...p, changeReason: v }))} style={input} />
        </>
      )}
      <Text style={[styles.section, { color: colors.mutedForeground }]}>Lots ({Object.keys(rows).length}) — chaque lot : un coefficient ou une exclusion motivée</Text>
      {lots
        .filter((l) => !l.archivedAt)
        .map((l) => {
          const r = rows[l.id] ?? { coefficient: "", excluded: false, reason: "" };
          return (
            <View key={l.id} style={[styles.lotRow, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, width: 70, fontFamily: "Inter_600SemiBold" }}>{l.number}</Text>
              {r.excluded ? (
                <TextInput value={r.reason} onChangeText={(v) => setRows((p) => ({ ...p, [l.id]: { ...r, reason: v } }))} placeholder="Motif de l'exclusion *" placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 1 }]} />
              ) : f.method === "equal" ? (
                <Text style={{ color: colors.mutedForeground, flex: 1 }}>part égale</Text>
              ) : (
                <TextInput value={r.coefficient} onChangeText={(v) => setRows((p) => ({ ...p, [l.id]: { ...r, coefficient: v } }))} keyboardType="decimal-pad" placeholder="coefficient" placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 1 }]} />
              )}
              <TouchableOpacity onPress={() => setRows((p) => ({ ...p, [l.id]: { ...r, excluded: !r.excluded } }))} accessibilityRole="checkbox" accessibilityState={{ checked: r.excluded }}>
                <Text style={{ color: r.excluded ? "#ef4444" : colors.primary, fontSize: 12 }}>{r.excluded ? "Exclu" : "Exclure"}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      <Issues {...issues} />
      <ActionButton label="Enregistrer" icon="check" busy={busy} onPress={() => submit(false)} />
    </FormSheet>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

function Inner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isSyndic = user?.role === "syndicate_admin";
  const canCompute = isSyndic || user?.role === "treasurer";
  const [tab, setTab] = useState<"keys" | "compute" | "history">("keys");
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [keyDetail, setKeyDetail] = useState<Record<string, any>>({});
  const [allocs, setAllocs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [keySheet, setKeySheet] = useState<{ base: any | null } | null>(null);
  // Calculation form
  const [period, setPeriod] = useState("");
  const [chargeType, setChargeType] = useState("charges_courantes");
  const [picked, setPicked] = useState<Record<string, any>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmKey = useRef(newKey());

  useEffect(() => {
    apiRequest<{ data: any[] }>("/buildings")
      .then((r) => {
        setBuildings((r.data ?? []).map((b) => ({ id: b.id, name: b.name })));
        if (r.data?.[0]) setBuildingId(r.data[0].id);
      })
      .catch(() => setLoadErr(true));
  }, []);
  const load = useCallback(async () => {
    if (!buildingId) return;
    setLoadErr(false);
    try {
      const [k, l, a, e, b] = await Promise.all([
        apiRequest<{ data: any[] }>(`/allocation-keys?buildingId=${buildingId}`),
        apiRequest<{ data: any[] }>(`/lots?buildingId=${buildingId}&limit=200&archived=true`).catch(() => apiRequest<{ data: any[] }>(`/lots?buildingId=${buildingId}&limit=200`)),
        apiRequest<{ data: any[] }>(`/allocations?buildingId=${buildingId}`),
        canCompute ? apiRequest<{ data: any[] }>(`/expenses?limit=200`) : Promise.resolve({ data: [] }),
        canCompute ? apiRequest<{ data: any[] }>(`/budgets?buildingId=${buildingId}`) : Promise.resolve({ data: [] }),
      ]);
      setKeys(k.data ?? []);
      setLots((l.data ?? []).map((x) => ({ id: x.id, number: x.number, archivedAt: x.archivedAt })));
      setAllocs(a.data ?? []);
      setExpenses((e.data ?? []).filter((x) => x.buildingId === buildingId && ["approved", "paid"].includes(x.status)));
      setBudgets((b.data ?? []).filter((x) => x.status === "approved"));
      const details: Record<string, any> = {};
      for (const key of k.data ?? []) details[key.id] = (await apiRequest<{ data: any }>(`/allocation-keys/${key.id}`)).data;
      setKeyDetail(details);
    } catch {
      setLoadErr(true);
    }
  }, [buildingId, canCompute]);
  useEffect(() => {
    load();
  }, [load]);

  const sources = Object.values(picked);
  const runBody = () => ({ buildingId, period: period.trim(), chargeType, sources });
  const doPreview = async () => {
    setBusy(true);
    try {
      const r = await apiRequest<{ data: any }>("/allocations/preview", "POST", runBody());
      setPreview(r.data);
      confirmKey.current = newKey();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Prévisualisation impossible");
    } finally {
      setBusy(false);
    }
  };
  const doConfirm = async () => {
    if (!preview?.valid) return;
    setBusy(true);
    try {
      const r = await apiRequest<any>("/allocations", "POST", { ...runBody(), previewHash: preview.inputsHash }, undefined, { "Idempotency-Key": confirmKey.current });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Répartition confirmée", `${r.data?.reference} — ${r.calls ?? 0} appel(s) de fonds émis.`);
      setPreview(null);
      setPicked({});
      await load();
      setTab("history");
    } catch (e: any) {
      // A changed calculation comes back as a new preview to review.
      if (e?.code === "PREVIEW_STALE" || e?.code === "ALLOCATION_INVALID") setPreview(e.body?.preview ?? null);
      Alert.alert("Non confirmée", e?.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };
  // The reason is always typed by the syndic (no default text).
  const [ending, setEnding] = useState<{ a: any; action: "correct" | "reverse" } | null>(null);
  const [endReason, setEndReason] = useState("");
  const endAllocation = (a: any, action: "correct" | "reverse") => {
    setEndReason("");
    setEnding({ a, action });
  };
  const runEnd = async (a: any, action: "correct" | "reverse", reason: string) => {
    if (reason.trim().length < 5) return Alert.alert("Motif requis", "5 caractères minimum.");
    setBusy(true);
    try {
      if (action === "reverse") {
        const r = await apiRequest<any>(`/allocations/${a.id}/reverse`, "POST", { reason });
        Alert.alert("Répartition annulée", `${r.cancelledCalls} appel(s) annulé(s).`);
      } else {
        const p = await apiRequest<any>(`/allocations/${a.id}/correct`, "POST", { reason });
        const pv = p.data?.preview;
        if (!pv?.valid) {
          Alert.alert("Correction impossible", (pv?.errors ?? []).map((x: Issue) => x.message).join("\n") || "Calcul invalide");
        } else {
          const r = await apiRequest<any>(`/allocations/${a.id}/correct`, "POST", { reason, previewHash: pv.inputsHash });
          Alert.alert("Répartition corrigée", `${a.reference} → ${r.data?.correction?.reference} : ${r.data?.cancelledCalls} appel(s) annulé(s), ${r.data?.calls} émis.`);
        }
      }
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Répartition des charges" />
      <View style={{ padding: 16, gap: 8 }}>
        {buildings.length > 1 && <ChoiceChips value={buildingId} onChange={setBuildingId} options={buildings.map((b) => ({ key: b.id, label: b.name }))} />}
        <ChoiceChips value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ key: "keys", label: "Clés" }, ...(canCompute ? [{ key: "compute", label: "Calcul" }] : []), { key: "history", label: "Historique" }]} />
      </View>
      {loadErr ? (
        <ErrorState title="Impossible de charger la répartition." description="" retryLabel="Réessayer" onRetry={load} accentColor={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, paddingBottom: insets.bottom + 40 }}>
          {tab === "keys" && (
            <>
              {isSyndic && <ActionButton label="Nouvelle clé" icon="plus" onPress={() => setKeySheet({ base: null })} />}
              {keys.length === 0 ? <Text style={{ color: colors.mutedForeground }}>Aucune clé : sans clé, aucune charge ne peut être répartie (hors appels du budget global par tantièmes).</Text> : null}
              {keys.map((k) => {
                const d = keyDetail[k.id];
                const v = d?.versions?.[0];
                return (
                  <View key={k.id} style={[styles.card, card]}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{k.code} — {k.name}{k.status === "archived" ? " (archivée)" : ""}</Text>
                    {v ? (
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        v{v.version} · {v.method === "equal" ? "parts égales" : "coefficients"} · {v.categories.join(", ")} · dès {v.effectiveFrom}{v.effectiveTo ? ` jusqu'au ${v.effectiveTo}` : ""}
                      </Text>
                    ) : null}
                    {v ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>Source : {v.sourceReference}</Text> : null}
                    {v?.shares?.map((s: any) => (
                      <Text key={s.id} style={[styles.meta, { color: colors.foreground }]}>
                        {s.lotNumber} : {s.excluded ? `exclu — ${s.exclusionReason}` : Number(s.coefficient)}
                      </Text>
                    ))}
                    <Issues errors={d?.validation?.errors} warnings={d?.validation?.warnings} />
                    {isSyndic && k.status === "active" ? <ActionButton label="Nouvelle version" icon="git-branch" color="#64748b" onPress={() => setKeySheet({ base: d })} /> : null}
                  </View>
                );
              })}
            </>
          )}

          {tab === "compute" && canCompute && (
            <>
              <FieldLabel label="Période (AAAA, AAAA-T1… ou AAAA-MM) *" />
              <TextInput value={period} onChangeText={(v) => { setPeriod(v); setPreview(null); }} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="2026-Q1" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
              <FieldLabel label="Type d'appel" />
              <ChoiceChips value={chargeType} onChange={(v) => { setChargeType(v); setPreview(null); }} options={CHARGE_TYPES} />
              <Text style={[styles.section, { color: colors.mutedForeground }]}>Dépenses approuvées ou payées</Text>
              {expenses.length === 0 ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>Aucune.</Text> : null}
              {expenses.map((e) => {
                const k = `expense:${e.id}`;
                return (
                  <TouchableOpacity key={e.id} onPress={() => { setPreview(null); setPicked((p) => { const n = { ...p }; if (n[k]) delete n[k]; else n[k] = { type: "expense", id: e.id }; return n; }); }} style={styles.pick}>
                    <Feather name={picked[k] ? "check-square" : "square"} size={16} color={colors.primary} />
                    <Text style={{ color: colors.foreground, flex: 1 }}>{e.reference} — {e.label} · {e.category} · {fmt(e.amount)}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={[styles.section, { color: colors.mutedForeground }]}>Lignes des budgets approuvés</Text>
              {budgets.flatMap((b) =>
                (b.lines ?? []).map((l: any) => {
                  const k = `line:${l.id}`;
                  return (
                    <TouchableOpacity key={l.id} onPress={() => { setPreview(null); setPicked((p) => { const n = { ...p }; if (n[k]) delete n[k]; else n[k] = { type: "budget_line", id: l.id }; return n; }); }} style={styles.pick}>
                      <Feather name={picked[k] ? "check-square" : "square"} size={16} color={colors.primary} />
                      <Text style={{ color: colors.foreground, flex: 1 }}>{b.year} · {l.label} · {l.category} · {fmt(l.amountAnnual)} / an</Text>
                    </TouchableOpacity>
                  );
                }),
              )}
              <ActionButton label="Prévisualiser" icon="eye" busy={busy} disabled={!period.trim() || sources.length === 0} onPress={doPreview} />
              {preview && (
                <View style={[styles.card, card, { gap: 6 }]}>
                  <Issues errors={preview.errors} warnings={preview.warnings} />
                  {preview.sources.map((s: any) => (
                    <View key={s.id} style={{ gap: 2 }}>
                      <Text style={[styles.name, { color: colors.foreground }]}>{s.label} — {fmt(s.amount)}</Text>
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{s.amountNote} · clé {s.key?.code} v{s.key?.version} ({s.key?.sourceReference})</Text>
                      {s.lines.map((l: any) => (
                        <Text key={l.lotId} style={[styles.meta, { color: colors.foreground }]}>{l.lotNumber} : {l.explanation}</Text>
                      ))}
                    </View>
                  ))}
                  {preview.excluded?.length ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>Exclus : {preview.excluded.map((e: any) => `${e.lotNumber} (${e.reason})`).join(" · ")}</Text> : null}
                  <Text style={[styles.section, { color: colors.mutedForeground }]}>Total par lot</Text>
                  {preview.perLot.map((l: any) => (
                    <Text key={l.lotId} style={{ color: colors.foreground }}>{l.lotNumber} : {fmt(l.amount)}</Text>
                  ))}
                  <Text style={{ color: preview.totals.reconciled ? "#10b981" : "#ef4444", fontFamily: "Inter_600SemiBold" }}>
                    Sources {fmt(preview.totals.source)} · réparti {fmt(preview.totals.allocated)} {preview.totals.reconciled ? "✓" : "✕"}
                  </Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>{preview.roundingRule}</Text>
                  <ActionButton label="Confirmer et émettre les appels" icon="check-circle" color="#0f766e" busy={busy} disabled={!preview.valid} onPress={doConfirm} />
                </View>
              )}
            </>
          )}

          {tab === "history" && (
            <>
              {allocs.length === 0 ? <Text style={{ color: colors.mutedForeground }}>Aucune répartition.</Text> : null}
              {allocs.map((a) => (
                <View key={a.id} style={[styles.card, card]}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{a.reference} · {a.period} · {CHARGE_TYPES.find((c) => c.key === a.chargeType)?.label ?? a.chargeType}</Text>
                  <Text style={[styles.meta, { color: a.status === "finalized" ? "#10b981" : "#64748b" }]}>
                    {fmt(a.totalAmount)} · {a.status === "finalized" ? "en vigueur" : a.status === "corrected" ? `corrigée — ${a.endReason}` : `annulée — ${a.endReason}`}
                    {a.correctionOf ? ` · corrige une répartition antérieure (${a.correctionReason})` : ""}
                  </Text>
                  {isSyndic && a.status === "finalized" ? (
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton label="Corriger" icon="edit-3" color="#64748b" busy={busy} onPress={() => endAllocation(a, "correct")} />
                      <ActionButton label="Annuler" icon="x-circle" color="#ef4444" busy={busy} onPress={() => endAllocation(a, "reverse")} />
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
      <FormSheet visible={!!ending} title={ending ? `${ending.action === "correct" ? "Corriger" : "Annuler"} ${ending.a.reference}` : ""} onClose={() => setEnding(null)} closeLabel="Fermer">
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
          {ending?.action === "correct"
            ? "La répartition actuelle est conservée (statut « corrigée ») et ses appels non payés sont annulés ; un nouveau calcul avec les clés en vigueur les remplace."
            : "Les appels de fonds de cette répartition sont annulés (s'ils n'ont reçu aucun paiement). Rien n'est supprimé."}
        </Text>
        <FieldLabel label="Motif *" />
        <TextInput value={endReason} onChangeText={setEndReason} multiline style={[formStyles.input, { minHeight: 70, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} />
        <ActionButton
          label="Confirmer"
          color={ending?.action === "reverse" ? "#ef4444" : undefined}
          busy={busy}
          disabled={endReason.trim().length < 5}
          onPress={() => {
            const e = ending!;
            setEnding(null);
            runEnd(e.a, e.action, endReason.trim());
          }}
        />
      </FormSheet>
      <KeySheet visible={!!keySheet} buildingId={buildingId} lots={lots} base={keySheet?.base ?? null} onClose={() => setKeySheet(null)} onDone={() => { setKeySheet(null); load(); }} />
      {busy && tab !== "compute" ? <ActivityIndicator style={{ position: "absolute", top: "50%", alignSelf: "center" }} color={colors.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", marginTop: 8 },
  lotRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  pick: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
});
