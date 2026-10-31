// Builds the brand SVG variants from one glyph. PNGs are rendered with
// @resvg/resvg-js (see DESIGN_SYSTEM.md, « Régénérer les assets »).
import fs from "fs";
const defs = `<defs>
  <linearGradient id="nuit" x1="0" y1="0" x2="88" y2="88" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2B2475"/><stop offset="1" stop-color="#14113A"/></linearGradient>
  <linearGradient id="laiton" x1="24" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#D9A94E"/><stop offset="0.5" stop-color="#F6DA94"/><stop offset="1" stop-color="#C99A3E"/></linearGradient>
</defs>`;
const glyph = (ink = "#F7F4EE", brass = "url(#laiton)", brassLine = "#E3B75C", pivot = "#8E82F5", postOpacity = 0.6) => `
  <path d="M22 68 V42 C22 30 32 22 44 15 C56 22 66 30 66 42 V68" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M44 37 V61" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity="${postOpacity}"/>
  <path d="M37 62 H51" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity="${postOpacity}"/>
  <g stroke="${brassLine}" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M33 37 L28.5 49 M33 37 L37.5 49"/><path d="M55 37 L50.5 49 M55 37 L59.5 49"/></g>
  <path d="M27 49 H39 A6 4.5 0 0 1 27 49 Z" fill="${brass}"/>
  <path d="M49 49 H61 A6 4.5 0 0 1 49 49 Z" fill="${brass}"/>
  <path d="M31 37 H57" stroke="${brass}" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="44" cy="37" r="3.8" fill="${pivot}"/>`;
// The glyph's optical centre is (44, 41.5); scale s around the tile centre.
const placed = (s, inner) => `<g transform="translate(44 44) scale(${s}) translate(-44 -41.5)">${inner}</g>`;
const svg = (body, bg = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="88" height="88">${defs}${bg}${body}</svg>\n`;
const out = {
  "mark-tile.svg": svg(placed(1, glyph()), `<rect width="88" height="88" rx="22" fill="url(#nuit)"/>`),
  // iOS masks the corners itself: full-bleed square.
  "icon.svg": svg(placed(0.86, glyph()), `<rect width="88" height="88" fill="url(#nuit)"/>`),
  // Android adaptive icon: content inside the 66 % safe zone, background set in app.json.
  "adaptive-foreground.svg": svg(placed(0.58, glyph())),
  "splash.svg": svg(placed(1, glyph())),
  // Notification icon: Android shows the alpha only, so a single color.
  "notification.svg": svg(placed(1, glyph("#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", 1))),
  // Mark on light surfaces (documents, light backgrounds).
  "mark-ink.svg": svg(placed(1, glyph("#1B1833", "url(#laiton)", "#C99A3E", "#5A4AD6", 0.55))),
};
for (const [name, content] of Object.entries(out)) fs.writeFileSync(new URL(name, import.meta.url), content);
console.log(Object.keys(out).join(" "));
