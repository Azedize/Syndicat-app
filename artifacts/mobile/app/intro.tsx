/**
 * VERIDIAN — Enterprise Platform Introduction
 *
 * 9-page premium onboarding carousel.
 * Each slide showcases a different platform module with:
 *   • A unique SVG "live UI" rendered inside a premium phone mockup
 *   • Module tag, bold title, persuasive subtitle
 *   • Two KPI stats demonstrating business ROI
 *   • Three feature bullet points
 * Transitions use Animated interpolation for parallax depth.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle, Defs, Ellipse, G, Line, Path, Rect, Stop,
  LinearGradient as SvgGrad, Text as SvgText,
} from "react-native-svg";
import { useTheme } from "@/context/ThemeContext";

const { width: W, height: H } = Dimensions.get("window");

// ─── Premium Phone Mockup ─────────────────────────────────────────────────────
function PhoneMockup({ children, accentColor, isDark }: {
  children: React.ReactNode;
  accentColor: string;
  isDark: boolean;
}) {
  const frame  = isDark ? "#0A1628" : "#1E293B";
  const bezel  = isDark ? "#0F1F35" : "#0F172A";
  const screen = isDark ? "#0D1929" : "#F8FAFF";
  const pill   = isDark ? "#050D18" : "#0A1628";
  const home   = isDark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.38)";
  const sideBtn = isDark ? "#060E1C" : "#0A1628";

  return (
    <Svg width="110" height="215" viewBox="0 0 200 390">
      {/* Drop shadow illusion */}
      <Rect x="10" y="10" width="188" height="378" rx="36" fill={accentColor} opacity="0.10" />
      <Rect x="6"  y="6"  width="192" height="386" rx="36" fill={accentColor} opacity="0.05" />
      {/* Phone body */}
      <Rect x="2" y="2" width="196" height="386" rx="36" fill={frame} />
      {/* Screen bezel */}
      <Rect x="6" y="6" width="188" height="378" rx="32" fill={bezel} />
      {/* Screen surface */}
      <Rect x="9" y="9" width="182" height="372" rx="29" fill={screen} />
      {/* Dynamic island */}
      <Rect x="71" y="13" width="58" height="10" rx="5" fill={pill} />
      {/* Volume buttons */}
      <Rect x="0" y="80"  width="3" height="28" rx="1.5" fill={sideBtn} />
      <Rect x="0" y="114" width="3" height="28" rx="1.5" fill={sideBtn} />
      {/* Power button */}
      <Rect x="197" y="95" width="3" height="40" rx="1.5" fill={sideBtn} />
      {/* Home indicator */}
      <Rect x="72" y="374" width="56" height="5" rx="2.5" fill={home} />
      {children}
    </Svg>
  );
}

// ─── Screen 1: Dashboard ──────────────────────────────────────────────────────
function DashboardScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#F0F6FF";
  const card = isDark ? "#142235" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const blu  = "#2563EB";
  return (
    <G>
      {/* Status bar */}
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="24" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header bar */}
      <Rect x="9" y="40" width="182" height="46" fill={blu} />
      <Rect x="17" y="49" width="60" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="38" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Circle cx="174" cy="56" r="11" fill="rgba(255,255,255,0.2)" />
      <Rect x="169" y="53" width="10" height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      <Rect x="169" y="57" width="10" height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      <Rect x="169" y="61" width="7"  height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      {/* KPI cards: 2x2 */}
      {[
        { x: 13, y: 94, c: "#2563EB", val: "142", lbl: "Membres actifs" },
        { x: 103, y: 94, c: "#10B981", val: "98%", lbl: "Recouvrement" },
        { x: 13, y: 148, c: "#F59E0B", val: "07", lbl: "Incidents ouverts" },
        { x: 103, y: 148, c: "#8B5CF6", val: "14", lbl: "Docs en attente" },
      ].map((k) => (
        <G key={k.x + "" + k.y}>
          <Rect x={k.x} y={k.y} width="85" height="48" rx="12" fill={card} />
          <Rect x={k.x + 8} y={k.y + 8} width="18" height="18" rx="7" fill={k.c + "22"} />
          <Rect x={k.x + 11} y={k.y + 13} width="12" height="8" rx="3" fill={k.c} opacity="0.6" />
          <Rect x={k.x + 32} y={k.y + 8} width="40" height="8" rx="4" fill={k.c} opacity="0.9" />
          <Rect x={k.x + 32} y={k.y + 20} width="48" height="4" rx="2" fill={sub} opacity="0.35" />
          <Rect x={k.x + 32} y={k.y + 28} width="36" height="10" rx="5" fill={k.c + "15"} />
          <Rect x={k.x + 36} y={k.y + 31} width="28" height="4" rx="2" fill={k.c} opacity="0.5" />
        </G>
      ))}
      {/* Activity feed label */}
      <Rect x="13" y="202" width="72" height="4.5" rx="2.25" fill={fg} opacity="0.5" />
      {/* Activity items */}
      {[
        { y: 212, c: "#10B981", w: 68 },
        { y: 228, c: "#2563EB", w: 82 },
        { y: 244, c: "#F59E0B", w: 54 },
        { y: 260, c: "#8B5CF6", w: 74 },
        { y: 276, c: "#10B981", w: 60 },
      ].map((a) => (
        <G key={a.y}>
          <Rect x="13" y={a.y} width="174" height="14" rx="7" fill={card} />
          <Circle cx="23"   cy={a.y + 7} r="5" fill={a.c + "25"} />
          <Circle cx="23"   cy={a.y + 7} r="2.5" fill={a.c} />
          <Rect x="33" y={a.y + 4} width={a.w} height="4" rx="2" fill={fg} opacity="0.5" />
          <Rect x="155" y={a.y + 4} width="28" height="4" rx="2" fill={sub} opacity="0.3" />
        </G>
      ))}
      {/* Quick actions row */}
      <Rect x="13" y="298" width="174" height="38" rx="12" fill={card} />
      {[
        { x: 24, c: "#2563EB" }, { x: 66, c: "#10B981" }, { x: 108, c: "#F59E0B" }, { x: 150, c: "#8B5CF6" },
      ].map((q) => (
        <G key={q.x}>
          <Circle cx={q.x + 10} cy="317" r="10" fill={q.c + "20"} />
          <Rect x={q.x + 6} y="313" width="8" height="8" rx="3" fill={q.c} opacity="0.55" />
          <Rect x={q.x + 2} y="329" width="18" height="3.5" rx="1.75" fill={sub} opacity="0.3" />
        </G>
      ))}
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(37,99,235,0.08)"} strokeWidth="1" />
      {[28, 68, 100, 140, 178].map((x, i) => (
        <G key={x}>
          <Rect x={x - 12} y="350" width="24" height="4" rx="2" fill={i === 0 ? blu : (isDark ? "rgba(255,255,255,0.18)" : "rgba(37,99,235,0.15)")} />
          <Circle cx={x} cy="364" r="4" fill={i === 0 ? blu : "transparent"} />
        </G>
      ))}
    </G>
  );
}

