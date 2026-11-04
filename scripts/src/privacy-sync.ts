/**
 * The public privacy page of the API repeats the text of the app's privacy screen. Run this after
 * changing the screen, so both stores' public link and the app say the same thing:
 *
 *   pnpm --filter @workspace/scripts run privacy:sync
 *
 * `release:check` refuses a release when the two differ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SCREEN = join(ROOT, "artifacts", "mobile", "app", "privacy.tsx");
export const GENERATED = join(ROOT, "artifacts", "api-server", "src", "modules", "account", "privacy-text.ts");

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(jsx: string): string {
  const parts = jsx
    .replace(/\{CONTACT\.legalEntity \?\? "[^"]*"\}/g, "\u0001LEGAL\u0002")
    .replace(/\{CONTACT\.privacyEmail \?\? "[^"]*"\}/g, "\u0001EMAIL\u0002")
    .replace(/\s+/g, " ")
    .trim();
  return escapeHtml(parts)
    .replace(/&lt;Text style=\{\{ fontFamily: "Inter_600SemiBold" \}\}&gt;/g, "<strong>")
    .replace(/&lt;\/Text&gt;/g, "</strong>")
    .replace(/\u0001LEGAL\u0002/g, "{{LEGAL_ENTITY}}")
    .replace(/\u0001EMAIL\u0002/g, "{{PRIVACY_EMAIL}}");
}

export function renderPrivacyText(): string {
  const source = readFileSync(SCREEN, "utf8");
  const sections = [...source.matchAll(/<Section title="([^"]+)" isDark=\{isDark\}>([\s\S]*?)<\/Section>/g)].map(([, title, body]) => ({
    title,
    blocks: [...body.matchAll(/<(P|Li) isDark=\{isDark\}>([\s\S]*?)<\/\1>/g)].map(([, tag, text]) => ({
      list: tag === "Li",
      html: inline(text),
    })),
  }));
  if (sections.length < 10) throw new Error(`privacy-sync: only ${sections.length} sections found in the screen`);
  return `// Generated from artifacts/mobile/app/privacy.tsx by scripts/src/privacy-sync.ts. Do not edit.
export const PRIVACY_SECTIONS: { title: string; blocks: { list: boolean; html: string }[] }[] = ${JSON.stringify(sections, null, 2)};
`;
}

if (process.argv[1]?.endsWith("privacy-sync.ts")) {
  writeFileSync(GENERATED, renderPrivacyText());
  console.log("privacy-text.ts updated");
}
