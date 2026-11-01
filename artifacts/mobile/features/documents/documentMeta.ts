import type { Feather } from "@expo/vector-icons";
import type { StatusTone } from "@/components/ui/tone";

/**
 * Presentation of library documents from their REAL metadata (category,
 * MIME type, size, version, dates). Nothing here is invented: an unknown
 * category is humanised, a missing value is simply not shown.
 */

type T = (key: string) => string;

/** Family of a category (library categories and generated-document categories). */
type Family = "rules" | "meetings" | "finance" | "notices" | "certificates" | "contracts" | "upkeep" | "insurance" | "legal" | "admin" | "other";

const FAMILY: Record<string, Family> = {
  reglement: "rules",
  reglement_interieur: "rules",
  bail: "contracts",
  proces_verbal: "meetings",
  pv: "meetings",
  "compte-rendu": "meetings",
  compte_rendu: "meetings",
  financier: "finance",
  finance: "finance",
  finances: "finance",
  avis: "notices",
  attestation: "certificates",
  contrat: "contracts",
  maintenance: "upkeep",
  entretien: "upkeep",
  technique: "upkeep",
  assurance: "insurance",
  juridique: "legal",
  "légal": "legal",
  legal: "legal",
  administratif: "admin",
  autre: "other",
};

const FAMILY_STYLE: Record<Family, { icon: keyof typeof Feather.glyphMap; tone: StatusTone }> = {
  rules: { icon: "book-open", tone: "primary" },
  meetings: { icon: "users", tone: "info" },
  finance: { icon: "bar-chart-2", tone: "success" },
  notices: { icon: "bell", tone: "warning" },
  certificates: { icon: "award", tone: "primary" },
  contracts: { icon: "file-text", tone: "neutral" },
  upkeep: { icon: "tool", tone: "warning" },
  insurance: { icon: "shield", tone: "info" },
  legal: { icon: "briefcase", tone: "neutral" },
  admin: { icon: "folder", tone: "neutral" },
  other: { icon: "file", tone: "neutral" },
};

const keyOf = (category: string) =>
  category
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-/g, "_")
    .toLowerCase();

/** Translated category label; an unknown category is humanised (never a raw code). */
export function categoryLabel(category: string | null | undefined, t: T): string {
  if (!category) return "";
  const key = `dlCat_${keyOf(category)}`;
  const label = t(key);
  if (label !== key) return label;
  const h = category.replace(/[_-]+/g, " ").trim();
  return h.charAt(0).toUpperCase() + h.slice(1);
}

export function categoryStyle(category: string | null | undefined) {
  return FAMILY_STYLE[FAMILY[category ?? ""] ?? FAMILY[keyOf(category ?? "")] ?? "other"];
}

/** Short format label from the verified MIME type (or the file extension). */
export function formatLabel(mimeType: string | null | undefined, fileName?: string | null): string {
  const m = mimeType ?? "";
  if (m === "application/pdf") return "PDF";
  if (m === "image/jpeg") return "JPG";
  if (m === "image/png") return "PNG";
  if (m === "image/webp") return "WEBP";
  if (m === "image/heic") return "HEIC";
  if (m === "text/plain") return "TXT";
  if (m === "text/csv") return "CSV";
  if (m.includes("wordprocessingml") || m === "application/msword") return "WORD";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel") return "EXCEL";
  const ext = fileName?.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return ext ? ext.toUpperCase() : "";
}

/** Icon of the file type (shown with the format label, never color alone). */
export function formatIcon(mimeType: string | null | undefined): keyof typeof Feather.glyphMap {
  const m = mimeType ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv") return "grid";
  if (m === "application/pdf" || m.includes("word") || m.startsWith("text/")) return "file-text";
  return "file";
}

export type PreviewKind = "pdf" | "image" | "text" | "none";

/** How the app can preview a file. HEIC is only decoded natively on iOS. */
export function previewKind(mimeType: string | null | undefined, platform: string): PreviewKind {
  const m = mimeType ?? "";
  if (m === "application/pdf") return "pdf";
  if (m === "image/jpeg" || m === "image/png" || m === "image/webp") return "image";
  if (m === "image/heic") return platform === "ios" ? "image" : "none";
  if (m === "text/plain" || m === "text/csv") return "text";
  return "none";
}

/** Localised size ("1,2 Mo"). */
export function sizeLabel(bytes: number | null | undefined, locale: string, t: T): string {
  if (!bytes || bytes <= 0) return "";
  const [kb, mb] = t("dlUnitSize").split("|");
  const nf = (n: number, d: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(n);
  return bytes < 1024 * 1024 ? `${nf(Math.max(1, Math.round(bytes / 1024)), 0)} ${kb}` : `${nf(bytes / 1024 / 1024, 1)} ${mb}`;
}

const NEW_DAYS = 14;

/** Published in the last 14 days (from the real publication date). */
export function isRecentlyPublished(publishedAt: string | null | undefined, now = Date.now()): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  return Number.isFinite(t) && now - t >= 0 && now - t < NEW_DAYS * 86_400_000;
}
