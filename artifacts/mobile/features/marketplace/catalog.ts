import type { Feather } from "@expo/vector-icons";

/**
 * Listing categories. The `value` is what the server stores and filters on
 * (French labels, kept for compatibility with existing listings); the label
 * shown is translated. Lower-case variants of older listings map to the same
 * entry.
 */
export const CATEGORIES: { value: string; labelKey: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: "Meubles", labelKey: "mkCatFurniture", icon: "box" },
  { value: "Électroménager", labelKey: "mkCatAppliances", icon: "zap" },
  { value: "Électronique", labelKey: "mkCatElectronics", icon: "smartphone" },
  { value: "Sport", labelKey: "mkCatSport", icon: "activity" },
  { value: "Livres", labelKey: "mkCatBooks", icon: "book-open" },
  { value: "Vêtements", labelKey: "mkCatClothing", icon: "shopping-bag" },
  { value: "Enfants", labelKey: "mkCatKids", icon: "smile" },
  { value: "Autre", labelKey: "mkCatOther", icon: "tag" },
];

const ALIASES: Record<string, string> = {
  "électroménager": "Électroménager",
  mobilier: "Meubles",
  meubles: "Meubles",
  literie: "Meubles",
  loisirs: "Sport",
  electronique: "Électronique",
  livres: "Livres",
  vetements: "Vêtements",
  sport: "Sport",
  autre: "Autre",
};

function entry(category: string | null | undefined) {
  const v = category ? ALIASES[category] ?? category : "Autre";
  return CATEGORIES.find((c) => c.value === v) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const categoryIcon = (c: string | null | undefined) => entry(c).icon;
export const categoryLabelKey = (c: string | null | undefined) => entry(c).labelKey;

// The conditions the API accepts (products.condition).
export const CONDITION_KEYS: Record<string, string> = {
  neuf: "mkCondNew",
  bon: "mkCondGood",
  acceptable: "mkCondFair",
  mauvais: "mkCondPoor",
};
export const conditionLabelKey = (c: string) => CONDITION_KEYS[c] ?? "mkCondGood";
