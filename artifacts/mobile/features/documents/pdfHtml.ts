/**
 * HTML shell for in-app PDF and image previews (Android PDF; images on both
 * platforms). The file is passed as base64 bytes already downloaded into the
 * app's private cache — the page never fetches anything but the pdf.js library
 * itself, so no document URL is exposed to the web view and no CORS applies.
 *
 * PDF pages are rendered lazily: placeholders sized from the first page, and
 * a page is drawn only when it comes near the screen (IntersectionObserver),
 * then released when far away, so a long document does not exhaust memory.
 *
 * Messages to React Native: loaded {pages} · page {current,total} ·
 * error {kind: "password" | "invalid" | "unknown"}.
 */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136";

export function buildPdfHtml(base64: string, background: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=5,user-scalable=yes"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${background};min-height:100%}
#pages{padding:12px 10px 40px}
.page{position:relative;margin:0 auto 12px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.18);border-radius:2px;overflow:hidden}
.page canvas{display:block;width:100%;height:100%}
</style></head><body><div id="pages"></div>
<script type="module">
import * as pdfjsLib from '${PDFJS}/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.mjs';
const post = (type, data) => { try { window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data })); } catch (_) {} };
const b64 = ${JSON.stringify(base64)};
const raw = atob(b64); const bytes = new Uint8Array(raw.length);
for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
const container = document.getElementById('pages');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
let pdf, total = 0; const drawn = new Map();
async function draw(el, num) {
  if (drawn.has(num)) return;
  drawn.set(num, 'pending');
  try {
    const page = await pdf.getPage(num);
    const width = container.clientWidth - 20;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    el.style.height = (viewport.height / dpr) + 'px';
    el.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    drawn.set(num, canvas);
    page.cleanup();
  } catch (e) { drawn.delete(num); }
}
function release(el, num) {
  const c = drawn.get(num);
  if (c && c !== 'pending') { c.width = 0; c.height = 0; c.remove(); drawn.delete(num); }
}
(async () => {
  try {
    pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    total = pdf.numPages;
    const first = await pdf.getPage(1);
    const v = first.getViewport({ scale: 1 });
    const width = container.clientWidth - 20;
    const h = Math.round(width * v.height / v.width);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number(e.target.dataset.n);
        if (e.isIntersecting) draw(e.target, n); else release(e.target, n);
      }
    }, { rootMargin: '150% 0px' });
    for (let i = 1; i <= total; i++) {
      const el = document.createElement('div');
      el.className = 'page'; el.dataset.n = String(i);
      el.style.width = width + 'px'; el.style.height = h + 'px';
      el.setAttribute('aria-label', 'Page ' + i + ' / ' + total);
      container.appendChild(el); io.observe(el);
    }
    post('loaded', { pages: total });
    let last = 0;
    window.addEventListener('scroll', () => {
      const mid = window.scrollY + window.innerHeight / 2;
      let cur = 1;
      for (const el of container.children) { if (el.offsetTop <= mid) cur = Number(el.dataset.n); else break; }
      if (cur !== last) { last = cur; post('page', { current: cur, total }); }
    }, { passive: true });
  } catch (err) {
    const name = (err && err.name) || '';
    post('error', { kind: name === 'PasswordException' ? 'password' : name === 'InvalidPDFException' ? 'invalid' : 'unknown' });
  }
})();
</script></body></html>`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function buildImageHtml(base64: string, mimeType: string, background: string, alt: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=6,user-scalable=yes"/>
<style>html,body{margin:0;background:${background};min-height:100%;display:flex;align-items:center;justify-content:center}
img{max-width:100%;height:auto;display:block}</style></head>
<body><img alt="${escapeHtml(alt)}" src="data:${mimeType};base64,${base64}" onload="window.ReactNativeWebView.postMessage(JSON.stringify({type:'loaded',pages:1}))"
onerror="window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',kind:'invalid'}))"/></body></html>`;
}
