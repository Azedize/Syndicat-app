import { db } from "@workspace/db";
import { syndicatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export function formatDate(d?: Date | string | null): string {
  if (!d) return "—";
  try {
    return new Date(d as string).toLocaleDateString("fr-MA", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

export function formatMoney(v?: number | string | null): string {
  if (v == null) return "0,00 MAD";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `${n.toFixed(2).replace(".", ",")} MAD`;
}

export function getSyndicate(syndicateId?: string | null) {
  if (!syndicateId) return null;
  return db
    .select()
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId))
    .then((r) => r[0] ?? null);
}

export function pageHeader(title: string, subtitle?: string) {
  return [
    { text: "MIZAN", style: "brand", margin: [0, 0, 0, 2] },
    { text: title, style: "header" },
    ...(subtitle ? [{ text: subtitle, style: "subheader" }] : []),
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 2,
          lineColor: "#2563EB",
        },
      ],
      margin: [0, 8, 0, 16],
    },
  ];
}
