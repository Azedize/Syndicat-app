// Account deletion: in the app (POST /me/account/delete) and on a public web page that
// works without the app (GET and POST /account-deletion), as Google Play requires.
import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { emailLang, type EmailLang } from "../../lib/email/templates.js";
import { deleteAccount, type DeleteRefusal } from "./account.service.js";
import { PRIVACY_SECTIONS } from "./privacy-text.js";

const router = Router();

const REFUSAL_STATUS: Record<DeleteRefusal, number> = { BAD_CREDENTIALS: 401, PLATFORM_ADMIN: 403, LAST_ADMIN: 409 };

const REFUSAL_TEXT: Record<DeleteRefusal, Record<EmailLang, string>> = {
  BAD_CREDENTIALS: {
    fr: "Adresse e-mail ou mot de passe incorrect.",
    en: "Incorrect e-mail address or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    es: "Correo o contraseña incorrectos.",
  },
  PLATFORM_ADMIN: {
    fr: "Un compte d'administration de la plateforme ne peut pas être supprimé de cette façon.",
    en: "A platform administration account cannot be deleted this way.",
    ar: "لا يمكن حذف حساب إدارة المنصة بهذه الطريقة.",
    es: "Una cuenta de administración de la plataforma no puede eliminarse de esta forma.",
  },
  LAST_ADMIN: {
    fr: "Vous êtes le seul administrateur d'une copropriété ou d'une société : désignez d'abord un autre administrateur, puis recommencez.",
    en: "You are the only administrator of a condominium or company: appoint another administrator first, then try again.",
    ar: "أنت المسؤول الوحيد عن إقامة أو شركة: عيّن مسؤولًا آخر أولًا ثم أعد المحاولة.",
    es: "Usted es el único administrador de una comunidad o empresa: designe primero a otro administrador y vuelva a intentarlo.",
  },
};

const langOf = (req: Request): EmailLang => emailLang(typeof req.query.lang === "string" ? req.query.lang : req.headers["accept-language"]);

// ─── In the app ───────────────────────────────────────────────────────────────

