import { Feather as BaseFeather } from "@expo/vector-icons";
import React from "react";

import { useLanguage } from "@/context/LanguageContext";

/**
 * Feather icons that follow the reading direction.
 *
 * Mirroring the layout (I18nManager on native, `direction: rtl` on web) does
 * not mirror glyphs: a « next » chevron still points right in Arabic. This
 * drop-in replacement swaps the directional glyphs when the language reads
 * right-to-left, so screens write the left-to-right name once
 * (`name="chevron-right"`) and never branch on `isRTL` themselves.
 */
const MIRROR: Record<string, string> = {
  "chevron-right": "chevron-left",
  "chevron-left": "chevron-right",
  "chevrons-right": "chevrons-left",
  "chevrons-left": "chevrons-right",
  "arrow-right": "arrow-left",
  "arrow-left": "arrow-right",
  "arrow-up-right": "arrow-up-left",
  "arrow-up-left": "arrow-up-right",
  "arrow-down-right": "arrow-down-left",
  "arrow-down-left": "arrow-down-right",
  "corner-up-left": "corner-up-right",
  "corner-up-right": "corner-up-left",
  "corner-down-right": "corner-down-left",
  "corner-down-left": "corner-down-right",
};

type Props = React.ComponentProps<typeof BaseFeather>;

function DirectionalFeather(props: Props) {
  const { isRTL } = useLanguage();
  const name = (isRTL && MIRROR[props.name as string]) || props.name;
  return <BaseFeather {...props} name={name as Props["name"]} />;
}

export const Feather = Object.assign(DirectionalFeather, { glyphMap: BaseFeather.glyphMap });
export const mirroredGlyph = (name: string, isRTL: boolean) => (isRTL && MIRROR[name]) || name;
