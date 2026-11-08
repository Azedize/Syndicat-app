/**
 * Arabic text in pdfmake PDFs (right-to-left with Latin words and numbers).
 *
 * pdfmake 0.2 has no bidirectional support. Below it, fontkit shapes each
 * text fragment (Arabic letters joined correctly) and, when the fragment's
 * first letter is Arabic, reverses all its glyphs. Left alone, that gives:
 * spaces on the wrong side of words, Latin names and amounts misplaced,
 * parentheses facing the wrong way, and a fragment that starts with a Latin
 * word not reversed at all.
 *
 * This module therefore lays Arabic paragraphs out itself, before pdfmake:
 *   1. the paragraph is cut into lines by measuring words with the font;
 *   2. each line is split into direction runs (a simplified Unicode
 *      bidirectional algorithm for a right-to-left paragraph: Arabic runs,
 *      left-to-right runs of Latin words and numbers kept whole — amounts
 *      such as « 1 250,50 » and references such as « REC-2026-000191 » —,
 *      neutral characters taking the direction of their neighbours);
 *   3. the runs are given to pdfmake in visual order, one fragment per run:
 *      an Arabic run stays in reading order so that fontkit joins its letters
 *      and reverses it; brackets are mirrored; spaces become no-break spaces
 *      so that pdfmake does not cut the line again.
 * `fixArabicDocument` applies this to every text of a document definition,
 * following the width available in columns and tables.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

const ARABIC = /[؀-ٟ٪-ۯۺ-ࣿﭐ-﷿ﹰ-﻿]/;
const ARABIC_DIGIT = /[٠-٩۰-۹]/;
const DIGIT = /[0-9٠-٩۰-۹]/;
const LATIN = /\p{L}/u;
const SPACE = /[   \t]/;
const NUMBER_JOINER = /[,.:/\-%+   ]/;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«", "‹": "›", "›": "‹" };
const NBSP = " ";

export const hasArabic = (s: string): boolean => ARABIC.test(s);

type Dir = "R" | "L";

/** Direction of each character of a line in a right-to-left paragraph. */
function resolve(line: string): Dir[] {
  const chars = [...line];
  const strong: (Dir | null)[] = chars.map((c) => (ARABIC.test(c) ? "R" : DIGIT.test(c) || LATIN.test(c) ? "L" : null));
  // A space or separator between two digits belongs to the number (« 1 250,50 », « 2026-03-15 »).
  for (let i = 1; i < chars.length - 1; i++) {
    if (strong[i] === null && NUMBER_JOINER.test(chars[i]) && DIGIT.test(chars[i - 1])) {
      let j = i;
      while (j < chars.length && strong[j] === null && NUMBER_JOINER.test(chars[j])) j++;
      if (j < chars.length && DIGIT.test(chars[j]) && j - i <= 2) for (let k = i; k < j; k++) strong[k] = "L";
    }
  }
  // « % » right after a number stays with it.
  for (let i = 1; i < chars.length; i++) if (strong[i] === null && chars[i] === "%" && strong[i - 1] === "L") strong[i] = "L";
  // Neutral characters: the direction of both neighbours when they agree, else the paragraph's (R).
  const out: Dir[] = new Array(chars.length);
  for (let i = 0; i < chars.length; i++) {
    if (strong[i]) { out[i] = strong[i]!; continue; }
    let p = i - 1; while (p >= 0 && !strong[p]) p--;
    let n = i + 1; while (n < chars.length && !strong[n]) n++;
    const before: Dir = p >= 0 ? strong[p]! : "R";
    const after: Dir = n < chars.length ? strong[n]! : "R";
    out[i] = before === after ? before : "R";
  }
  return out;
}

/**
 * The fragments of one line, left to right on the page, ready for pdfmake
 * (fontkit reverses each Arabic fragment itself).
 */
export function visualFragments(line: string): string[] {
  const chars = [...line];
  if (!chars.length) return [];
  const dirs = resolve(line);
  const runs: { dir: Dir; text: string }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.dir === dirs[i]) last.text += chars[i];
    else runs.push({ dir: dirs[i], text: chars[i] });
  }
  return runs.reverse().map(({ dir, text }) => {
    let t = text;
    if (dir === "R") {
      t = [...t].map((c) => MIRROR[c] ?? c).join("");
      // Without an Arabic letter fontkit keeps the order: reverse it here.
      if (!ARABIC.test(t)) t = [...t].reverse().join("");
    } else if (ARABIC_DIGIT.test(t)) {
      // Arabic-Indic digits make fontkit reverse the fragment: pre-reverse it.
      t = [...t].reverse().join("");
    }
    return t.replace(/[ \t]/g, NBSP);
  });
}

// ── Measuring ──

