import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, G, Path, Pattern, Rect } from "react-native-svg";

interface ZelligePatternProps {
  /** Line color (white on the navy hero, the brand blue on light surfaces). */
  color?: string;
  opacity?: number;
  /** Tile size in px. */
  size?: number;
}

/**
 * MIZAN signature texture: an eight-pointed star lattice (khatam), the
 * geometry of Moroccan zellige, drawn as a hairline at very low opacity. It
 * sits behind content (absolute fill) and is ignored by screen readers.
 */
export default function ZelligePattern({ color = "#FFFFFF", opacity = 0.07, size = 44 }: ZelligePatternProps) {
  const s = size;
  const c = s / 2;
  const r = s * 0.3; // star radius
  const k = r * 0.7071; // r·cos 45°
  // Eight-pointed star = an upright square and a 45° square over each other.
  const square = `M ${c - k} ${c - k} H ${c + k} V ${c + k} H ${c - k} Z`;
  const diamond = `M ${c} ${c - r} L ${c + r} ${c} L ${c} ${c + r} L ${c - r} ${c} Z`;
  // Lattice: each star joins its neighbours through the tile edges.
  const links = `M ${c} 0 V ${c - r} M ${c} ${c + r} V ${s} M 0 ${c} H ${c - r} M ${c + r} ${c} H ${s}`;
  // Small diamonds where four tiles meet.
  const d = s * 0.08;
  const corner = (x: number, y: number) => `M ${x} ${y - d} L ${x + d} ${y} L ${x} ${y + d} L ${x - d} ${y} Z`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="mizan-zellige" patternUnits="userSpaceOnUse" width={s} height={s}>
            <G stroke={color} strokeWidth={1} fill="none" opacity={opacity}>
              <Path d={square} />
              <Path d={diamond} />
              <Path d={links} />
              <Path d={`${corner(0, 0)} ${corner(s, 0)} ${corner(0, s)} ${corner(s, s)}`} />
            </G>
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#mizan-zellige)" />
      </Svg>
    </View>
  );
}
