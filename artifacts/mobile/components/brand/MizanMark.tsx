/**
 * The MIZAN mark: the arch of a riad courtyard holding a level balance.
 * Source of truth for the geometry: assets/brand/_build.mjs (viewBox 88).
 *
 * <MizanMark />           static, any size
 * <MizanMark animated />  launch choreography: the arch is drawn, then the
 *                         beam swings once and settles level (the « balance »
 *                         spring). Static under reduce motion.
 */
import React, { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { DURATION, SPRING } from "@/constants/motion";
import { useMotion } from "@/hooks/useMotion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const ARCH = "M22 68 V42 C22 30 32 22 44 15 C56 22 66 30 66 42 V68";
const ARCH_LENGTH = 128;
const PIVOT = { x: 44, y: 37 };
const HALF_BEAM = 13;

export type MarkTone = "onDark" | "onLight";

interface MizanMarkProps {
  size?: number;
  /** Draw the rounded Nuit tile behind the glyph (app-icon look). */
  tile?: boolean;
  tone?: MarkTone;
  animated?: boolean;
  /** Called when the launch choreography has settled. */
  onSettled?: () => void;
}

function beamPaths(theta: number) {
  "worklet";
  const dx = HALF_BEAM * Math.cos(theta);
  const dy = HALF_BEAM * Math.sin(theta);
  const lx = PIVOT.x - dx;
  const ly = PIVOT.y - dy;
  const rx = PIVOT.x + dx;
  const ry = PIVOT.y + dy;
  const pan = (x: number, y: number) =>
    `M${x - 6} ${y + 12} H${x + 6} A6 4.5 0 0 1 ${x - 6} ${y + 12} Z`;
  const strings = (x: number, y: number) => `M${x} ${y} L${x - 4.5} ${y + 12} M${x} ${y} L${x + 4.5} ${y + 12}`;
  return {
    beam: `M${lx} ${ly} L${rx} ${ry}`,
    strings: `${strings(lx, ly)} ${strings(rx, ry)}`,
    pans: `${pan(lx, ly)} ${pan(rx, ry)}`,
  };
}

const LEVEL = beamPaths(0);

export default function MizanMark({ size = 64, tile = false, tone = "onDark", animated = false, onSettled }: MizanMarkProps) {
  const { reduced } = useMotion();
  const play = animated && !reduced;
  const ink = tone === "onDark" ? "#F7F4EE" : "#1B1833";
  const pivot = tone === "onDark" ? "#8E82F5" : "#5A4AD6";
  const postOpacity = tone === "onDark" ? 0.6 : 0.55;

  const draw = useSharedValue(play ? 0 : 1);
  const theta = useSharedValue(play ? -0.32 : 0);
  const brass = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    if (!play) {
      onSettled?.();
      return;
    }
    draw.value = withTiming(1, { duration: 620, easing: Easing.bezier(0.65, 0, 0.35, 1) });
    brass.value = withDelay(380, withTiming(1, { duration: DURATION.base }));
    theta.value = withDelay(420, withSpring(0, SPRING.balance));
    // The spring settles visually within the signature duration.
    const t = setTimeout(() => onSettled?.(), DURATION.signature);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  const archProps = useAnimatedProps(() => ({ strokeDashoffset: ARCH_LENGTH * (1 - draw.value) }));
  const beamProps = useAnimatedProps(() => ({ d: beamPaths(theta.value).beam, opacity: brass.value }));
  const stringProps = useAnimatedProps(() => ({ d: beamPaths(theta.value).strings, opacity: brass.value }));
  const panProps = useAnimatedProps(() => ({ d: beamPaths(theta.value).pans, opacity: brass.value }));
  const postProps = useAnimatedProps(() => ({ opacity: postOpacity * brass.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 88 88" accessibilityRole="image" accessibilityLabel="MIZAN">
      <Defs>
        <LinearGradient id="mzNuit" x1="0" y1="0" x2="88" y2="88" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#2B2475" />
          <Stop offset="1" stopColor="#14113A" />
        </LinearGradient>
        <LinearGradient id="mzLaiton" x1="24" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#D9A94E" />
          <Stop offset="0.5" stopColor="#F6DA94" />
          <Stop offset="1" stopColor="#C99A3E" />
        </LinearGradient>
      </Defs>
      {tile ? <Rect width="88" height="88" rx="22" fill="url(#mzNuit)" /> : null}
      <AnimatedPath
        d={ARCH}
        fill="none"
        stroke={ink}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={play ? [ARCH_LENGTH, ARCH_LENGTH] : undefined}
        animatedProps={play ? archProps : undefined}
      />
      <G>
        <AnimatedPath d="M44 37 V61 M37 62 H51" stroke={ink} strokeWidth={3} strokeLinecap="round" opacity={postOpacity} animatedProps={play ? postProps : undefined} />
        <AnimatedPath d={LEVEL.strings} stroke="#E3B75C" strokeWidth={1.6} strokeLinecap="round" fill="none" animatedProps={play ? stringProps : undefined} />
        <AnimatedPath d={LEVEL.pans} fill="url(#mzLaiton)" animatedProps={play ? panProps : undefined} />
        <AnimatedPath d={LEVEL.beam} stroke="url(#mzLaiton)" strokeWidth={4.5} strokeLinecap="round" animatedProps={play ? beamProps : undefined} />
        <Circle cx={PIVOT.x} cy={PIVOT.y} r={3.8} fill={pivot} />
      </G>
    </Svg>
  );
}