/** fontkit as pdfmake uses it (pdfmake → @foliojs-fork/pdfkit → @foliojs-fork/fontkit). */
function loadFontkit(): any {
  try {
    return require("@foliojs-fork/fontkit");
  } catch {
    const viaPdfmake = createRequire(require.resolve("pdfmake"));
    return createRequire(viaPdfmake.resolve("@foliojs-fork/pdfkit"))("@foliojs-fork/fontkit");
  }
}

type Font = { unitsPerEm: number; layout: (s: string) => { advanceWidth: number } };
const fonts = new Map<string, Font | null>();
function loadFont(file: string): Font | null {
  if (!fonts.has(file)) {
    let f: Font | null = null;
    try {
      if (existsSync(file)) {
        const fontkit = loadFontkit();
        f = fontkit.openSync(file) as Font;
      }
    } catch {
      f = null;
    }
    fonts.set(file, f);
  }
  return fonts.get(file)!;
}

export interface ArabicFonts { normal: string; bold?: string }

function widthOf(text: string, fontSize: number, font: Font | null): number {
  if (!font) return text.length * fontSize * 0.5;
  return (font.layout(text).advanceWidth / font.unitsPerEm) * fontSize;
}

/** Lines of a paragraph (reading order), cut to `width` points. */
export function wrapLines(text: string, width: number, fontSize: number, font: Font | null): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/[ \t]+/).filter((w) => w.length);
    if (!words.length) { lines.push(""); continue; }
    const space = widthOf(" ", fontSize, font);
    let current = "";
    let w = 0;
    for (const word of words) {
      const ww = widthOf(word, fontSize, font);
      if (current && w + space + ww > width) {
        lines.push(current);
        current = word;
        w = ww;
      } else {
        current = current ? `${current} ${word}` : word;
        w = current === word ? ww : w + space + ww;
      }
    }
    lines.push(current);
  }
  return lines;
}

// ── pdfmake nodes ──

type Node = Record<string, unknown>;

function plainText(t: unknown): string | null {
  if (typeof t === "string" || typeof t === "number") return String(t);
  if (Array.isArray(t)) {
    const parts = t.map((p) => (typeof p === "string" || typeof p === "number" ? String(p) : p && typeof p === "object" ? plainText((p as Node).text) : ""));
    return parts.every((p) => p !== null) ? parts.join("") : null;
  }
  return null;
}

/**
 * A pdfmake text node for an Arabic paragraph: one line per row, each line's
 * runs in visual order. `width` is the space available in points.
 */
export interface ArabicLayoutOptions {
  /** Font given to the Arabic texts (documents whose font has no Arabic glyphs). */
  fontName?: string;
  /** Keep each text's alignment (an Arabic name in a French document). */
  keepAlignment?: boolean;
}

export function rtlParagraph(text: string, style: Node & { fontSize?: number; bold?: boolean }, width = 515, arabicFonts?: ArabicFonts, options: ArabicLayoutOptions = {}): Node {
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 10.5;
  const file = style.bold && arabicFonts?.bold ? arabicFonts.bold : arabicFonts?.normal;
  const font = file ? loadFont(file) : null;
  // A small margin: pdfmake must never need to cut a line again.
  const lines = wrapLines(text, Math.max(20, width * 0.96 - 2), fontSize, font);
  const alignment = options.keepAlignment ? style.alignment ?? "left" : style.alignment === "center" ? "center" : "right";
  const fontOverride = options.fontName ? { font: options.fontName } : {};
  const { text: _t, ...rest } = style as Node;
  if (lines.length === 1) return { ...rest, ...fontOverride, alignment, text: visualFragments(lines[0]).map((f) => ({ text: f })) };
  return { ...rest, ...fontOverride, alignment, stack: lines.map((l) => ({ text: l ? visualFragments(l).map((f) => ({ text: f })) : NBSP })) } as Node;
}

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
function horizontalMargin(m: unknown): number {
  if (typeof m === "number") return 2 * m;
  if (Array.isArray(m)) return m.length === 2 ? 2 * num(m[0]) : m.length === 4 ? num(m[0]) + num(m[2]) : 0;
  return 0;
}

/** Widths of `n` columns sharing `total` points (numbers, « * », « auto », « 50% »). */
function columnWidths(spec: unknown, n: number, total: number, gap = 0): number[] {
  const specs = Array.isArray(spec) ? spec : new Array(n).fill("*");
  const usable = Math.max(10, total - gap * Math.max(0, n - 1));
  let fixed = 0;
  let flex = 0;
  const out = specs.map((w) => {
    if (typeof w === "number") { fixed += w; return w; }
    if (typeof w === "string" && w.endsWith("%")) { const v = (parseFloat(w) / 100) * usable; fixed += v; return v; }
    flex++;
    return -1;
  });
  const share = flex ? Math.max(10, (usable - fixed) / flex) : 0;
  return out.map((w) => (w < 0 ? share : w));
}

/**
 * Applies the right-to-left layout to every Arabic text of a document
 * definition's content. `width` is the content width of the page.
 */
