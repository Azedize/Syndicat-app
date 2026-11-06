/**
 * Mistakes that compile, pass every API test and only break on a phone (2026-11-04). Static:
 *   pnpm --filter @workspace/scripts run native-rules:test
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const MOBILE = resolve(import.meta.dirname, "..", "..", "artifacts", "mobile");
const files: string[] = [];
for (const dir of ["app", "components", "features"]) {
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx")) files.push(p);
    }
  };
  walk(join(MOBILE, dir));
}

const problems: string[] = [];
const report = (file: string, rule: string, index: number, source: string) =>
  problems.push(`${relative(MOBILE, file).split(sep).join("/")}:${source.slice(0, index).split("\n").length} ${rule}`);

/** Index of the ")" closing the "(" at `open`, ignoring those inside strings and templates. */
function closing(source: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return source.length;
}

for (const file of files) {
  const source = readFileSync(file, "utf8");

  for (const m of source.matchAll(/\bAlert\.prompt\b/g)) {
    report(file, "Alert.prompt does nothing on Android: use askText", m.index, source);
  }

  // A plain Modal leaves its fields under the keyboard, unless the file handles the keyboard itself.
  const rnImport = source.match(/import(?: [A-Za-z]+,)? \{([^}]*)\} from "react-native"/);
  if (rnImport && /\bModal\b/.test(rnImport[1]) && !source.includes("KeyboardAvoidingView")) {
    report(file, "Modal from react-native: use components/ui/AppModal", rnImport.index ?? 0, source);
  }

  for (const m of source.matchAll(/behavior=\{Platform\.OS === "ios" \? "padding" : undefined\}/g)) {
    report(file, 'no keyboard handling on Android: use behavior="padding"', m.index, source);
  }

  // An Android dialog shows three buttons at most: the others cannot be reached.
  for (const m of source.matchAll(/Alert\.alert\(/g)) {
    const end = closing(source, m.index + "Alert.alert".length);
    const call = source.slice(m.index, end);
    if (/^Alert\.alert\([^[\n]*,\s*(options|actionOptions|buttons)\s*\)?$/.test(call)) {
      report(file, "dialog with a variable list of buttons: use showOptions", m.index, source);
    }
    if (/\.\.\.[A-Za-z_.]+\.map\(/.test(call)) {
      report(file, "dialog with generated buttons: use askChoice", m.index, source);
    }
  }

  // parseFloat("1500,50") gives 1500.
  for (const m of source.matchAll(/parseFloat\(((?:form\.|f\.)?[a-zA-Z]*(?:[aA]mount|[pP]rice|[rR]ent|[bB]alance))\)/g)) {
    report(file, `parseFloat on a typed amount (${m[1]}): use parseAmount`, m.index, source);
  }
}

for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${files.length - new Set(problems.map((p) => p.split(":")[0])).size}/${files.length} mobile files respect the native rules`);
process.exit(problems.length ? 1 : 0);
