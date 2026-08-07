/**
 * SignatureOrderPanel — Displays signing order progress for a document.
 *
 * Shows:
 *  - All required signers in their canonical order
 *  - Which signers have completed their signature (green / timestamp)
 *  - Who is next in the chain
 *  - A progress bar
 *  - "Sign now" CTA if it's the viewing user's turn
 *
 * Used inside the document detail view.
 */

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequiredSigner {
  order: number;
  role: string;
  label: string;
}

interface CompletedSig {
  id: string;
  signedBy: string;
  signerName: string | null;
  signerRole: string | null;
  signedAt: string | null;
  signatureOrder: number | null;
  isValid: boolean | null;
}

interface SignersData {
  documentId: string;
  title: string;
  status: string;
  requiredSigners: RequiredSigner[];
  completedSignatures: CompletedSig[];
  nextSigner: RequiredSigner | null;
  isMyTurn: boolean;
  allSigned: boolean;
  totalRequired: number;
  totalCompleted: number;
  percentage: number;
}

interface Props {
  documentId: string;
  onSignPress?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignatureOrderPanel({ documentId, onSignPress }: Props) {
  const colors = useColors();
  const { t, lang } = useLanguage();
  const [data,    setData]    = useState<SignersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const loadSigners = async () => {
    if (!documentId) return;
    setLoading(true);
    setError(false);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.signers(documentId);
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!documentId) return;
    void loadSigners();
  }, [documentId]);

  const s = makeStyles(colors);

  if (loading) {
    return (
      <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={{ alignItems: "center", gap: 8, padding: 16 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.signerMeta, { color: colors.mutedForeground }]}>{t("signatureLoading")}</Text>
        </View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 10 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="alert-circle" size={16} color="#ef4444" />
          <Text style={[s.signerLabel, { color: colors.foreground, flex: 1 }]}>{t("signatureLoadError")}</Text>
        </View>
        <Text style={[s.signerMeta, { color: colors.mutedForeground }]}>{t("signatureLoadErrorDescription")}</Text>
        <TouchableOpacity
          style={[s.retryBtn, { borderColor: colors.border }]}
          onPress={() => void loadSigners()}
          activeOpacity={0.8}
        >
          <Feather name="refresh-cw" size={13} color={colors.primary} />
          <Text style={[s.retryBtnText, { color: colors.primary }]}>{t("signatureRetry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If no required signers defined, show completed signatures only (free-form signing)
  const hasOrder = data.requiredSigners.length > 0;

  // Map completedSignatures by signatureOrder for quick lookup
  const completedByOrder = new Map<number, CompletedSig>(
    data.completedSignatures
      .filter((s) => s.signatureOrder != null)
      .map((s) => [s.signatureOrder!, s]),
  );

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      const locale = ({ fr: "fr-MA", en: "en-US", ar: "ar-MA", es: "es-ES" } as const)[lang];
      return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };
  const translateRole = (value: string | null | undefined) => {
    if (!value) return "—";
    const normalized = value.toLowerCase().trim();
    const roleKeys: Record<string, string> = {
      president: "signatureRolePresident",
      président: "signatureRolePresident",
      "syndic administrator": "signatureRoleSyndic",
      "administrateur syndic": "signatureRoleSyndic",
      syndic: "signatureRoleSyndic",
      treasurer: "signatureRoleTreasurer",
      trésorier: "signatureRoleTreasurer",
      secretary: "signatureRoleSecretary",
      secrétaire: "signatureRoleSecretary",
      member: "signatureRoleMember",
      membre: "signatureRoleMember",
      tenant: "signatureRoleTenant",
      locataire: "signatureRoleTenant",
    };
    return roleKeys[normalized] ? t(roleKeys[normalized]) : value;
  };

  return (
    <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={[s.iconWrap, { backgroundColor: "#6366f115" }]}>
          <Feather name="pen-tool" size={14} color="#6366f1" />
        </View>
        <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("signatureTitle")}</Text>
        <View style={[s.badge, {
          backgroundColor: data.allSigned ? "#10b98115" : data.totalCompleted > 0 ? "#f59e0b15" : colors.muted,
        }]}>
          <Text style={[s.badgeText, {
            color: data.allSigned ? "#10b981" : data.totalCompleted > 0 ? "#f59e0b" : colors.mutedForeground,
          }]}>
            {data.totalCompleted}/{data.totalRequired || data.totalCompleted}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      {hasOrder && (
        <View style={s.progressWrap}>
          <View style={[s.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={[s.progressFill, {
              width: `${data.percentage}%` as any,
              backgroundColor: data.allSigned ? "#10b981" : colors.primary,
            }]} />
          </View>
          <Text style={[s.progressText, { color: colors.mutedForeground }]}>{data.percentage}%</Text>
        </View>
      )}

      {/* Signing steps */}
      {hasOrder ? (
        <View style={{ gap: 1 }}>
          {data.requiredSigners.map((req, idx) => {
            const done = completedByOrder.get(req.order);
            const isNext = data.nextSigner?.order === req.order;
            const isLast = idx === data.requiredSigners.length - 1;

            return (
              <View key={req.order} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                {/* Timeline connector */}
                <View style={{ alignItems: "center", width: 32 }}>
                  <View style={[s.stepDot, {
                    backgroundColor: done ? "#10b981" : isNext ? colors.primary : colors.muted,
                    borderColor:     done ? "#10b981" : isNext ? colors.primary : colors.border,
                  }]}>
                    {done
                      ? <Feather name="check" size={12} color="#fff" />
                      : isNext
                        ? <Feather name="clock" size={10} color="#fff" />
                        : <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: "700" }}>{req.order}</Text>
                    }
                  </View>
                  {!isLast && (
                    <View style={[s.connector, { backgroundColor: done ? "#10b981" : colors.border }]} />
                  )}
                </View>

                {/* Signer info */}
                <View style={{ flex: 1, paddingTop: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={[s.signerLabel, { color: done ? colors.foreground : isNext ? colors.foreground : colors.mutedForeground }]}>
                      {translateRole(req.label)}
                    </Text>
                    {done && (
                      <View style={[s.chip, { backgroundColor: "#10b98115" }]}>
                        <Text style={[s.chipText, { color: "#10b981" }]}>{t("signatureSigned")}</Text>
                      </View>
                    )}
                    {isNext && !done && (
                      <View style={[s.chip, { backgroundColor: colors.primary + "15" }]}>
                        <Text style={[s.chipText, { color: colors.primary }]}>{t("signaturePending")}</Text>
                      </View>
                    )}
                    {!done && !isNext && (
                      <View style={[s.chip, { backgroundColor: colors.muted }]}>
                        <Text style={[s.chipText, { color: colors.mutedForeground }]}>{t("signatureNext")}</Text>
                      </View>
                    )}
                  </View>
                  {done && (
                    <Text style={[s.signerMeta, { color: colors.mutedForeground }]}>
                      {done.signerName ?? "—"} · {fmtDate(done.signedAt)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        // Free-form mode: just list completed signatures
        <View style={{ gap: 1 }}>
          {data.completedSignatures.length === 0 ? (
            <View style={{ padding: 14, alignItems: "center", gap: 6 }}>
              <Feather name="pen-tool" size={24} color={colors.mutedForeground} />
              <Text style={[s.signerMeta, { color: colors.mutedForeground, textAlign: "center" }]}>
                 {t("signatureNoneRecorded")}
              </Text>
            </View>
          ) : (
            data.completedSignatures.map((sig) => (
              <View key={sig.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                <View style={[s.stepDot, { backgroundColor: sig.isValid ? "#10b981" : "#ef4444", borderColor: sig.isValid ? "#10b981" : "#ef4444" }]}>
                  <Feather name={sig.isValid ? "check" : "x"} size={12} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.signerLabel, { color: colors.foreground }]}>{sig.signerName ?? "—"}</Text>
                  <Text style={[s.signerMeta, { color: colors.mutedForeground }]}>
                    {translateRole(sig.signerRole)} · {fmtDate(sig.signedAt)}
                  </Text>
                </View>
                {sig.isValid === false && (
                  <View style={[s.chip, { backgroundColor: "#ef444415" }]}>
                    <Text style={[s.chipText, { color: "#ef4444" }]}>{t("signatureInvalid")}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* CTA: sign now if it's my turn */}
      {data.isMyTurn && !data.allSigned && onSignPress && (
        <View style={[s.ctaRow, { borderTopColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.signerLabel, { color: colors.foreground }]}>{t("signatureYourTurn")}</Text>
            <Text style={[s.signerMeta, { color: colors.mutedForeground }]}>
              {t("signatureExpectedRole")}: {translateRole(data.nextSigner?.label)}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: colors.primary }]}
            onPress={onSignPress}
            activeOpacity={0.85}
          >
            <Feather name="pen-tool" size={14} color="#fff" />
             <Text style={[s.ctaBtnText]}>{t("signatureSign")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* All signed indicator */}
      {data.allSigned && hasOrder && (
        <View style={[s.ctaRow, { borderTopColor: colors.border, backgroundColor: "#10b98108" }]}>
          <Feather name="check-circle" size={16} color="#10b981" />
          <Text style={{ fontSize: 13, color: "#10b981", fontWeight: "700" }}>
             {t("signatureAllCollected")}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    card:         { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 2 },
    cardHeader:   { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    iconWrap:     { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    cardTitle:    { fontSize: 13, fontWeight: "700", flex: 1, textTransform: "uppercase", letterSpacing: 0.4 },
    badge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeText:    { fontSize: 11, fontWeight: "700" },
    progressWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
    progressTrack:{ flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: 5, borderRadius: 3 },
    progressText: { fontSize: 11, fontWeight: "700", width: 34, textAlign: "right" },
    stepDot:      { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    connector:    { width: 2, flex: 1, minHeight: 10, marginTop: 2 },
    signerLabel:  { fontSize: 13, fontWeight: "600" },
    signerMeta:   { fontSize: 11, marginTop: 2, lineHeight: 16 },
    chip:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    chipText:     { fontSize: 10, fontWeight: "700" },
    ctaRow:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: 1 },
    ctaBtn:       { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
    ctaBtnText:   { fontSize: 13, fontWeight: "700", color: "#fff" },
     retryBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
     retryBtnText:  { fontSize: 12, fontWeight: "700" },
  });
}
