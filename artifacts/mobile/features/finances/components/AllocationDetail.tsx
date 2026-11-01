import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { useLanguage } from "@/context/LanguageContext";
import { StatusBadge } from "@/components/ui";
import { TYPE } from "@/constants/typography";
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

export default function AllocationDetail({ appelId, onClose }: { appelId: string | null; onClose: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  const { money } = useFormat();
  const fmt = (v: string) => money(v);
  const [data, setData] = useState<Detail | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!appelId) return;
    setData(undefined);
    setErr(null);
    apiRequest<{ data: Detail | null; message?: string }>(`/appels-de-fonds/${appelId}/allocation`)
      .then((r) => {
        setData(r.data);
        if (!r.data) setErr(r.message ?? t("uiNoCalcDetail"));
      })
      .catch((e: any) => setErr(e?.message ?? t("uiCalcLoadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appelId]);
  return (
    <FormSheet visible={!!appelId} title={t("uiCalcDetail")} onClose={onClose}>
      {err ? (
        <Text style={[TYPE.body, { color: colors.textMuted }]}>{err}</Text>
      ) : data === undefined ? (
        <ActivityIndicator color={colors.primary} />
      ) : data ? (
        <>
          <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>
            {data.reference} · {data.period} · {fmt(data.callAmount)}
          </Text>
          {data.status !== "finalized" ? <StatusBadge size="md" tone="warning" icon="alert-triangle" label={data.status === "corrected" ? t("uiAllocCorrected") : t("uiAllocReversed")} /> : null}
          {data.lines.map((l, i) => (
            <View key={i} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 4, backgroundColor: colors.card }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{l.source}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {l.key
                  ? t("uiKeyLine").replace("{code}", l.key.code).replace("{name}", l.key.name).replace("{v}", String(l.key.version)).replace("{method}", l.key.method === "equal" ? t("uiEqualParts") : t("uiCoefficients"))
                  : t("uiKeyTantiemes")}
              </Text>
              {l.key?.sourceReference ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{t("uiSourceRef").replace("{s}", l.key.sourceReference)}</Text> : null}
              <Text style={{ color: colors.foreground, fontSize: 13 }}>{l.explanation}</Text>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {t("uiYourShare").replace("{a}", fmt(l.amount))}
                {Number(l.roundingAdjustment) ? t("uiRoundingPart").replace("{a}", fmt(l.roundingAdjustment)) : ""}
              </Text>
            </View>
          ))}
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{data.roundingRule}</Text>
        </>
      ) : null}
    </FormSheet>
  );
}
