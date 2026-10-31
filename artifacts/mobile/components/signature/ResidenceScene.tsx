/**
 * ResidenceScene — MIZAN's signature 2.5D scene: the residence at dusk.
 *
 * An isometric drawing of the condominium's real buildings (count and floors
 * from /buildings, the resident's floor from /lots/my-lot). It answers a
 * spatial question at a glance — « where am I in this residence? » for a
 * resident, « what does my portfolio look like? » for a syndic — and is the
 * home screen's first impression.
 *
 * Motion: floors are laid bottom-up once (≈ 0.6 s), then the highlighted
 * floor lights up in brass. No loop. Static under reduce motion and on
 * low-memory devices (hooks/useMotion). Pure react-native-svg + Reanimated:
 * no extra native module.
 *
 * Nothing here is invented: a building without a known floor count is drawn
 * with a neutral height and no floor count is printed by the caller.
 */
import React, { useEffect, useMemo } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, G, Polygon, Polyline, RadialGradient, Rect, Stop } from "react-native-svg";
import { useMotion } from "@/hooks/useMotion";

const AnimatedG = Animated.createAnimatedComponent(G);

export interface SceneBuilding {
  id: string;
  name: string;
  /** Known floor count (above ground), or null when the record has none. */
  floors: number | null;
}

