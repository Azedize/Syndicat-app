/**
 * Guided creation of the condominium's organization (syndic administrator):
 *   1. profile of the residence (prefilled from the buildings and lots)
 *   2. template, with explained recommendations
 *   3. optional components
 *   4. default positions and what they allow
 *   5. leaders of the committees (optional)
 *   6. review → saved as a draft; activation is a separate, confirmed step
 * Templates and recommendations are suggestions: only the general assembly,
 * the syndic and the syndic adjoint are required by Loi 18-00.
 */
import { Feather } from "@/components/ui/Feather";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ScreenHeader from "@/components/ScreenHeader";
import RoleGuard from "@/components/RoleGuard";
import { LoadingState } from "@/components/DataState";
import { askChoice } from "@/components/ui/TextPrompt";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { organization as orgApi, type OrgRecommendation } from "@/features/governance/api";
import { CAPABILITY_KEYS, positionTitle, TYPE_KEYS } from "@/features/governance/orgLabels";

const OPTIONAL = ["financial", "maintenance", "security", "communication", "social", "environment", "legal", "audit", "parking", "building", "syndicate_council"];
const TEMPLATE_COMPONENTS: Record<string, string[]> = {
  small: [],
  medium: ["financial", "maintenance", "communication"],
  large: ["financial", "maintenance", "security", "communication", "environment", "parking"],
  custom: [],
};
type Profile = {
  buildings: string;
  floors: string;
  lots: string;
  residents: string;
  employees: string;
  elevators: string;
  professionalSyndic: boolean;
  hasDeputy: boolean;
  multiSyndicateComplex: boolean;
  securityStaff: boolean;
  maintenanceStaff: boolean;
  gardens: boolean;
  parking: boolean;
  pool: boolean;
};

export default function OrganizationWizard() {
  return (
    <RoleGuard allow={["syndicate_admin", "super_admin"]}>
      <Wizard />
    </RoleGuard>
  );
}