export function fixArabicDocument(content: unknown, width: number, arabicFonts?: ArabicFonts, styles: Record<string, Node> = {}, options: ArabicLayoutOptions = {}): unknown {
  const visit = (node: unknown, avail: number, style: Node): unknown => {
    if (typeof node === "string") return hasArabic(node) ? rtlParagraph(node, { ...style }, avail, arabicFonts, options) : node;
    if (Array.isArray(node)) return node.map((n) => visit(n, avail, style));
    if (!node || typeof node !== "object") return node;
    const o = node as Node;
    if (o.absolutePosition || o.relativePosition) return node; // positioned art: not reflowed
    const inner = Math.max(10, avail - horizontalMargin(o.margin));
    const childStyle: Node = { ...style };
    // Named styles ("style": "bodyArabic") give the size used for measuring.
    for (const name of Array.isArray(o.style) ? o.style : o.style ? [o.style] : []) {
      const st = typeof name === "string" ? styles[name] : undefined;
      if (st) for (const k of ["fontSize", "bold"]) if (st[k] !== undefined) childStyle[k] = st[k];
    }
    for (const k of ["fontSize", "bold"]) if (o[k] !== undefined) childStyle[k] = o[k];

    if (o.text !== undefined) {
      const t = plainText(o.text);
      if (t !== null && hasArabic(t)) return rtlParagraph(t, { ...o, ...childStyle }, inner, arabicFonts, options);
      if (Array.isArray(o.text)) return { ...o, text: o.text };
      return node;
    }
    const out: Node = { ...o };
    if (Array.isArray(o.stack)) out.stack = o.stack.map((n) => visit(n, inner, childStyle));
    if (Array.isArray(o.columns)) {
      const widths = columnWidths(o.columns.map((c) => (c && typeof c === "object" ? (c as Node).width ?? "*" : "*")), o.columns.length, inner, num(o.columnGap));
      out.columns = o.columns.map((c, i) => visit(c, widths[i], childStyle));
    }
    if (o.table && typeof o.table === "object") {
      const table = o.table as Node;
      const body = Array.isArray(table.body) ? (table.body as unknown[][]) : [];
      const n = Math.max(0, ...body.map((r) => (Array.isArray(r) ? r.length : 0)));
      const widths = columnWidths(table.widths, n, inner).map((w) => Math.max(10, w - 8)); // default cell padding 4 + 4
      out.table = { ...table, body: body.map((row) => (Array.isArray(row) ? row.map((cell, i) => visit(cell, widths[i] ?? inner, childStyle)) : row)) };
    }
    for (const k of ["ul", "ol"]) if (Array.isArray(o[k])) out[k] = (o[k] as unknown[]).map((n) => visit(n, inner - 14, childStyle));
    return out;
  };
  return visit(content, width, {});
}

/** Wraps a header/footer/background function so that its Arabic texts are laid out too. */
export function fixArabicDynamic<T extends (...args: any[]) => unknown>(fn: T, width: number, arabicFonts?: ArabicFonts, styles: Record<string, Node> = {}, options: ArabicLayoutOptions = {}): T {
  return ((...args: unknown[]) => fixArabicDocument(fn(...args), width, arabicFonts, styles, options)) as T;
}

/**
 * A document written in a Latin font that may contain Arabic data (a
 * co-owner's name, a label): registers Amiri in `fonts` and lays out its
 * Arabic texts right to left in Amiri, each keeping its own alignment.
 * Returns the document unchanged when it has no Arabic text or no Amiri font.
 */
export function withArabicData<D extends Record<string, unknown>>(docDef: D, fonts: Record<string, unknown>, amiri: ArabicFonts | null): D {
  if (!amiri || !hasArabic(JSON.stringify(docDef.content ?? ""))) return docDef;
  fonts.Amiri = { normal: amiri.normal, bold: amiri.bold ?? amiri.normal, italics: amiri.normal, bolditalics: amiri.bold ?? amiri.normal };
  const m = Array.isArray(docDef.pageMargins) ? (docDef.pageMargins as number[]) : typeof docDef.pageMargins === "number" ? [docDef.pageMargins, 0, docDef.pageMargins, 0] : [40, 40, 40, 40];
  const pageWidth = docDef.pageOrientation === "landscape" ? 841.89 : 595.28;
  const width = pageWidth - (m.length === 2 ? 2 * m[0] : m[0] + (m[2] ?? m[0]));
  const styles = (docDef.styles ?? {}) as Record<string, Node>;
  const options: ArabicLayoutOptions = { fontName: "Amiri", keepAlignment: true };
  const out: Record<string, unknown> = { ...docDef, content: fixArabicDocument(docDef.content, width, amiri, styles, options) };
  for (const k of ["header", "footer"]) {
    const v = docDef[k];
    if (typeof v === "function") out[k] = fixArabicDynamic(v as (...a: any[]) => unknown, width, amiri, styles, options);
    else if (v) out[k] = fixArabicDocument(v, width, amiri, styles, options);
  }
  return out as D;
}