interface ResidenceSceneProps {
  buildings: SceneBuilding[];
  /** The resident's own lot: its building and floor (0 = ground floor). */
  highlight?: { buildingId: string; floor: number | null } | null;
  width: number;
  height: number;
  /** Accessible description of the scene (built by the caller from real data). */
  accessibilityLabel: string;
  onPress?: () => void;
  /** false: draw the final state at once (decorative uses, crowded screens). */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

const C30 = Math.cos(Math.PI / 6);
const FACE_W = 3; // windows across the front-left face
const FACE_D = 2; // windows across the front-right face
const GAP = 1.4;
const MAX_TOWERS = 4;
const NEUTRAL_FLOORS = 5;

// Dusk palette (on the Nuit hero).
const P = {
  /** Shadow side */
  left: "#17123F",
  /** Side lit by the setting sun */
  right: "#3A3196",
  top: "#5B50C4",
  edge: "rgba(255,255,255,0.14)",
  roof: "#E3B75C",
  window: "rgba(247,244,238,0.13)",
  lit: "#F6DA94",
  spill: "rgba(246,218,148,0.16)",
  ground: "rgba(255,255,255,0.05)",
};

type Pt = [number, number];

/** Tower height in world units: proportional up to 10 floors, then compressed. */
function towerHeight(floors: number) {
  return floors <= 10 ? floors : 10 + (floors - 10) * 0.35;
}

export default function ResidenceScene({ buildings, highlight, width, height, accessibilityLabel, onPress, animate = true, style }: ResidenceSceneProps) {
  const motion = useMotion();
  const rich = motion.rich && animate;
  const towers = buildings.slice(0, MAX_TOWERS);

  const layout = useMemo(() => {
    const specs = towers.map((b, i) => {
      const floors = b.floors && b.floors > 0 ? b.floors : NEUTRAL_FLOORS;
      return { b, floors, x0: i * (FACE_W + GAP), H: towerHeight(floors) };
    });
    const span = specs.length ? specs[specs.length - 1].x0 + FACE_W : FACE_W;
    const maxH = Math.max(1, ...specs.map((s) => s.H));
    // Projected extents (unit scale): x ∈ [-D·c, span·c], y ∈ [-maxH, (span + D)/2]
    const projW = (span + FACE_D) * C30;
    const projH = (span + FACE_D) / 2 + maxH;
    const pad = 12;
    const s = Math.min((width - pad * 2) / projW, (height - pad * 2) / projH);
    const ox = (width - projW * s) / 2 + FACE_D * C30 * s;
    const oy = (height - projH * s) / 2 + maxH * s;
    const P3 = (x: number, y: number, z: number): Pt => [ox + (x - y) * C30 * s, oy + (x + y) * 0.5 * s - z * s];
    return { specs, P3, s };
  }, [towers.map((t) => `${t.id}:${t.floors}`).join(","), width, height]);

  const progress = useSharedValue(rich ? 0 : 1);
  const glow = useSharedValue(rich ? 0 : 1);
  useEffect(() => {
    if (!rich) return;
    progress.value = withTiming(1, { duration: 650, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    glow.value = withDelay(560, withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rich]);

  const poly = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const { specs, P3 } = layout;
  const groundPts = (x0: number): Pt[] => [P3(x0 - 0.5, -0.5, 0), P3(x0 + FACE_W + 0.5, -0.5, 0), P3(x0 + FACE_W + 0.5, FACE_D + 0.5, 0), P3(x0 - 0.5, FACE_D + 0.5, 0)];

  const scene = (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="rsHalo" cx="50%" cy="62%" rx="55%" ry="45%">
          <Stop offset="0" stopColor="#7E70F2" stopOpacity="0.32" />
          <Stop offset="1" stopColor="#7E70F2" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#rsHalo)" />
      {specs.map(({ b, floors, x0, H }) => {
        const fh = H / floors;
        const litFloor = highlight && highlight.buildingId === b.id && highlight.floor !== null && highlight.floor >= 0 && highlight.floor < floors ? highlight.floor : null;
        return (
          <G key={b.id}>
            <Polygon points={poly(groundPts(x0))} fill={P.ground} />
            {Array.from({ length: floors }, (_, k) => (
              <Floor
                key={k}
                index={k}
                count={floors}
                progress={progress}
                glow={glow}
                lit={litFloor === k}
                isTop={k === floors - 1}
                x0={x0}
                z0={k * fh}
                fh={fh}
                P3={P3}
                poly={poly}
              />
            ))}
          </G>
        );
      })}
    </Svg>
  );

  return (
    <View style={style} accessible accessibilityRole={onPress ? "button" : "image"} accessibilityLabel={accessibilityLabel}>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          {scene}
        </Pressable>
      ) : (
        scene
      )}
    </View>
  );
}

interface FloorProps {
  index: number;
  count: number;
  progress: SharedValue<number>;
  glow: SharedValue<number>;
  lit: boolean;
  isTop: boolean;
  x0: number;
  z0: number;
  fh: number;
  P3: (x: number, y: number, z: number) => Pt;
  poly: (pts: Pt[]) => string;
}

function Floor({ index, count, progress, glow, lit, isTop, x0, z0, fh, P3, poly }: FloorProps) {
  const z1 = z0 + fh;
  const x1 = x0 + FACE_W;
  // Floor k appears while progress crosses its band (bottom first).
  const appear = useAnimatedProps(() => {
    const t = Math.min(1, Math.max(0, progress.value * (count + 1) - index));
    return { opacity: t };
  });
  const light = useAnimatedProps(() => ({ opacity: glow.value }));

  const left: Pt[] = [P3(x0, FACE_D, z0), P3(x1, FACE_D, z0), P3(x1, FACE_D, z1), P3(x0, FACE_D, z1)];
  const right: Pt[] = [P3(x1, 0, z0), P3(x1, FACE_D, z0), P3(x1, FACE_D, z1), P3(x1, 0, z1)];
  const top: Pt[] = [P3(x0, 0, z1), P3(x1, 0, z1), P3(x1, FACE_D, z1), P3(x0, FACE_D, z1)];
  const wz0 = z0 + fh * 0.28;
  const wz1 = z0 + fh * 0.72;
  const leftWindows = Array.from({ length: FACE_W }, (_, i): Pt[] => [
    P3(x0 + i + 0.24, FACE_D, wz0),
    P3(x0 + i + 0.76, FACE_D, wz0),
    P3(x0 + i + 0.76, FACE_D, wz1),
    P3(x0 + i + 0.24, FACE_D, wz1),
  ]);
  const rightWindows = Array.from({ length: FACE_D }, (_, j): Pt[] => [
    P3(x1, j + 0.24, wz0),
    P3(x1, j + 0.76, wz0),
    P3(x1, j + 0.76, wz1),
    P3(x1, j + 0.24, wz1),
  ]);
  const windows = [...leftWindows, ...rightWindows];

  return (
    <AnimatedG animatedProps={appear}>
      <Polygon points={poly(left)} fill={P.left} stroke={P.edge} strokeWidth={0.6} />
      <Polygon points={poly(right)} fill={P.right} stroke={P.edge} strokeWidth={0.6} />
      {isTop ? (
        <>
          <Polygon points={poly(top)} fill={P.top} stroke={P.edge} strokeWidth={0.6} />
          {/* Brass roof edge: the balance line, on the residence itself */}
          <Polyline points={poly([left[3], left[2], right[3]])} fill="none" stroke={P.roof} strokeOpacity={0.7} strokeWidth={1.2} strokeLinejoin="round" />
        </>
      ) : null}
      {windows.map((w, i) => (
        <Polygon key={i} points={poly(w)} fill={P.window} />
      ))}
      {lit ? (
        <AnimatedG animatedProps={light}>
          <Polygon points={poly(left)} fill={P.spill} />
          <Polygon points={poly(right)} fill={P.spill} />
          {windows.map((w, i) => (
            <Polygon key={i} points={poly(w)} fill={P.lit} />
          ))}
        </AnimatedG>
      ) : null}
    </AnimatedG>
  );
}
