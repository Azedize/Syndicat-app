import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { FormSheet } from "@/components/FormSheet";

/**
 * How a call for funds was computed: each source (expense or budget line),
 * the key and its version, the coefficient of the lot, the total of the
 * coefficients, the amount and the rounding adjustment — read from the
 * persisted allocation, the same record that issued the call.
 */
type Detail = {
  reference: string;
  status: string;
  period: string;
  callAmount: string;
  roundingRule: string;
  lines: { source: string; sourceAmount: string; key: { code: string; name: string; version: number; method: string; sourceReference: string } | null; coefficient: string; denominator: string; amount: string; roundingAdjustment: string; explanation: string }[];
};

const fmt = (v: string) => `${Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;

export default function AllocationDetail({ appelId, onClose }: { appelId: string | null; onClose: () => void }) {
  const colors = useColors();
  const [data, setData] = useState<Detail | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!appelId) return;
    setData(undefined);
    setErr(null);
    apiRequest<{ data: Detail | null; message?: string }>(`/appels-de-fonds/${appelId}/allocation`)
      .then((r) => {
        setData(r.data);
        if (!r.data) setErr(r.message ?? "Pas de détail de calcul pour cet appel.");
      })
      .catch((e: any) => setErr(e?.message ?? "Impossible de charger le détail."));
  }, [appelId]);
  return (
    <FormSheet visible={!!appelId} title="Détail du calcul" onClose={onClose} closeLabel="Fermer">
      {err ? (
        <Text style={{ color: colors.mutedForeground }}>{err}</Text>
      ) : data === undefined ? (
        <ActivityIndicator color={colors.primary} />
      ) : data ? (
        <>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            {data.reference} · {data.period} · {fmt(data.callAmount)}
          </Text>
          {data.status !== "finalized" ? <Text style={{ color: "#f59e0b" }}>Cette répartition a été {data.status === "corrected" ? "corrigée" : "annulée"}.</Text> : null}
          {data.lines.map((l, i) => (
            <View key={i} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, gap: 3, backgroundColor: colors.card }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{l.source}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {l.key ? `Clé ${l.key.code} — ${l.key.name} (v${l.key.version}, ${l.key.method === "equal" ? "parts égales" : "coefficients"})` : "Clé : tantièmes des lots"}
              </Text>
              {l.key?.sourceReference ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Source : {l.key.sourceReference}</Text> : null}
              <Text style={{ color: colors.foreground, fontSize: 13 }}>{l.explanation}</Text>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Votre part : {fmt(l.amount)}
                {Number(l.roundingAdjustment) ? ` (dont ${fmt(l.roundingAdjustment)} d'arrondi)` : ""}
              </Text>
            </View>
          ))}
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{data.roundingRule}</Text>
        </>
      ) : null}
    </FormSheet>
  );
}
