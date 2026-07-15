import React, { useCallback, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface SignaturePadProps {
  width: number;
  height: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  /** Fires whenever the drawn strokes change (empty string when cleared). */
  onChange?: (svgMarkup: string, isEmpty: boolean) => void;
}

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toSvg: () => string;
}

/**
 * Handwritten signature capture pad, built only from already-installed libs
 * (react-native-svg + PanResponder — no native signature-pad dependency).
 * Strokes are collected as an array of SVG path "d" strings and serialized
 * into a standalone <svg> document, which pdfmake can embed directly via its
 * native `svg` node type (no rasterization needed).
 */
const SignaturePad = React.forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ width, height, strokeColor = "#1e293b", strokeWidth = 2.5, backgroundColor = "#ffffff", onChange }, ref) => {
    const [paths, setPaths] = useState<string[]>([]);
    const currentPath = useRef<string>("");
    const [, forceRender] = useState(0);

    const buildSvg = useCallback(
      (allPaths: string[]) => {
        const pathTags = allPaths
          .map((d) => `<path d="${d}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`)
          .join("");
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
          `<rect width="${width}" height="${height}" fill="${backgroundColor}" />${pathTags}</svg>`;
      },
      [width, height, strokeColor, strokeWidth, backgroundColor],
    );

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: (evt) => {
            const { locationX, locationY } = evt.nativeEvent;
            currentPath.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
            forceRender((n) => n + 1);
          },
          onPanResponderMove: (evt) => {
            const { locationX, locationY } = evt.nativeEvent;
            currentPath.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
            forceRender((n) => n + 1);
          },
          onPanResponderRelease: () => {
            if (currentPath.current) {
              setPaths((prev) => {
                const next = [...prev, currentPath.current];
                onChange?.(buildSvg(next), next.length === 0);
                return next;
              });
              currentPath.current = "";
            }
          },
        }),
      [buildSvg, onChange],
    );

    React.useImperativeHandle(ref, () => ({
      clear: () => {
        setPaths([]);
        currentPath.current = "";
        onChange?.("", true);
      },
      isEmpty: () => paths.length === 0 && !currentPath.current,
      toSvg: () => buildSvg(currentPath.current ? [...paths, currentPath.current] : paths),
    }));

    return (
      <View style={[styles.wrap, { width, height, backgroundColor }]} {...panResponder.panHandlers}>
        <Svg width={width} height={height}>
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentPath.current ? (
            <Path d={currentPath.current} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>
      </View>
    );
  },
);

SignaturePad.displayName = "SignaturePad";
export default SignaturePad;

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: "hidden",
  },
});