function Wizard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({ buildings: "", floors: "", lots: "", residents: "", employees: "0", elevators: "0", professionalSyndic: false, hasDeputy: true, multiSyndicateComplex: false, securityStaff: false, maintenanceStaff: false, gardens: false, parking: false, pool: false });
  const [template, setTemplate] = useState<string>("small");
  const [selected, setSelected] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<Record<string, { id: string; name: string }>>({});
  const [reco, setReco] = useState<{ template: string; items: OrgRecommendation[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const structure = useQuery({ queryKey: ["org-structure"], queryFn: () => orgApi.structure() });
  const catalog = useQuery({ queryKey: ["org-catalog"], queryFn: () => orgApi.catalog() });
  const facts = structure.data?.facts;
  useEffect(() => {
    if (facts) setProfile((p) => ({ ...p, buildings: p.buildings || String(facts.buildings), floors: p.floors || String(facts.floors), lots: p.lots || String(facts.lots), residents: p.residents || String(facts.residents) }));
  }, [facts]);

  const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined);
  const payload = useMemo(
    () => ({
      buildings: num(profile.buildings), floors: num(profile.floors), lots: num(profile.lots), residents: num(profile.residents), employees: num(profile.employees), elevators: num(profile.elevators),
      professionalSyndic: profile.professionalSyndic, hasDeputy: profile.hasDeputy, multiSyndicateComplex: profile.multiSyndicateComplex, securityStaff: profile.securityStaff,
      maintenanceStaff: profile.maintenanceStaff, gardens: profile.gardens, parking: profile.parking, pool: profile.pool,
    }),
    [profile],
  );

  const steps = [t("orgStepProfile"), t("orgStepTemplate"), t("orgStepComponents"), t("orgStepPositions"), t("orgStepMembers"), t("orgStepReview")];
  const next = async () => {
    if (step === 0) {
      try {
        const r = await orgApi.recommend(payload);
        setReco(r.data);
        setTemplate(r.data.template);
        setSelected(Array.from(new Set([...TEMPLATE_COMPONENTS[r.data.template], ...r.data.items.filter((i) => i.type === "syndicate_council").map((i) => i.type)])));
      } catch (err: any) {
        return showToast({ type: "error", message: err?.message || t("electionActionFailed") });
      }
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const chooseTemplate = (tpl: string) => {
    setTemplate(tpl);
    setSelected(TEMPLATE_COMPONENTS[tpl]);
  };
  const toggle = (type: string) => setSelected((s) => (s.includes(type) ? s.filter((x) => x !== type) : [...s, type]));
  const pickLeader = async (type: string) => {
    const people = (await orgApi.people()).data;
    const id = await askChoice({ title: t(TYPE_KEYS[type]), choices: people.map((p) => ({ label: p.name, value: p.id })) });
    const person = people.find((p) => p.id === id);
    if (person) setLeaders((l) => ({ ...l, [type]: { id: person.id, name: person.name } }));
  };

  const create = async (activate: boolean) => {
    setSaving(true);
    try {
      await orgApi.create(template, payload, selected);
      // Leaders chosen in step 5: assigned to each committee's leader position.
      const s = (await orgApi.structure()).data;
      for (const [type, person] of Object.entries(leaders)) {
        const c = s?.components.find((x) => x.type === type);
        const pos = c?.positions.find((p) => p.isLeader) ?? c?.positions[0];
        if (pos) await orgApi.assign(pos.id, person.id);
      }
      if (activate) await orgApi.activate(t("orgFirstActivationReason"));
      await queryClient.invalidateQueries({ queryKey: ["org-structure"] });
      showToast({ type: "success", title: t("orgStructureTitle"), message: activate ? t("orgActivated") : t("orgDraftSaved") });
      router.replace("/organization" as any);
    } catch (err: any) {
      showToast({ type: "error", title: t("orgStructureTitle"), message: err?.message || t("electionActionFailed") });
    } finally {
      setSaving(false);
    }
  };

  if (structure.isLoading) return <View style={[styles.root, { backgroundColor: colors.background }]}><ScreenHeader title={t("orgCreate")} /><LoadingState title={t("orgCreate")} /></View>;
  if (structure.data?.data) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("orgCreate")} />
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={[styles.body, { color: colors.foreground }]}>{t("orgAlreadyExists")}</Text>
          <Btn label={t("orgStructureTitle")} onPress={() => router.replace("/organization" as any)} colors={colors} />
        </View>
      </View>
    );
  }

  const positionsOf = (type: string) => catalog.data?.data.types.find((x) => x.type === type) as any;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("orgCreate")} />
      <View style={styles.progress} accessibilityLabel={`${step + 1} / ${steps.length}`}>
        {steps.map((label, i) => (
          <View key={label} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.muted }]} />
        ))}
      </View>
      <Text style={[styles.stepTitle, { color: colors.foreground }]} accessibilityRole="header">{step + 1}. {steps[step]}</Text>
      <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 120 }}>
        {step === 0 ? (
          <>
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgProfileHint")}</Text>
            {(["buildings", "floors", "lots", "residents", "employees", "elevators"] as const).map((k) => (
              <View key={k} style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>{t(`orgField_${k}`)}</Text>
                <TextInput
                  value={profile[k]}
                  onChangeText={(v) => setProfile((p) => ({ ...p, [k]: v.replace(/[^\d]/g, "") }))}
                  keyboardType="number-pad"
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? "right" : "left" }]}
                  accessibilityLabel={t(`orgField_${k}`)}
                />
              </View>
            ))}
            {(["professionalSyndic", "hasDeputy", "multiSyndicateComplex", "securityStaff", "maintenanceStaff", "gardens", "parking", "pool"] as const).map((k) => (
              <TouchableOpacity key={k} style={styles.toggle} onPress={() => setProfile((p) => ({ ...p, [k]: !p[k] }))} accessibilityRole="checkbox" accessibilityState={{ checked: profile[k] }}>
                <Feather name={profile[k] ? "check-square" : "square"} size={20} color={colors.primary} />
                <Text style={[styles.body, { color: colors.foreground, flex: 1 }]}>{t(`orgField_${k}`)}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {step === 1 ? (
          <>
            {(["small", "medium", "large", "custom"] as const).map((tpl) => (
              <TouchableOpacity key={tpl} style={[styles.card, { backgroundColor: colors.card, borderColor: template === tpl ? colors.primary : colors.border }]} onPress={() => chooseTemplate(tpl)} accessibilityRole="radio" accessibilityState={{ selected: template === tpl }}>
                <View style={styles.row}>
                  <Feather name={template === tpl ? "check-circle" : "circle"} size={18} color={template === tpl ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]}>{t(`orgTemplate_${tpl}`)}</Text>
                  {reco?.template === tpl ? <Text style={[styles.small, { color: colors.success }]}>{t("orgRecommended")}</Text> : null}
                </View>
                <Text style={[styles.small, { color: colors.mutedForeground }]}>{t(`orgTemplateHint_${tpl}`)}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.label, { color: colors.foreground }]}>{t("orgWhy")}</Text>
            {(reco?.items ?? []).map((i) => (
              <View key={i.type} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t(TYPE_KEYS[i.type])} · {i.strength === "statutory" ? t("orgTagLegal") : t("orgToConsider")}</Text>
                {i.reasons.map((r) => {
                  // translated by code; the server also sends the French text
                  const key = `orgReason_${r.code}`;
                  const label = t(key) === key ? r.text : t(key).replace("{n}", String(r.n ?? ""));
                  return <Text key={r.code} style={[styles.small, { color: colors.mutedForeground }]}>• {label}</Text>;
                })}
              </View>
            ))}
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgTemplatesDisclaimer")}</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgStatutoryAlways")}</Text>
            {OPTIONAL.map((type) => (
              <TouchableOpacity key={type} style={styles.toggle} onPress={() => toggle(type)} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(type) }}>
                <Feather name={selected.includes(type) ? "check-square" : "square"} size={20} color={colors.primary} />
                <Text style={[styles.body, { color: colors.foreground, flex: 1 }]}>{t(TYPE_KEYS[type])}</Text>
                {type === "syndicate_council" ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgTagConditional")}</Text> : null}
              </TouchableOpacity>
            ))}
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgCustomLater")}</Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgPositionsHint")}</Text>
            {selected.length === 0 ? <Text style={[styles.body, { color: colors.foreground }]}>{t("orgNoCommittee")}</Text> : null}
            {selected.map((type) => (
              <View key={type} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t(TYPE_KEYS[type])}</Text>
                {(positionsOf(type)?.positions ?? []).map((p: any) => (
                  <Text key={p.title} style={[styles.small, { color: colors.foreground }]}>
                    {p.isLeader ? "★ " : "• "}{positionTitle(t, p.title)} — {p.permissions.map((x: string) => t(CAPABILITY_KEYS[x] ?? x)).join(" · ")}
                  </Text>
                ))}
              </View>
            ))}
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgNoLegalPower")}</Text>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgMembersHint")}</Text>
            {selected.map((type) => (
              <TouchableOpacity key={type} style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => void pickLeader(type)} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t(TYPE_KEYS[type])}</Text>
                  <Text style={[styles.small, { color: leaders[type] ? colors.foreground : colors.mutedForeground }]}>{leaders[type]?.name ?? t("orgChooseLeader")}</Text>
                </View>
                <Feather name="user-plus" size={18} color={colors.tint} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {step === 5 ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary + "40" }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("orgStatutoryBodies")}</Text>
              {["general_assembly", "syndic", "vice_syndic"].map((x) => <Text key={x} style={[styles.body, { color: colors.foreground }]}>• {t(TYPE_KEYS[x])}</Text>)}
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("orgCommittees")}</Text>
              {selected.length === 0 ? <Text style={[styles.body, { color: colors.foreground }]}>{t("orgNoCommittee")}</Text> : null}
              {selected.map((x) => <Text key={x} style={[styles.body, { color: colors.foreground }]}>• {t(TYPE_KEYS[x])}{leaders[x] ? ` — ${leaders[x].name}` : ` — ${t("orgVacantPosition")}`}</Text>)}
            </View>
            {!profile.hasDeputy ? <Text style={[styles.small, { color: colors.warning }]}>{t("orgReviewNoDeputy")}</Text> : null}
            <Text style={[styles.small, { color: colors.mutedForeground }]}>{t("orgReviewHint")}</Text>
          </>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        {step > 0 ? <Btn label={t("back")} onPress={() => setStep((s) => s - 1)} colors={colors} secondary /> : <View style={{ flex: 1 }} />}
        {step < steps.length - 1 ? (
          <Btn label={t("next")} onPress={() => void next()} colors={colors} />
        ) : saving ? (
          <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
        ) : (
          <>
            <Btn label={t("orgSaveDraft")} onPress={() => void create(false)} colors={colors} secondary />
            <Btn label={t("orgCreateAndActivate")} onPress={() => void create(true)} colors={colors} />
          </>
        )}
      </View>
    </View>
  );
}

function Btn({ label, onPress, colors, secondary }: { label: string; onPress: () => void; colors: any; secondary?: boolean }) {
  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: secondary ? colors.muted : colors.primary }]} onPress={onPress} accessibilityRole="button">
      <Text style={[styles.btnText, { color: secondary ? colors.foreground : "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  stepTitle: { fontSize: 18, fontWeight: "800", paddingHorizontal: 16, paddingTop: 12, textAlign: "left" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", textAlign: "left" },
  label: { fontSize: 13, fontWeight: "700", textAlign: "left" },
  body: { fontSize: 14, textAlign: "left" },
  small: { fontSize: 12, lineHeight: 17, textAlign: "left" },
  field: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 12 },
  btnText: { fontSize: 14, fontWeight: "700" },
});