// ─── Screen 2: Finance ────────────────────────────────────────────────────────
function FinanceScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#EFF6FF";
  const card = isDark ? "#1E2D45" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill="#1D4ED8" />
      <Rect x="17" y="49" width="68" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="44" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Circle cx="174" cy="56" r="11" fill="rgba(255,255,255,0.2)" />
      <Rect x="169" y="52" width="10" height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      <Rect x="169" y="56" width="10" height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      <Rect x="169" y="60" width="7"  height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      {/* Balance hero card */}
      <Rect x="13" y="94" width="174" height="52" rx="14" fill="#1D4ED8" />
      <Rect x="20" y="100" width="50" height="4" rx="2" fill="rgba(255,255,255,0.5)" />
      <Rect x="20" y="109" width="90" height="12" rx="4" fill="rgba(255,255,255,0.9)" />
      <Rect x="20" y="126" width="40" height="5" rx="2.5" fill="rgba(255,255,255,0.35)" />
      <Rect x="138" y="100" width="42" height="14" rx="7" fill="rgba(16,185,129,0.9)" />
      <Rect x="143" y="105" width="32" height="4" rx="2" fill="rgba(255,255,255,0.9)" />
      <Rect x="138" y="118" width="42" height="8" rx="4" fill="rgba(255,255,255,0.12)" />
      <Rect x="143" y="121" width="32" height="3.5" rx="1.75" fill="rgba(255,255,255,0.6)" />
      {/* Stat chips row */}
      {[
        { x: 13, c: "#10B981", lbl: "Encaissé", val: "125k" },
        { x: 73, c: "#F59E0B", lbl: "Charges", val: "8.5k" },
        { x: 133, c: "#EF4444", lbl: "Impayés", val: "12k" },
      ].map((s) => (
        <G key={s.x}>
          <Rect x={s.x} y="154" width="54" height="38" rx="10" fill={card} />
          <Rect x={s.x + 7} y="162" width="24" height="7" rx="3.5" fill={s.c} opacity="0.85" />
          <Rect x={s.x + 7} y="173" width="38" height="4" rx="2" fill={sub} opacity="0.35" />
          <Rect x={s.x + 7} y="179" width="28" height="5" rx="2.5" fill={s.c + "20"} />
        </G>
      ))}
      {/* Bar chart */}
      <Rect x="13" y="200" width="174" height="64" rx="12" fill={card} />
      <Rect x="20" y="207" width="55" height="5" rx="2.5" fill={fg} opacity="0.65" />
      <Rect x="20" y="215" width="32" height="3.5" rx="1.75" fill={sub} opacity="0.35" />
      {[
        { x: 20, h: 28, c: "rgba(29,78,216,0.22)" },
        { x: 36, h: 38, c: "rgba(29,78,216,0.32)" },
        { x: 52, h: 22, c: "rgba(29,78,216,0.22)" },
        { x: 68, h: 44, c: "#1D4ED8" },
        { x: 84, h: 32, c: "rgba(29,78,216,0.32)" },
        { x: 100, h: 48, c: "#1D4ED8" },
        { x: 116, h: 36, c: "rgba(29,78,216,0.32)" },
        { x: 132, h: 52, c: "#1D4ED8" },
        { x: 148, h: 40, c: "rgba(29,78,216,0.32)" },
        { x: 164, h: 34, c: "rgba(29,78,216,0.22)" },
      ].map((b) => (
        <Rect key={b.x} x={b.x} y={255 - b.h} width="12" height={b.h} rx="4" fill={b.c} />
      ))}
      <Path d="M26,248 L42,238 L58,252 L74,228 L90,240 L106,220 L122,232 L138,216 L154,224 L170,218" stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Transactions */}
      <Rect x="13" y="270" width="70" height="4" rx="2" fill={fg} opacity="0.45" />
      {[
        { y: 280, c: "#10B981", lbl: "Cotisation Lot 12", amt: "+2 500" },
        { y: 296, c: "#EF4444", lbl: "Entretien ascenseur", amt: "−1 200" },
        { y: 312, c: "#10B981", lbl: "Cotisation Lot 07", amt: "+2 500" },
        { y: 328, c: "#F59E0B", lbl: "Facture électricité", amt: "−890" },
      ].map((t) => (
        <G key={t.y}>
          <Rect x="13" y={t.y} width="174" height="14" rx="6" fill={card} />
          <Circle cx="23" cy={t.y + 7} r="4" fill={t.c + "30"} />
          <Rect x="22" y={t.y + 5.5} width="2" height="3" rx="1" fill={t.c} />
          <Rect x="32" y={t.y + 4} width="60" height="3.5" rx="1.75" fill={fg} opacity="0.55" />
          <Rect x="143" y={t.y + 4} width="38" height="5" rx="2.5" fill={t.c} opacity="0.75" />
        </G>
      ))}
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(29,78,216,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 3: Meetings / AG ──────────────────────────────────────────────────
function MeetingsScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#F0FDF4";
  const card = isDark ? "#1A2D20" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const grn  = "#059669";
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={grn} />
      <Rect x="17" y="49" width="72" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="50" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Rect x="162" y="47" width="20" height="20" rx="7" fill="rgba(255,255,255,0.2)" />
      <Rect x="166" y="52" width="12" height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Rect x="166" y="56" width="12" height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Rect x="166" y="60" width="8"  height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      {/* Next meeting hero */}
      <Rect x="13" y="94" width="174" height="58" rx="14" fill={card} />
      <Rect x="13" y="94" width="174" height="58" rx="14" fill={grn + "10"} />
      <Rect x="19" y="100" width="4"  height="46" rx="2" fill={grn} />
      <Rect x="29" y="100" width="70" height="6" rx="3" fill={fg} opacity="0.8" />
      <Rect x="29" y="110" width="50" height="4" rx="2" fill={sub} opacity="0.5" />
      <Rect x="29" y="118" width="40" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="29" y="128" width="50" height="12" rx="6" fill={grn} />
      <Rect x="34" y="132" width="40" height="4" rx="2" fill="rgba(255,255,255,0.9)" />
      {/* LIVE badge */}
      <Rect x="148" y="97" width="34" height="14" rx="7" fill="#EF444425" />
      <Circle cx="155" cy="104" r="3" fill="#EF4444" />
      <Rect x="160" y="101.5" width="16" height="4" rx="2" fill="#EF4444" opacity="0.75" />
      {/* Members attendance row */}
      <Rect x="13" y="158" width="78" height="4" rx="2" fill={fg} opacity="0.45" />
      <Rect x="120" y="157" width="68" height="6" rx="3" fill={grn + "20"} />
      <Rect x="124" y="159" width="58" height="2.5" rx="1.25" fill={grn} opacity="0.5" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <G key={i}>
          <Circle cx={14 + i * 16} cy="172" r="8" fill={["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"][i] + "50"} />
          <Rect x={9 + i * 16} y="169" width="10" height="6" rx="3" fill={["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"][i]} opacity="0.55" />
        </G>
      ))}
      <Rect x="112" y="164" width="24" height="16" rx="8" fill={grn + "20"} />
      <Rect x="115" y="169" width="18" height="5" rx="2.5" fill={grn} opacity="0.6" />
      {/* Agenda items */}
      <Rect x="13" y="186" width="60" height="4" rx="2" fill={fg} opacity="0.45" />
      {[
        { y: 196, lbl: "Approbation budget 2025", pct: 78, c: "#10B981" },
        { y: 218, lbl: "Travaux façade bâtiment A", pct: 62, c: "#F59E0B" },
        { y: 240, lbl: "Élection nouveau président", pct: 91, c: "#2563EB" },
        { y: 262, lbl: "Règlement copropriété v3", pct: 55, c: "#8B5CF6" },
      ].map((item) => (
        <G key={item.y}>
          <Rect x="13" y={item.y} width="174" height="20" rx="8" fill={card} />
          <Rect x="19" y={item.y + 7} width="72" height="4" rx="2" fill={fg} opacity="0.6" />
          <Rect x="100" y={item.y + 6} width="54" height="6" rx="3" fill={isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} />
          <Rect x="100" y={item.y + 6} width={54 * item.pct / 100} height="6" rx="3" fill={item.c} opacity="0.8" />
          <Rect x="158" y={item.y + 5} width="24" height="8" rx="4" fill={item.c + "25"} />
          <Rect x="161" y={item.y + 8} width="16" height="3" rx="1.5" fill={item.c} opacity="0.7" />
        </G>
      ))}
      {/* PV signature zone */}
      <Rect x="13" y="290" width="174" height="44" rx="12" fill={card} />
      <Rect x="19" y="297" width="58" height="4" rx="2" fill={fg} opacity="0.55" />
      <Path d="M19,312 Q34,305 44,312 Q55,320 68,308 Q79,297 92,312" stroke={grn} strokeWidth="2" fill="none" strokeLinecap="round" />
      <Line x1="19" y1="320" x2="160" y2="320" stroke={isDark ? "rgba(255,255,255,0.07)" : "rgba(5,150,105,0.15)"} strokeWidth="1" strokeDasharray="4,3" />
      <Rect x="130" y="291" width="50" height="18" rx="9" fill={grn} />
      <Rect x="136" y="297" width="38" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(5,150,105,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 4: Documents ─────────────────────────────────────────────────────
function DocumentsScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#FAF5FF";
  const card = isDark ? "#1E1A3A" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const pur  = "#7C3AED";
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={pur} />
      <Rect x="17" y="49" width="62" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="90" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Circle cx="174" cy="56" r="11" fill="rgba(255,255,255,0.2)" />
      <Rect x="169" y="54" width="10" height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      <Rect x="169" y="58" width="7"  height="2" rx="1" fill="rgba(255,255,255,0.8)" />
      {/* Search */}
      <Rect x="13" y="94" width="174" height="26" rx="13" fill={card} />
      <Circle cx="27" cy="107" r="6" fill={pur + "18"} />
      <Rect x="21" y="105.5" width="8" height="1.5" rx="0.75" fill={pur} opacity="0.45" />
      <Rect x="21" y="108.5" width="6" height="1.5" rx="0.75" fill={pur} opacity="0.45" />
      <Rect x="39" y="104" width="80" height="5" rx="2.5" fill={sub} opacity="0.28" />
      <Rect x="160" y="99" width="20" height="14" rx="7" fill={pur} />
      <Rect x="164" y="104" width="12" height="4" rx="2" fill="rgba(255,255,255,0.85)" />
      {/* Stats */}
      {[
        { x: 13,  c: pur,       lbl: "Total",     val: "147" },
        { x: 73,  c: "#10B981", lbl: "Signés",    val: "89" },
        { x: 133, c: "#F59E0B", lbl: "En attente", val: "24" },
      ].map((s) => (
        <G key={s.x}>
          <Rect x={s.x} y="126" width="54" height="32" rx="9" fill={card} />
          <Rect x={s.x + 7} y="132" width="22" height="8" rx="4" fill={s.c} opacity="0.88" />
          <Rect x={s.x + 7} y="143" width="32" height="4" rx="2" fill={sub} opacity="0.35" />
        </G>
      ))}
      {/* Document list */}
      {[
        { y: 166, chip: "Signé",     cc: "#10B981", wt: 28 },
        { y: 188, chip: "En attente", cc: "#F59E0B", wt: 38 },
        { y: 210, chip: "Signé",     cc: "#10B981", wt: 28 },
        { y: 232, chip: "Brouillon", cc: "#6B7280", wt: 32 },
        { y: 254, chip: "Signé",     cc: "#10B981", wt: 28 },
        { y: 276, chip: "Rejeté",    cc: "#EF4444", wt: 28 },
      ].map((d) => (
        <G key={d.y}>
          <Rect x="13" y={d.y} width="174" height="20" rx="8" fill={card} />
          <Rect x="19" y={d.y + 4} width="12" height="12" rx="4" fill={pur + "18"} />
          <Rect x="21" y={d.y + 7}  width="8"  height="6" rx="1" fill={pur} opacity="0.45" />
          <Rect x="36" y={d.y + 5} width="80" height="4" rx="2" fill={fg} opacity="0.6" />
          <Rect x="36" y={d.y + 12} width="50" height="3" rx="1.5" fill={sub} opacity="0.32" />
          <Rect x={174 - d.wt - 6} y={d.y + 5} width={d.wt + 6} height="10" rx="5" fill={d.cc + "20"} />
          <Rect x={174 - d.wt - 3} y={d.y + 8} width={d.wt}     height="4"  rx="2" fill={d.cc} opacity="0.7" />
        </G>
      ))}
      {/* QR block */}
      <Rect x="13" y="302" width="174" height="34" rx="12" fill={card} />
      <Rect x="19" y="310" width="22" height="22" rx="6" fill={pur + "15"} />
      {[0, 1, 2, 3].map((i) => (
        <Rect key={i} x={22 + (i % 2) * 9} y={313 + Math.floor(i / 2) * 9} width="7" height="7" rx="2" fill={pur} opacity="0.4" />
      ))}
      <Rect x="48" y="309" width="70" height="5" rx="2.5" fill={fg} opacity="0.55" />
      <Rect x="48" y="318" width="50" height="4" rx="2" fill={sub} opacity="0.35" />
      <Rect x="148" y="308" width="32" height="18" rx="9" fill={pur} />
      <Rect x="152" y="314" width="24" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 5: Marketplace ────────────────────────────────────────────────────
function MarketplaceScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#F5F3FF";
  const card = isDark ? "#1A1035" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const ind  = "#8B5CF6";
  const products = [
    { x: 13,  y: 130, c: "#8B5CF6", lbl: "Vélo électrique",  price: "4 500 MAD" },
    { x: 98,  y: 130, c: "#2563EB", lbl: "Climatiseur",       price: "2 800 MAD" },
    { x: 13,  y: 215, c: "#10B981", lbl: "Canapé d'angle",    price: "1 900 MAD" },
    { x: 98,  y: 215, c: "#F59E0B", lbl: "Table de jardin",   price: "850 MAD" },
  ];
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={ind} />
      <Rect x="17" y="49" width="68" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="84" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Rect x="154" y="47" width="28" height="14" rx="7" fill="rgba(255,255,255,0.25)" />
      <Rect x="158" y="51" width="20" height="5" rx="2.5" fill="rgba(255,255,255,0.85)" />
      {/* Category pills */}
      {[
        { x: 13, w: 42, lbl: "Tout",          active: true },
        { x: 61, w: 52, lbl: "Mobilier",      active: false },
        { x: 119, w: 58, lbl: "Électronique", active: false },
      ].map((c) => (
        <G key={c.x}>
          <Rect x={c.x} y="93" width={c.w} height="20" rx="10" fill={c.active ? ind : (isDark ? "rgba(255,255,255,0.07)" : ind + "12")} />
          <Rect x={c.x + 8} y="100" width={c.w - 16} height="5" rx="2.5" fill={c.active ? "rgba(255,255,255,0.9)" : ind} opacity={c.active ? 1 : 0.45} />
        </G>
      ))}
      {/* Product grid */}
      {products.map((p) => (
        <G key={`${p.x}-${p.y}`}>
          <Rect x={p.x} y={p.y} width="81" height="78" rx="12" fill={card} />
          <Rect x={p.x + 4} y={p.y + 4} width="73" height="42" rx="10" fill={p.c + "18"} />
          <Circle cx={p.x + 40} cy={p.y + 25} r="13" fill={p.c + "28"} />
          <Rect x={p.x + 33} y={p.y + 20} width="14" height="10" rx="3" fill={p.c} opacity="0.4" />
          <Rect x={p.x + 4} y={p.y + 8} width="30" height="9" rx="4.5" fill={p.c} />
          <Rect x={p.x + 7} y={p.y + 11} width="24" height="3.5" rx="1.75" fill="rgba(255,255,255,0.88)" />
          <Rect x={p.x + 6} y={p.y + 52} width="50" height="4.5" rx="2.25" fill={fg} opacity="0.65" />
          <Rect x={p.x + 6} y={p.y + 61} width="38" height="7" rx="3.5" fill={p.c} opacity="0.88" />
          <Rect x={p.x + 6} y={p.y + 71} width="28" height="3.5" rx="1.75" fill={sub} opacity="0.38" />
        </G>
      ))}
      {/* Sell CTA */}
      <Rect x="13" y="302" width="174" height="32" rx="16" fill={ind} />
      <Rect x="38" y="312" width="124" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      <Circle cx="26" cy="318" r="7" fill="rgba(255,255,255,0.22)" />
      <Rect x="22" y="314" width="8" height="8" rx="4" fill="rgba(255,255,255,0.7)" opacity="0.5" />
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(139,92,246,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 6: Maintenance ────────────────────────────────────────────────────
function MaintenanceScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#FFFBEB";
  const card = isDark ? "#2A1F10" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const amb  = "#D97706";
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={amb} />
      <Rect x="17" y="49" width="74" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="54" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Rect x="155" y="45" width="28" height="16" rx="8" fill="#EF4444" />
      <Rect x="160" y="50" width="18" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      {/* KPI row */}
      {[
        { x: 13,  val: "23", lbl: "Tickets",  c: amb },
        { x: 77,  val: "08", lbl: "Urgents",  c: "#EF4444" },
        { x: 141, val: "12", lbl: "En cours", c: "#F59E0B" },
      ].map((k) => (
        <G key={k.x}>
          <Rect x={k.x} y="94" width="56" height="44" rx="11" fill={card} />
          <Rect x={k.x + 8} y="102" width="28" height="12" rx="4" fill={k.c} opacity="0.88" />
          <Rect x={k.x + 8} y="118" width="38" height="4" rx="2" fill={sub} opacity="0.38" />
        </G>
      ))}
      {/* Section label */}
      <Rect x="13" y="144" width="70" height="4" rx="2" fill={fg} opacity="0.45" />
      {/* Ticket items */}
      {[
        { y: 154, prio: "#EF4444", lbl: "Ascenseur en panne",     cat: "Urgent",   prog: 40 },
        { y: 180, prio: "#F59E0B", lbl: "Fuite toiture bât. A",   cat: "En cours", prog: 70 },
        { y: 206, prio: "#2563EB", lbl: "Peinture cage escalier",  cat: "Planifié", prog: 10 },
        { y: 232, prio: "#10B981", lbl: "Éclairage parking",       cat: "Terminé",  prog: 100 },
        { y: 258, prio: "#F59E0B", lbl: "Portail automatique",     cat: "En cours", prog: 55 },
      ].map((t) => (
        <G key={t.y}>
          <Rect x="13" y={t.y} width="174" height="24" rx="10" fill={card} />
          <Circle cx="25" cy={t.y + 12} r="5" fill={t.prio + "28"} />
          <Circle cx="25" cy={t.y + 12} r="3" fill={t.prio} />
          <Rect x="34" y={t.y + 6} width="70" height="4.5" rx="2.25" fill={fg} opacity="0.62" />
          <Rect x="34" y={t.y + 14} width="38" height="3.5" rx="1.75" fill={sub} opacity="0.38" />
          <Rect x="120" y={t.y + 8} width="54" height="6" rx="3" fill={isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} />
          <Rect x="120" y={t.y + 8} width={Math.round(54 * t.prog / 100)} height="6" rx="3" fill={t.prio} opacity="0.72" />
        </G>
      ))}
      {/* New ticket button */}
      <Rect x="13" y="292" width="174" height="36" rx="18" fill={amb} />
      <Rect x="48" y="305" width="104" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      <Circle cx="30" cy="310" r="9" fill="rgba(255,255,255,0.22)" />
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(217,119,6,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 7: Reclamations / Complaints ──────────────────────────────────────
function ReclamationsScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#FFF1F2";
  const card = isDark ? "#2A1018" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const rose = "#E11D48";
  const items = [
    { y: 160, stat: "En cours",     sc: "#F59E0B", type: "Bruit voisinage",       days: "2j" },
    { y: 184, stat: "Résolu",       sc: "#10B981", type: "Problème parking",      days: "5j" },
    { y: 208, stat: "Nouveau",      sc: "#2563EB", type: "Infiltration d'eau",    days: "1j" },
    { y: 232, stat: "En attente",   sc: "#8B5CF6", type: "Charges contestées",    days: "3j" },
    { y: 256, stat: "Résolu",       sc: "#10B981", type: "Gardien absent",        days: "7j" },
    { y: 280, stat: "En cours",     sc: "#F59E0B", type: "Ordures non collectées", days: "4j" },
  ];
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={rose} />
      <Rect x="17" y="49" width="74" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="56" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Rect x="158" y="45" width="24" height="24" rx="8" fill="rgba(255,255,255,0.2)" />
      <Rect x="163" y="52" width="14" height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Rect x="163" y="56" width="14" height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Rect x="163" y="60" width="9"  height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      {/* Status tabs */}
      {[
        { x: 13, lbl: "Tous",     active: true },
        { x: 64, lbl: "Ouverts",  active: false },
        { x: 120, lbl: "Résolus", active: false },
      ].map((t) => (
        <G key={t.x}>
          <Rect x={t.x} y="93" width={t.active ? 46 : t.x === 64 ? 50 : 52} height="20" rx="10" fill={t.active ? rose : (isDark ? "rgba(255,255,255,0.07)" : rose + "12")} />
          <Rect x={t.x + 8} y="100" width={t.active ? 30 : 36} height="5" rx="2.5" fill={t.active ? "rgba(255,255,255,0.9)" : rose} opacity={t.active ? 1 : 0.45} />
        </G>
      ))}
      {/* KPI strip */}
      {[
        { x: 13,  c: rose,      lbl: "Total", val: "34" },
        { x: 73,  c: "#F59E0B", lbl: "Ouverts", val: "12" },
        { x: 133, c: "#10B981", lbl: "Résolus", val: "18" },
      ].map((k) => (
        <G key={k.x}>
          <Rect x={k.x} y="120" width="54" height="34" rx="9" fill={card} />
          <Rect x={k.x + 7} y="128" width="24" height="7" rx="3.5" fill={k.c} opacity="0.88" />
          <Rect x={k.x + 7} y="139" width="36" height="4"  rx="2"    fill={sub} opacity="0.35" />
        </G>
      ))}
      {/* Section label */}
      <Rect x="13" y="156" width="76" height="4" rx="2" fill={fg} opacity="0.45" />
      {/* Complaint items */}
      {items.map((it) => (
        <G key={it.y}>
          <Rect x="13" y={it.y} width="174" height="22" rx="9" fill={card} />
          <Rect x="19" y={it.y + 4} width="14" height="14" rx="5" fill={rose + "18"} />
          <Rect x="21" y={it.y + 8}  width="10" height="6" rx="2" fill={rose} opacity="0.4" />
          <Rect x="38" y={it.y + 6} width="68" height="4.5" rx="2.25" fill={fg} opacity="0.62" />
          <Rect x="38" y={it.y + 14} width="30" height="3" rx="1.5" fill={sub} opacity="0.35" />
          <Rect x={172 - 44} y={it.y + 5} width="40" height="10" rx="5" fill={it.sc + "20"} />
          <Rect x={172 - 40} y={it.y + 8} width="32" height="4" rx="2" fill={it.sc} opacity="0.7" />
          <Rect x="162" y={it.y + 15} width="18" height="3.5" rx="1.75" fill={sub} opacity="0.3" />
        </G>
      ))}
      {/* New complaint CTA */}
      <Rect x="13" y="308" width="174" height="28" rx="14" fill={rose} />
      <Rect x="45" y="317" width="110" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(225,29,72,0.07)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 8: Elections / Voting ─────────────────────────────────────────────
function ElectionsScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#F0F9FF";
  const card = isDark ? "#0E1E30" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const sky  = "#0284C7";
  const candidates = [
    { y: 174, initials: "MA", c: "#2563EB", lbl: "Mohammed Alami",    pct: 42, votes: "58" },
    { y: 214, initials: "FZ", c: "#10B981", lbl: "Fatima Zrouki",     pct: 35, votes: "48" },
    { y: 254, initials: "KO", c: "#F59E0B", lbl: "Karim Oukassi",     pct: 23, votes: "32" },
  ];
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={sky} />
      <Rect x="17" y="49" width="64" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="80" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      <Rect x="152" y="46" width="32" height="14" rx="7" fill="rgba(255,255,255,0.2)" />
      <Rect x="156" y="51" width="24" height="4"  rx="2" fill="rgba(255,255,255,0.85)" />
      {/* Active election card */}
      <Rect x="13" y="94" width="174" height="68" rx="14" fill={sky + "18"} />
      <Rect x="13" y="94" width="4"   height="68" rx="2" fill={sky} />
      <Rect x="22" y="102" width="80" height="6" rx="3" fill={fg} opacity="0.85" />
      <Rect x="22" y="112" width="60" height="4" rx="2" fill={sub} opacity="0.5" />
      {/* Progress donut ring (simplified) */}
      <Circle cx="162" cy="128" r="22" fill={sky + "15"} />
      <Circle cx="162" cy="128" r="22" fill="none" stroke={sky} strokeWidth="4" strokeDasharray="80 62" strokeLinecap="round" />
      <Rect  x="153" y="124" width="18" height="7" rx="3.5" fill={sky} opacity="0.9" />
      <Rect  x="153" y="134" width="18" height="4"  rx="2"   fill={sub} opacity="0.35" />
      <Rect x="22" y="124" width="52" height="12" rx="6" fill={sky} />
      <Rect x="27" y="128" width="42" height="4" rx="2" fill="rgba(255,255,255,0.9)" />
      <Rect x="22" y="140" width="38" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Section heading */}
      <Rect x="13" y="168" width="72" height="4" rx="2" fill={fg} opacity="0.45" />
      {/* Candidate rows */}
      {candidates.map((cand) => (
        <G key={cand.y}>
          <Rect x="13" y={cand.y} width="174" height="36" rx="12" fill={card} />
          <Circle cx="30" cy={cand.y + 18} r="12" fill={cand.c + "28"} />
          <Rect x="22" y={cand.y + 14} width="16" height="8" rx="4" fill={cand.c} opacity="0.5" />
          <Rect x="48" y={cand.y + 8}  width="65" height="5"   rx="2.5" fill={fg} opacity="0.72" />
          <Rect x="48" y={cand.y + 17} width="100" height="6"  rx="3"   fill={isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"} />
          <Rect x="48" y={cand.y + 17} width={100 * cand.pct / 100} height="6" rx="3" fill={cand.c} opacity="0.78" />
          <Rect x="48" y={cand.y + 27} width="22" height="4"   rx="2"   fill={sub} opacity="0.35" />
          <Rect x="150" y={cand.y + 8} width="30" height="10"  rx="5"   fill={cand.c + "20"} />
          <Rect x="154" y={cand.y + 11} width="22" height="4"  rx="2"   fill={cand.c} opacity="0.75" />
          <Rect x="150" y={cand.y + 22} width="30" height="8"  rx="4"   fill={cand.c} opacity="0.18" />
          <Rect x="154" y={cand.y + 25} width="22" height="3.5" rx="1.75" fill={cand.c} opacity="0.5" />
        </G>
      ))}
      {/* Vote CTA */}
      <Rect x="13" y="298" width="174" height="36" rx="18" fill={sky} />
      <Rect x="50" y="311" width="100" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(2,132,199,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Screen 9: Notifications ──────────────────────────────────────────────────
function NotificationsScreen({ isDark }: { isDark: boolean }) {
  const bg   = isDark ? "#0D1929" : "#F0FDFA";
  const card = isDark ? "#0E2520" : "#FFFFFF";
  const fg   = isDark ? "#E8F0FE" : "#0A1628";
  const sub  = isDark ? "rgba(232,240,254,0.45)" : "#64748B";
  const teal = "#0D9488";
  const notes = [
    { y: 116, ic: "🔔", c: "#2563EB", t: "Assemblée générale",       d: "Demain à 18h00 • Salle commune", badge: "Urgent", bc: "#EF4444" },
    { y: 150, ic: "💳", c: "#10B981", t: "Paiement reçu",             d: "Lot 12 — 2 500 MAD • Validé", badge: "Nouveau", bc: "#10B981" },
    { y: 184, ic: "🔧", c: "#F59E0B", t: "Ticket mis à jour",         d: "Ascenseur — Technicien en route", badge: "Info", bc: "#F59E0B" },
    { y: 218, ic: "📄", c: "#7C3AED", t: "Document à signer",         d: "PV AG Juin 2025 — En attente", badge: "Action", bc: "#7C3AED" },
    { y: 252, ic: "🗳️", c: "#0284C7", t: "Vote en cours",             d: "Budget 2026 — Expire dans 2h", badge: "Urgent", bc: "#EF4444" },
    { y: 286, ic: "💬", c: "#E11D48", t: "Nouveau message",           d: "Ahmed B. — Réunion syndic", badge: "Nouveau", bc: "#10B981" },
  ];
  return (
    <G>
      <Rect x="9" y="24" width="182" height="16" fill={bg} />
      <Rect x="16" y="28" width="22" height="4" rx="2" fill={sub} opacity="0.4" />
      <Rect x="163" y="28" width="14" height="4" rx="2" fill={sub} opacity="0.4" />
      {/* Header */}
      <Rect x="9" y="40" width="182" height="46" fill={teal} />
      <Rect x="17" y="49" width="70" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <Rect x="17" y="59" width="48" height="3.5" rx="1.75" fill="rgba(255,255,255,0.5)" />
      {/* Bell icon with badge */}
      <Circle cx="169" cy="56" r="13" fill="rgba(255,255,255,0.2)" />
      <Rect x="163" y="51" width="12" height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Rect x="163" y="55" width="12" height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Rect x="163" y="59" width="8"  height="2" rx="1" fill="rgba(255,255,255,0.85)" />
      <Circle cx="177" cy="46" r="5" fill="#EF4444" />
      <Rect x="175" y="44" width="4" height="4" rx="2" fill="rgba(255,255,255,0.9)" />
      {/* Unread count strip */}
      <Rect x="13" y="94" width="174" height="16" rx="8" fill={teal + "18"} />
      <Rect x="19" y="99" width="60" height="4" rx="2" fill={teal} opacity="0.6" />
      <Rect x="160" y="98" width="22" height="6" rx="3" fill={teal} />
      <Rect x="164" y="100" width="14" height="2.5" rx="1.25" fill="rgba(255,255,255,0.9)" />
      {/* Notification items */}
      {notes.map((n) => (
        <G key={n.y}>
          <Rect x="13" y={n.y} width="174" height="32" rx="10" fill={card} />
          {/* Left accent bar for unread */}
          {n.badge !== "Info" && <Rect x="13" y={n.y} width="3" height="32" rx="1.5" fill={n.c} />}
          <Circle cx="29"  cy={n.y + 16} r="11" fill={n.c + "20"} />
          <Rect x="23" y={n.y + 12} width="12" height="8" rx="3" fill={n.c} opacity="0.45" />
          <Rect x="46" y={n.y + 8}  width="72" height="5"   rx="2.5" fill={fg} opacity="0.75" />
          <Rect x="46" y={n.y + 17} width="88" height="3.5" rx="1.75" fill={sub} opacity="0.4" />
          <Rect x={174 - 36} y={n.y + 8}  width="32" height="10" rx="5" fill={n.bc + "22"} />
          <Rect x={174 - 33} y={n.y + 11} width="26" height="4"  rx="2" fill={n.bc} opacity="0.7" />
          <Rect x={174 - 33} y={n.y + 22} width="26" height="3.5" rx="1.75" fill={sub} opacity="0.3" />
        </G>
      ))}
      {/* Bottom nav */}
      <Rect x="9" y="345" width="182" height="36" fill={card} />
      <Line x1="9" y1="345" x2="191" y2="345" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(13,148,136,0.08)"} strokeWidth="1" />
    </G>
  );
}

// ─── Page definitions ─────────────────────────────────────────────────────────
const PAGES = [
  {
    key: "dashboard",
    accentColor: "#2563EB",
    gradient: ["#0F2460", "#1E40AF"] as [string, string],
    tag: "Tableau de Bord",
    title: "Votre résidence,\npilotée en temps réel",
    subtitle: "Toutes les métriques clés de votre copropriété en un seul regard. Zéro angle mort, décisions éclairées instantanément.",
    stats: [
      { icon: "bar-chart-2" as const, value: "−72%", label: "Temps de reporting" },
      { icon: "eye" as const,         value: "100%", label: "Visibilité opérationnelle" },
    ],
    features: [
      { icon: "activity" as const,   text: "KPIs financiers, incidents et docs en temps réel" },
      { icon: "zap" as const,        text: "Actions rapides : paiement, incident, document" },
      { icon: "trending-up" as const, text: "Alertes intelligentes et flux d'activité live" },
    ],
    Screen: DashboardScreen,
  },
  {
    key: "finance",
    accentColor: "#1D4ED8",
    gradient: ["#1E3A8A", "#1D4ED8"] as [string, string],
    tag: "Gestion Financière",
    title: "Transparence\nfinancière totale",
    subtitle: "Éliminez les zones d'ombre. Chaque dirham est tracé, justifié et visible par tous les copropriétaires.",
    stats: [
      { icon: "trending-up" as const, value: "+47%", label: "Taux de recouvrement" },
      { icon: "clock" as const,       value: "−80%", label: "Temps comptable mensuel" },
    ],
    features: [
      { icon: "pie-chart" as const,   text: "Budgets prévisionnels et charges en temps réel" },
      { icon: "credit-card" as const, text: "Recouvrement automatisé des cotisations" },
      { icon: "file-text" as const,   text: "Rapports PDF certifiés générés à la demande" },
    ],
    Screen: FinanceScreen,
  },
  {
    key: "meetings",
    accentColor: "#059669",
    gradient: ["#064E3B", "#047857"] as [string, string],
    tag: "Assemblées Générales",
    title: "AG 100% numériques,\n100% conformes",
    subtitle: "Organisez, votez et signez vos procès-verbaux depuis n'importe où. Conformité à la loi marocaine sur la copropriété garantie.",
    stats: [
      { icon: "users" as const, value: "3×",  label: "Participation aux votes" },
      { icon: "zap" as const,   value: "−90%", label: "Délai de traitement PV" },
    ],
    features: [
      { icon: "check-square" as const, text: "Vote électronique sécurisé et certifié" },
      { icon: "award" as const,        text: "Procès-verbaux générés automatiquement" },
      { icon: "pen-tool" as const,     text: "Signature électronique juridiquement valide" },
    ],
    Screen: MeetingsScreen,
  },
  {
    key: "documents",
    accentColor: "#7C3AED",
    gradient: ["#4C1D95", "#6D28D9"] as [string, string],
    tag: "Documents & Signatures",
    title: "Zéro papier,\n100% certifié",
    subtitle: "Plus de 50 modèles juridiques certifiés. Générez, signez et archivez vos documents officiels en quelques secondes.",
    stats: [
      { icon: "folder" as const, value: "50+", label: "Modèles juridiques certifiés" },
      { icon: "shield" as const, value: "100%", label: "Conformité légale CNDP" },
    ],
    features: [
      { icon: "file-text" as const, text: "Bibliothèque de 50+ documents officiels" },
      { icon: "lock" as const,      text: "Archivage chiffré et immuable" },
      { icon: "download" as const,  text: "Export PDF avec QR code de vérification" },
    ],
    Screen: DocumentsScreen,
  },
  {
    key: "marketplace",
    accentColor: "#8B5CF6",
    gradient: ["#4C1D95", "#7C3AED"] as [string, string],
    tag: "Marketplace Résidentielle",
    title: "Une résidence\nvivante et connectée",
    subtitle: "Achats, ventes et services entre voisins. Une marketplace sécurisée qui renforce la cohésion de votre communauté.",
    stats: [
      { icon: "shopping-bag" as const, value: "3.2k", label: "Transactions / mois" },
      { icon: "heart" as const,        value: "+89%", label: "Satisfaction résidents" },
    ],
    features: [
      { icon: "tag" as const,            text: "Petites annonces entre copropriétaires" },
      { icon: "message-circle" as const, text: "Messagerie interne sécurisée" },
      { icon: "bell" as const,           text: "Notifications d'alertes communautaires" },
    ],
    Screen: MarketplaceScreen,
  },
  {
    key: "maintenance",
    accentColor: "#D97706",
    gradient: ["#78350F", "#B45309"] as [string, string],
    tag: "Maintenance & Travaux",
    title: "Incidents résolus\n2× plus vite",
    subtitle: "Déclarez un incident, suivez l'avancement et évaluez les prestataires. Tout depuis votre smartphone, en temps réel.",
    stats: [
      { icon: "tool" as const, value: "−65%", label: "Délai de résolution moyen" },
      { icon: "star" as const, value: "4.8/5", label: "Satisfaction résidents" },
    ],
    features: [
      { icon: "alert-triangle" as const, text: "Tickets priorisés par niveau d'urgence" },
      { icon: "briefcase" as const,      text: "Réseau de prestataires vérifiés" },
      { icon: "camera" as const,         text: "Suivi photos et rapports d'intervention" },
    ],
    Screen: MaintenanceScreen,
  },
  {
    key: "reclamations",
    accentColor: "#E11D48",
    gradient: ["#881337", "#BE123C"] as [string, string],
    tag: "Réclamations & Litiges",
    title: "Chaque plainte\nprise en charge",
    subtitle: "Déposez, suivez et résolvez vos réclamations de façon transparente. Plus aucune doléance ne tombe dans l'oubli.",
    stats: [
      { icon: "check-circle" as const, value: "94%",  label: "Taux de résolution" },
      { icon: "clock" as const,        value: "48h",   label: "Délai de réponse moyen" },
    ],
    features: [
      { icon: "file-plus" as const,   text: "Dépôt de réclamation en 30 secondes" },
      { icon: "refresh-cw" as const,  text: "Suivi en temps réel du statut" },
      { icon: "message-square" as const, text: "Historique complet et réponses traçables" },
    ],
    Screen: ReclamationsScreen,
  },
  {
    key: "elections",
    accentColor: "#0284C7",
    gradient: ["#0C4A6E", "#075985"] as [string, string],
    tag: "Élections & Votes",
    title: "Votez en toute\néquité et sécurité",
    subtitle: "Candidature, campagne, vote électronique et résultats certifiés. Chaque voix compte, chaque décision est légale.",
    stats: [
      { icon: "check-circle" as const, value: "100%", label: "Intégrité des résultats" },
      { icon: "users" as const,        value: "4×",   label: "Participation accrue" },
    ],
    features: [
      { icon: "user-check" as const, text: "Processus de candidature et éligibilité" },
      { icon: "lock" as const,       text: "Vote chiffré et anonymisé" },
      { icon: "award" as const,      text: "Résultats et mandats générés automatiquement" },
    ],
    Screen: ElectionsScreen,
  },
  {
    key: "notifications",
    accentColor: "#0D9488",
    gradient: ["#134E4A", "#0F766E"] as [string, string],
    tag: "Centre de Notifications",
    title: "Ne manquez\njamais l'essentiel",
    subtitle: "Alertes temps réel, rappels de paiement, votes urgents et messages. Votre résidence communique intelligemment.",
    stats: [
      { icon: "bell" as const,       value: "−95%", label: "Informations manquées" },
      { icon: "zap" as const,        value: "<2 min", label: "Temps de réaction moyen" },
    ],
    features: [
      { icon: "bell" as const,       text: "Alertes prioritaires et rappels automatiques" },
      { icon: "layers" as const,     text: "Centre unifié : paiements, votes, documents" },
      { icon: "settings" as const,   text: "Préférences personnalisées par module" },
    ],
    Screen: NotificationsScreen,
  },
];

// ─── Single intro page ────────────────────────────────────────────────────────
function IntroPage({ item, isDark, scrollX, index }: {
  item: typeof PAGES[0];
  isDark: boolean;
  scrollX: Animated.Value;
  index: number;
}) {
  const Scr = item.Screen;
  const textFg    = isDark ? "#E8F0FE" : "#0A1628";
  const textSub   = isDark ? "rgba(232,240,254,0.58)" : "#475569";
  const featureBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.90)";
  const featureB  = isDark ? "rgba(255,255,255,0.07)" : `${item.accentColor}18`;

  // Parallax: mockup slides slightly faster than the page
  const inputRange = [(index - 1) * W, index * W, (index + 1) * W];
  const mockupTransX = scrollX.interpolate({
    inputRange,
    outputRange: [W * 0.15, 0, -W * 0.15],
    extrapolate: "clamp",
  });
  const mockupScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.88, 1, 0.88],
    extrapolate: "clamp",
  });
  const textOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });
  const textTransY = scrollX.interpolate({
    inputRange,
    outputRange: [18, 0, -18],
    extrapolate: "clamp",
  });

  // Reserve ~32% for header + progressBar + footer + safe areas
  const carouselH = H * 0.68;

  return (
    <ScrollView
      style={{ width: W, height: carouselH }}
      contentContainerStyle={st.page}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
    >
      {/* Mockup with parallax */}
      <Animated.View style={[st.mockupWrap, { transform: [{ translateX: mockupTransX }, { scale: mockupScale }] }]}>
        <PhoneMockup accentColor={item.accentColor} isDark={isDark}>
          <Scr isDark={isDark} />
        </PhoneMockup>
      </Animated.View>

      {/* Text block */}
      <Animated.View style={[st.textBlock, { opacity: textOpacity, transform: [{ translateY: textTransY }] }]}>
        {/* Module tag */}
        <View style={[st.tag, { backgroundColor: item.accentColor + "1E", borderColor: item.accentColor + "40" }]}>
          <View style={[st.tagDot, { backgroundColor: item.accentColor }]} />
          <Text style={[st.tagText, { color: item.accentColor }]}>{item.tag}</Text>
        </View>

        {/* Title */}
        <Text style={[st.title, { color: textFg }]}>{item.title}</Text>

        {/* Subtitle */}
        <Text style={[st.subtitle, { color: textSub }]}>{item.subtitle}</Text>

        {/* Stats row */}
        <View style={st.statsRow}>
          {item.stats.map((s) => (
            <View key={s.label} style={[st.statCard, { backgroundColor: featureBg, borderColor: featureB }]}>
              <View style={[st.statIcon, { backgroundColor: item.accentColor + "20" }]}>
                <Feather name={s.icon} size={14} color={item.accentColor} />
              </View>
              <Text style={[st.statValue, { color: item.accentColor }]}>{s.value}</Text>
              <Text style={[st.statLabel, { color: textSub }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Feature bullets */}
        <View style={st.features}>
          {item.features.map((f) => (
            <View key={f.text} style={[st.featureRow, { backgroundColor: featureBg, borderColor: featureB }]}>
              <View style={[st.featureIcon, { backgroundColor: item.accentColor + "18" }]}>
                <Feather name={f.icon} size={14} color={item.accentColor} />
              </View>
              <Text style={[st.featureText, { color: textFg }]}>{f.text}</Text>
              <Feather name="check" size={12} color={item.accentColor} />
            </View>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function IntroScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  // Stable ref so goNext always reads the latest index inside useCallback
  const activeIdxRef = useRef(0);

  const topPad = Platform.OS === "android"
    ? (StatusBar.currentHeight ?? 0) + 8
    : insets.top + 8;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollX.setValue(x);
      const idx = Math.round(x / W);
      if (idx !== activeIdxRef.current) {
        activeIdxRef.current = idx;
        setActiveIdx(idx);
        Haptics.selectionAsync();
      }
    },
    [scrollX],
  );

  const goNext = useCallback(() => {
    const current = activeIdxRef.current;
    if (current < PAGES.length - 1) {
      const nextIdx = current + 1;
      scrollRef.current?.scrollTo({ x: nextIdx * W, animated: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/get-started" as any);
    }
  }, []);

  const skip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/get-started" as any);
  }, []);

  const bg = isDark ? "#070D1A" : "#F8FAFF";
  const currentAccent = PAGES[activeIdx].accentColor;

  return (
    <View style={[st.root, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* Ambient glow backdrop */}
      <Animated.View
        style={[
          st.glow,
          {
            backgroundColor: currentAccent,
            top: isDark ? -60 : -80,
          },
        ]}
      />

      {/* Header: logo + skip */}
      <View style={[st.header, { paddingTop: topPad }]}>
        <View style={st.logoMark}>
          <View style={[st.logoHex, { borderColor: currentAccent + "50" }]}>
            <Text style={[st.logoHexText, { color: currentAccent }]}>V</Text>
          </View>
          <Text style={[st.logoWord, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
            VERIDIAN
          </Text>
        </View>
        <TouchableOpacity onPress={skip} style={[st.skipBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(37,99,235,0.08)" }]}>
          <Text style={[st.skipText, { color: isDark ? "rgba(232,240,254,0.7)" : "#475569" }]}>Ignorer</Text>
          <Feather name="chevrons-right" size={14} color={isDark ? "rgba(232,240,254,0.5)" : "#94A3B8"} />
        </TouchableOpacity>
      </View>

      {/* Dot progress bar */}
      <View style={st.progressBar}>
        {PAGES.map((_, i) => {
          const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [6, 22, 6],
            extrapolate: "clamp",
          });
          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: "clamp",
          });
          return (
            <Animated.View
              key={i}
              style={[
                st.dot,
                {
                  width: dotWidth,
                  opacity: dotOpacity,
                  backgroundColor: i === activeIdx ? currentAccent : (isDark ? "rgba(255,255,255,0.28)" : "rgba(30,64,175,0.25)"),
                },
              ]}
            />
          );
        })}
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: "flex-start" }}
      >
        {PAGES.map((item, index) => (
          <IntroPage key={item.key} item={item} isDark={isDark} scrollX={scrollX} index={index} />
        ))}
      </ScrollView>

      {/* Footer CTA */}
      <View style={[st.footer, { paddingBottom: insets.bottom + 16, borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(37,99,235,0.07)" }]}>
        {/* Page counter */}
        <Text style={[st.counter, { color: isDark ? "rgba(232,240,254,0.4)" : "#94A3B8" }]}>
          {activeIdx + 1} / {PAGES.length}
        </Text>

        {/* Next / Commencer */}
        <TouchableOpacity
          style={[st.nextBtn, { backgroundColor: currentAccent, shadowColor: currentAccent }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={PAGES[activeIdx].gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={st.nextBtnGrad}
          >
            {activeIdx === PAGES.length - 1 ? (
              <>
                <Feather name="check-circle" size={18} color="#fff" />
                <Text style={st.nextBtnText}>Commencer</Text>
              </>
            ) : (
              <>
                <Text style={st.nextBtnText}>Suivant</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Module name hint */}
        {activeIdx < PAGES.length - 1 && (
          <Text style={[st.nextHint, { color: isDark ? "rgba(232,240,254,0.35)" : "#94A3B8" }]}>
            Module suivant : {PAGES[activeIdx + 1].tag}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1 },

  glow: {
    position: "absolute",
    width: W * 1.4,
    height: W * 1.4,
    borderRadius: W * 0.7,
    left: -W * 0.2,
    opacity: 0.08,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 10,
  },
  logoMark: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoHex: {
    width: 32, height: 32, borderRadius: 9,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  logoHexText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  logoWord: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 3.5 },

  skipBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  skipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  progressBar: {
    flexDirection: "row", alignItems: "center", gap: 5,
    justifyContent: "center",
    paddingVertical: 6,
    zIndex: 10,
  },
  dot: { height: 6, borderRadius: 3 },

  page: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },

  mockupWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },

  textBlock: { width: "100%", alignItems: "center", gap: 8 },

  tag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },

  title: {
    fontSize: 23, fontFamily: "Inter_700Bold",
    textAlign: "center", lineHeight: 29,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12, fontFamily: "Inter_400Regular",
    textAlign: "center", lineHeight: 18,
    maxWidth: "92%",
  },

  statsRow: { flexDirection: "row", gap: 8, width: "100%" },
  statCard: {
    flex: 1, alignItems: "center", gap: 3,
    paddingVertical: 8, paddingHorizontal: 6,
    borderRadius: 12, borderWidth: 1,
  },
  statIcon: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 12 },

  features: { width: "100%", gap: 6 },
  featureRow: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 11, borderWidth: 1,
  },
  featureIcon: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 16 },

  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    alignItems: "center",
    zIndex: 10,
  },
  counter: { fontSize: 11, fontFamily: "Inter_400Regular" },

  nextBtn: {
    width: "100%", borderRadius: 18,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 8, overflow: "hidden",
  },
  nextBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15,
  },
  nextBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  nextHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