router.post("/me/account/delete", requireAuth, async (req, res) => {
  const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Mot de passe requis", code: "PASSWORD_REQUIRED" });
  try {
    const result = await deleteAccount({ userId: req.user!.userId }, parsed.data.password);
    if (!result.ok) {
      return void res.status(REFUSAL_STATUS[result.code]).json({ error: REFUSAL_TEXT[result.code][langOf(req)], code: `ACCOUNT_DELETE_${result.code}` });
    }
    res.json({ message: "Compte supprimé" });
  } catch (err) {
    req.log.error({ err }, "account deletion failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Public page ──────────────────────────────────────────────────────────────

const PAGE: Record<EmailLang, { title: string; intro: string; erasedTitle: string; erased: string[]; keptTitle: string; kept: string[]; email: string; password: string; confirm: string; submit: string; forgot: string; done: string; missing: string; failed: string }> = {
  fr: {
    title: "Supprimer mon compte MIZAN",
    intro: "Cette page permet au titulaire d'un compte MIZAN de le supprimer sans passer par l'application. La suppression est immédiate et définitive.",
    erasedTitle: "Ce qui est supprimé",
    erased: ["Nom, adresse e-mail, téléphone, CIN, profession et photo du compte", "Sessions, codes et jeton de notification", "Véhicules, réservations visiteurs, favoris, panier et blocages", "Annonces en cours du marché et contenu de vos messages"],
    keptTitle: "Ce qui reste conservé",
    kept: ["Fiche de copropriétaire ou de locataire tenue par le syndic", "Écritures financières : appels de fonds, paiements, reçus", "Bulletins de vote, signatures de documents et registre du conseil syndical", "Journal d'audit de sécurité"],
    email: "Adresse e-mail du compte",
    password: "Mot de passe",
    confirm: "Je comprends que cette suppression est définitive.",
    submit: "Supprimer définitivement mon compte",
    forgot: "Mot de passe oublié : utilisez « Mot de passe oublié » dans l'application, puis revenez sur cette page.",
    done: "Votre compte a été supprimé.",
    missing: "Renseignez l'adresse e-mail et le mot de passe, puis cochez la confirmation.",
    failed: "La suppression n'a pas abouti. Réessayez plus tard.",
  },
  en: {
    title: "Delete my MIZAN account",
    intro: "This page lets the holder of a MIZAN account delete it without using the app. Deletion is immediate and permanent.",
    erasedTitle: "What is deleted",
    erased: ["Account name, e-mail address, phone, ID number, profession and photo", "Sessions, codes and notification token", "Vehicles, visitor bookings, favourites, cart and blocks", "Active marketplace listings and the content of your messages"],
    keptTitle: "What is kept",
    kept: ["Co-owner or tenant record held by the property manager", "Financial records: calls for funds, payments, receipts", "Ballots, document signatures and the council register", "Security audit log"],
    email: "Account e-mail address",
    password: "Password",
    confirm: "I understand that this deletion is permanent.",
    submit: "Permanently delete my account",
    forgot: "Forgotten password: use “Forgot password” in the app, then come back to this page.",
    done: "Your account has been deleted.",
    missing: "Enter the e-mail address and password, then tick the confirmation.",
    failed: "The deletion did not go through. Please try again later.",
  },
  ar: {
    title: "حذف حسابي في ميزان",
    intro: "تتيح هذه الصفحة لصاحب حساب ميزان حذفه دون استخدام التطبيق. الحذف فوري ونهائي.",
    erasedTitle: "ما يتم حذفه",
    erased: ["اسم الحساب والبريد الإلكتروني والهاتف ورقم البطاقة والمهنة والصورة", "الجلسات والرموز ورمز الإشعارات", "المركبات وحجوزات الزوار والمفضلة والسلة والحظر", "إعلانات السوق النشطة ومحتوى رسائلك"],
    keptTitle: "ما يبقى محفوظًا",
    kept: ["بطاقة المالك أو المكتري لدى وكيل الإقامة", "السجلات المالية: طلبات الأداء والمدفوعات والوصولات", "أوراق التصويت وتوقيعات الوثائق وسجل المجلس", "سجل التدقيق الأمني"],
    email: "البريد الإلكتروني للحساب",
    password: "كلمة المرور",
    confirm: "أفهم أن هذا الحذف نهائي.",
    submit: "حذف حسابي نهائيًا",
    forgot: "نسيت كلمة المرور؟ استخدم «نسيت كلمة المرور» في التطبيق ثم عد إلى هذه الصفحة.",
    done: "تم حذف حسابك.",
    missing: "أدخل البريد الإلكتروني وكلمة المرور ثم أكّد.",
    failed: "لم يكتمل الحذف. أعد المحاولة لاحقًا.",
  },
  es: {
    title: "Eliminar mi cuenta MIZAN",
    intro: "Esta página permite al titular de una cuenta MIZAN eliminarla sin usar la aplicación. La eliminación es inmediata y definitiva.",
    erasedTitle: "Qué se elimina",
    erased: ["Nombre, correo, teléfono, documento de identidad, profesión y foto de la cuenta", "Sesiones, códigos y token de notificaciones", "Vehículos, reservas de visitantes, favoritos, cesta y bloqueos", "Anuncios activos del mercado y el contenido de sus mensajes"],
    keptTitle: "Qué se conserva",
    kept: ["Ficha de propietario o inquilino que lleva el administrador", "Registros financieros: derramas, pagos y recibos", "Papeletas de voto, firmas de documentos y registro del consejo", "Registro de auditoría de seguridad"],
    email: "Correo de la cuenta",
    password: "Contraseña",
    confirm: "Entiendo que esta eliminación es definitiva.",
    submit: "Eliminar definitivamente mi cuenta",
    forgot: "¿Ha olvidado la contraseña? Use «¿Olvidó su contraseña?» en la aplicación y vuelva a esta página.",
    done: "Su cuenta ha sido eliminada.",
    missing: "Introduzca el correo y la contraseña y marque la confirmación.",
    failed: "La eliminación no se ha completado. Inténtelo más tarde.",
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function page(lang: EmailLang, notice?: { kind: "ok" | "error"; text: string }): string {
  const c = PAGE[lang];
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  const langs = (["fr", "ar", "en", "es"] as const).map((l) => `<a href="?lang=${l}"${l === lang ? ' aria-current="true"' : ""}>${l.toUpperCase()}</a>`).join(" · ");
  const form = notice?.kind === "ok" ? "" : `
    <form method="post" action="?lang=${lang}">
      <label>${esc(c.email)}<input type="email" name="email" autocomplete="username" required maxlength="254"></label>
      <label>${esc(c.password)}<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label>
      <label class="check"><input type="checkbox" name="confirm" value="yes" required> ${esc(c.confirm)}</label>
      <button type="submit">${esc(c.submit)}</button>
    </form>
    <p class="hint">${esc(c.forgot)}</p>`;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(c.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#F7F4EE;--card:#fff;--fg:#1B1833;--muted:#5B5870;--line:#E5DFD3;--danger:#B3261E;--ok:#0B7A5B}
@media (prefers-color-scheme:dark){:root{--bg:#0E0C1C;--card:#191630;--fg:#F4F2FA;--muted:#B5B1C9;--line:#2E2952;--danger:#FF8A80;--ok:#5FD3AE}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:560px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;line-height:1.25;margin:12px 0}h2{font-size:16px;margin:20px 0 6px}
nav{font-size:14px;color:var(--muted)}nav a{color:inherit}nav a[aria-current]{font-weight:700;color:var(--fg)}ul{margin:0;padding-inline-start:20px}li{margin:4px 0}
form{margin-top:24px;padding:16px;background:var(--card);border:1px solid var(--line);border-radius:12px}label{display:block;margin-bottom:14px;font-weight:600;font-size:14px}
input[type=email],input[type=password]{display:block;width:100%;margin-top:6px;padding:12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit;min-height:44px}
.check{font-weight:400;display:flex;gap:8px;align-items:flex-start}.check input{margin-top:4px}
button{width:100%;min-height:48px;padding:12px;border:0;border-radius:10px;background:#B3261E;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.hint{font-size:14px;color:var(--muted)}.notice{padding:12px 14px;border-radius:10px;border:1px solid currentColor;margin:16px 0;font-weight:600}.ok{color:var(--ok)}.error{color:var(--danger)}
</style></head><body><main>
<nav>MIZAN — ${langs}</nav>
<h1>${esc(c.title)}</h1>
${notice ? `<p class="notice ${notice.kind}" role="status">${esc(notice.text)}</p>` : ""}
<p>${esc(c.intro)}</p>
<h2>${esc(c.erasedTitle)}</h2>${list(c.erased)}
<h2>${esc(c.keptTitle)}</h2>${list(c.kept)}
${form}
</main></body></html>`;
}

/** Public link required by Google Play and the App Store. The text is the app's own screen. */
router.get("/legal/privacy", (_req, res) => {
  const fill = (html: string) =>
    html
      .replace(/\{\{LEGAL_ENTITY\}\}/g, esc(process.env.LEGAL_ENTITY?.trim() || "[raison sociale de l'exploitant — à compléter]"))
      .replace(/\{\{PRIVACY_EMAIL\}\}/g, esc(process.env.PRIVACY_EMAIL?.trim() || "[adresse à compléter]"));
  const body = PRIVACY_SECTIONS.map(
    (section) =>
      `<h2>${section.title}</h2>` +
      section.blocks.map((b) => (b.list ? `<ul><li>${fill(b.html)}</li></ul>` : `<p>${fill(b.html)}</p>`)).join(""),
  ).join("");
  res
    .type("html")
    .send(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MIZAN — Politique de confidentialité</title><style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px}h1{font-size:26px}h2{font-size:18px;margin-top:28px}ul{margin:4px 0;padding-inline-start:22px}</style></head><body><h1>Politique de confidentialité de MIZAN</h1>${body}</body></html>`,
    );
});

router.get("/account-deletion", (req, res) => {
  res.type("html").send(page(langOf(req)));
});

router.post("/account-deletion", async (req, res) => {
  const lang = langOf(req);
  const parsed = z
    .object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200), confirm: z.literal("yes") })
    .safeParse(req.body);
  if (!parsed.success) return void res.status(400).type("html").send(page(lang, { kind: "error", text: PAGE[lang].missing }));
  try {
    const result = await deleteAccount({ email: parsed.data.email }, parsed.data.password);
    if (!result.ok) {
      return void res.status(REFUSAL_STATUS[result.code]).type("html").send(page(lang, { kind: "error", text: REFUSAL_TEXT[result.code][lang] }));
    }
    res.type("html").send(page(lang, { kind: "ok", text: PAGE[lang].done }));
  } catch (err) {
    req.log.error({ err }, "account deletion (web) failed");
    res.status(500).type("html").send(page(lang, { kind: "error", text: PAGE[lang].failed }));
  }
});

export default router;
