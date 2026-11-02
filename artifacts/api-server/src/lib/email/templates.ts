/**
 * Reusable HTML email templates for MIZAN.
 *
 * Every template returns `{ subject, html }`. The `html` is the inner body only —
 * `EmailService.send()` wraps it in `wrapEmail()` so every outgoing email shares the
 * same branded header/footer, regardless of which flow triggered it.
 */

const BRAND_NAVY  = "#0B1F3A";   // MIZAN navyDeep — header background
const BRAND_BLUE  = "#1F5EFF";   // MIZAN blue — action color, buttons
const BRAND_COLOR = BRAND_BLUE;  // legacy alias kept for button() helper

/** Shared branded shell every email body gets wrapped in. */
export type EmailLang = "fr" | "en" | "ar" | "es";

const FOOTER: Record<EmailLang, string> = {
  fr: "Cet email a été envoyé automatiquement par la plateforme MIZAN — Gouvernance &amp; gestion des résidences.<br/>Ne répondez pas directement à ce message.",
  en: "This email was sent automatically by the MIZAN platform — residence governance &amp; management.<br/>Please do not reply to this message.",
  ar: "أُرسلت هذه الرسالة تلقائيًا من منصة ميزان لتسيير وإدارة الإقامات.<br/>يُرجى عدم الرد على هذه الرسالة.",
  es: "Este correo fue enviado automáticamente por la plataforma MIZAN — gobernanza y gestión de residencias.<br/>No responda a este mensaje.",
};

const TAGLINE: Record<EmailLang, string> = {
  fr: "GOUVERNANCE &amp; GESTION DES RÉSIDENCES",
  en: "RESIDENCE GOVERNANCE &amp; MANAGEMENT",
  ar: "تسيير وإدارة الإقامات",
  es: "GOBERNANZA Y GESTIÓN DE RESIDENCIAS",
};

export function wrapEmail(preheader: string, bodyHtml: string, lang: EmailLang = "fr"): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";
  return `
  <!DOCTYPE html>
  <html lang="${lang}" dir="${dir}">
    <body dir="${dir}" style="margin:0;padding:0;background:#EFF6FF;font-family:Helvetica,Arial,sans-serif;text-align:${align};">
      <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;padding:28px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(10,22,40,0.10);">
              <!-- Header -->
              <tr>
                <td style="background:${BRAND_NAVY};padding:0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:20px 32px 16px 32px;">
                        <!-- Shield mark (CSS-only simplified) -->
                        <table role="presentation" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="vertical-align:middle;padding-right:14px;">
                              <div style="width:38px;height:44px;background:linear-gradient(160deg,${BRAND_BLUE},#20B8A6);border-radius:4px 4px 6px 6px;display:inline-block;text-align:center;line-height:44px;">
                                <span style="color:#fff;font-size:18px;font-weight:900;">M</span>
                              </div>
                            </td>
                            <td style="vertical-align:middle;">
                              <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:3px;font-family:Helvetica,Arial,sans-serif;">MIZAN</div>
                              <div style="color:#8DB2FF;font-size:10px;font-weight:600;letter-spacing:${lang === "ar" ? "0" : "2px"};margin-top:2px;font-family:Helvetica,Arial,sans-serif;">${TAGLINE[lang]}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <!-- Brand accent stripe -->
                    <tr>
                      <td style="height:3px;background:linear-gradient(90deg,${BRAND_BLUE},#20B8A6,${BRAND_BLUE});"></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:36px 32px;color:#1e2d4a;font-size:14px;line-height:1.7;">
                  ${bodyHtml}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px 24px;background:#F8FAFF;border-top:1px solid #DBEAFE;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin:0 0 4px 0;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:1px;">MIZAN</p>
                        <p style="margin:0;color:#64748B;font-size:10px;line-height:1.5;">
                          ${FOOTER[lang]}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${url}" style="background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(label)}</a></p>`;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  /** Plain-text alternative; derived from the HTML when absent. */
  text?: string;
  lang?: EmailLang;
}

/** A language MIZAN supports, from a stored preference (users.language) or a header. */
export function emailLang(value: string | null | undefined): EmailLang {
  const v = (value ?? "").slice(0, 2).toLowerCase();
  return v === "en" || v === "ar" || v === "es" ? v : "fr";
}

const RESET_CODE_COPY: Record<EmailLang, { subject: string; hello: (n: string) => string; intro: string; label: string; expiry: (m: number) => string; ignore: string; never: string; sign: string }> = {
  fr: {
    subject: "Votre code de réinitialisation MIZAN",
    hello: (n) => `Bonjour ${n},`,
    intro: "Vous avez demandé à réinitialiser le mot de passe de votre compte MIZAN. Saisissez ce code dans l'application :",
    label: "Code de réinitialisation",
    expiry: (m) => `Ce code expire dans <strong>${m} minutes</strong> et ne peut être utilisé qu'une seule fois.`,
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste valable.",
    never: "MIZAN ne vous demandera jamais ce code par téléphone ou par message.",
    sign: "— L'équipe MIZAN",
  },
  en: {
    subject: "Your MIZAN password reset code",
    hello: (n) => `Hello ${n},`,
    intro: "You asked to reset the password of your MIZAN account. Enter this code in the app:",
    label: "Reset code",
    expiry: (m) => `This code expires in <strong>${m} minutes</strong> and can only be used once.`,
    ignore: "If you did not make this request, ignore this email: your current password stays valid.",
    never: "MIZAN will never ask you for this code by phone or message.",
    sign: "— The MIZAN team",
  },
  ar: {
    subject: "رمز إعادة تعيين كلمة المرور في ميزان",
    hello: (n) => `مرحبًا ${n}،`,
    intro: "طلبتَ إعادة تعيين كلمة مرور حسابك في ميزان. أدخل هذا الرمز في التطبيق:",
    label: "رمز إعادة التعيين",
    expiry: (m) => `تنتهي صلاحية هذا الرمز بعد <strong>${m} دقائق</strong> ولا يُستخدم إلا مرة واحدة.`,
    ignore: "إذا لم تكن صاحب هذا الطلب، تجاهل هذه الرسالة: كلمة مرورك الحالية تبقى صالحة.",
    never: "لن تطلب منك ميزان هذا الرمز أبدًا عبر الهاتف أو الرسائل.",
    sign: "— فريق ميزان",
  },
  es: {
    subject: "Su código para restablecer la contraseña de MIZAN",
    hello: (n) => `Hola ${n}:`,
    intro: "Ha solicitado restablecer la contraseña de su cuenta MIZAN. Introduzca este código en la aplicación:",
    label: "Código de restablecimiento",
    expiry: (m) => `Este código caduca en <strong>${m} minutos</strong> y solo puede usarse una vez.`,
    ignore: "Si no ha realizado esta solicitud, ignore este correo: su contraseña actual sigue siendo válida.",
    never: "MIZAN nunca le pedirá este código por teléfono o mensaje.",
    sign: "— El equipo de MIZAN",
  },
};

/** Six-digit password reset code (the code travels only in this email). */
export function passwordResetCodeTemplate(name: string, code: string, minutes: number, lang: EmailLang = "fr"): EmailTemplate {
  const c = RESET_CODE_COPY[lang];
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  return {
    lang,
    subject: c.subject,
    html: `
      <p style="margin:0 0 12px 0;">${escapeHtml(c.hello(name))}</p>
      <p style="margin:0 0 20px 0;">${c.intro}</p>
      <div style="margin:0 0 20px 0;padding:18px 20px;background:#EFF6FF;border:2px solid ${BRAND_BLUE};border-radius:12px;text-align:center;">
        <div style="font-size:11px;letter-spacing:1px;color:#475569;text-transform:uppercase;margin-bottom:6px;">${c.label}</div>
        <div dir="ltr" style="font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND_BLUE};font-family:'Courier New',monospace;">${code}</div>
      </div>
      <p style="margin:0 0 12px 0;">${c.expiry(minutes)}</p>
      <p style="margin:0 0 12px 0;color:#475569;">${c.ignore}</p>
      <p style="margin:0 0 16px 0;color:#475569;font-size:12px;">${c.never}</p>
      <p style="margin:0;">${c.sign}</p>`,
    text: [c.hello(name), "", c.intro, "", `${c.label} : ${code}`, "", strip(c.expiry(minutes)), "", c.ignore, c.never, "", c.sign].join("\n"),
  };
}

const PASSWORD_CHANGED_COPY: Record<EmailLang, { subject: string; hello: (n: string) => string; body: (d: string) => string; notYou: string; sign: string }> = {
  fr: {
    subject: "Votre mot de passe MIZAN a été modifié",
    hello: (n) => `Bonjour ${n},`,
    body: (d) => `Le mot de passe de votre compte MIZAN a été réinitialisé le ${d}. Toutes vos sessions ouvertes ont été fermées.`,
    notYou: "Si vous n'êtes pas à l'origine de ce changement, réinitialisez immédiatement votre mot de passe depuis l'application et contactez votre syndic.",
    sign: "— L'équipe MIZAN",
  },
  en: {
    subject: "Your MIZAN password was changed",
    hello: (n) => `Hello ${n},`,
    body: (d) => `The password of your MIZAN account was reset on ${d}. All your open sessions have been signed out.`,
    notYou: "If you did not make this change, reset your password from the app right away and contact your property manager.",
    sign: "— The MIZAN team",
  },
  ar: {
    subject: "تم تغيير كلمة مرور حسابك في ميزان",
    hello: (n) => `مرحبًا ${n}،`,
    body: (d) => `أُعيد تعيين كلمة مرور حسابك في ميزان بتاريخ ${d}. وقد أُغلقت جميع جلساتك المفتوحة.`,
    notYou: "إذا لم تقم بهذا التغيير، أعد تعيين كلمة المرور فورًا من التطبيق وتواصل مع وكيل الإقامة.",
    sign: "— فريق ميزان",
  },
  es: {
    subject: "Se ha cambiado su contraseña de MIZAN",
    hello: (n) => `Hola ${n}:`,
    body: (d) => `La contraseña de su cuenta MIZAN se restableció el ${d}. Se han cerrado todas sus sesiones abiertas.`,
    notYou: "Si no ha realizado este cambio, restablezca su contraseña desde la aplicación de inmediato y contacte con su administrador.",
    sign: "— El equipo de MIZAN",
  },
};

/** Security notice after a password reset (contains no secret). */
export function passwordChangedTemplate(name: string, when: Date, lang: EmailLang = "fr"): EmailTemplate {
  const c = PASSWORD_CHANGED_COPY[lang];
  const locale = { fr: "fr-FR", en: "en-GB", ar: "ar-MA", es: "es-ES" }[lang];
  const d = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(when);
  return {
    lang,
    subject: c.subject,
    html: `
      <p style="margin:0 0 12px 0;">${escapeHtml(c.hello(name))}</p>
      <p style="margin:0 0 12px 0;">${escapeHtml(c.body(d))}</p>
      <p style="margin:0 0 16px 0;color:#475569;">${escapeHtml(c.notYou)}</p>
      <p style="margin:0;">${c.sign}</p>`,
    text: [c.hello(name), "", c.body(d), "", c.notYou, "", c.sign].join("\n"),
  };
}

// Suppress unused warning — BRAND_NAVY used in wrapEmail above
void BRAND_NAVY;

export function passwordResetTemplate(name: string, resetUrl: string): EmailTemplate {
  // Extract the raw token from the URL for display as a fallback code
  let rawToken = "";
  try {
    const url = new URL(resetUrl);
    rawToken = url.searchParams.get("token") ?? "";
  } catch {
    // resetUrl may not be a valid URL (e.g. APP_URL not set) — token won't be extracted
  }

  const tokenBlock = rawToken
    ? `<div style="margin:20px 0;padding:16px 20px;background:#f4f4f5;border-radius:10px;border:1px solid #e4e4e7;">
        <p style="margin:0 0 8px 0;font-size:12px;color:#71717a;font-family:monospace;">CODE DE RÉINITIALISATION (64 caractères)</p>
        <p style="margin:0;font-size:11px;color:#18181b;font-family:monospace;word-break:break-all;letter-spacing:0.5px;">${rawToken}</p>
        <p style="margin:8px 0 0 0;font-size:11px;color:#71717a;">Collez ce code dans l'application si le bouton ne fonctionne pas.</p>
      </div>`
    : "";

  return {
    subject: "Réinitialisation de votre mot de passe — MIZAN",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe MIZAN.</p>
      ${button(resetUrl, "Réinitialiser mon mot de passe")}
      ${tokenBlock}
      <p>Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas effectué cette demande, ignorez cet email.</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

type CodeKind = "signup" | "email_change";
const VERIFY_COPY: Record<EmailLang, { subject: Record<CodeKind, string>; intro: Record<CodeKind, string>; label: string; expiry: (m: number) => string; ignore: string; never: string; sign: string }> = {
  fr: {
    subject: { signup: "Votre code de vérification MIZAN", email_change: "Confirmez votre nouvelle adresse e-mail MIZAN" },
    intro: { signup: "Utilisez ce code pour finaliser la création de votre compte MIZAN :", email_change: "Utilisez ce code pour confirmer cette adresse comme nouvelle adresse de votre compte MIZAN :" },
    label: "Code de vérification",
    expiry: (m) => `Ce code expire dans <strong>${m} minutes</strong> et ne peut être utilisé qu'une seule fois.`,
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    never: "MIZAN ne vous demandera jamais ce code par téléphone ou par message.",
    sign: "— L'équipe MIZAN",
  },
  en: {
    subject: { signup: "Your MIZAN verification code", email_change: "Confirm your new MIZAN e-mail address" },
    intro: { signup: "Use this code to finish creating your MIZAN account:", email_change: "Use this code to confirm this address as the new address of your MIZAN account:" },
    label: "Verification code",
    expiry: (m) => `This code expires in <strong>${m} minutes</strong> and can only be used once.`,
    ignore: "If you did not make this request, ignore this email.",
    never: "MIZAN will never ask you for this code by phone or message.",
    sign: "— The MIZAN team",
  },
  ar: {
    subject: { signup: "رمز التحقق الخاص بك في ميزان", email_change: "أكّد عنوان بريدك الإلكتروني الجديد في ميزان" },
    intro: { signup: "استخدم هذا الرمز لإتمام إنشاء حسابك في ميزان:", email_change: "استخدم هذا الرمز لتأكيد هذا العنوان كعنوان جديد لحسابك في ميزان:" },
    label: "رمز التحقق",
    expiry: (m) => `تنتهي صلاحية هذا الرمز بعد <strong>${m} دقائق</strong> ولا يُستخدم إلا مرة واحدة.`,
    ignore: "إذا لم تكن صاحب هذا الطلب، تجاهل هذه الرسالة.",
    never: "لن تطلب منك ميزان هذا الرمز أبدًا عبر الهاتف أو الرسائل.",
    sign: "— فريق ميزان",
  },
  es: {
    subject: { signup: "Su código de verificación de MIZAN", email_change: "Confirme su nueva dirección de correo de MIZAN" },
    intro: { signup: "Use este código para terminar de crear su cuenta MIZAN:", email_change: "Use este código para confirmar esta dirección como la nueva de su cuenta MIZAN:" },
    label: "Código de verificación",
    expiry: (m) => `Este código caduca en <strong>${m} minutos</strong> y solo puede usarse una vez.`,
    ignore: "Si no ha realizado esta solicitud, ignore este correo.",
    never: "MIZAN nunca le pedirá este código por teléfono o mensaje.",
    sign: "— El equipo de MIZAN",
  },
};

/** Six-digit code to verify an address (sign-up, or a new address for an account). */
export function verificationCodeTemplate(kind: CodeKind, code: string, minutes: number, lang: EmailLang = "fr"): EmailTemplate {
  const c = VERIFY_COPY[lang];
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  return {
    lang,
    subject: c.subject[kind],
    html: `
      <p style="margin:0 0 20px 0;">${c.intro[kind]}</p>
      <div style="margin:0 0 20px 0;padding:18px 20px;background:#EFF6FF;border:2px solid ${BRAND_BLUE};border-radius:12px;text-align:center;">
        <div style="font-size:11px;letter-spacing:1px;color:#475569;text-transform:uppercase;margin-bottom:6px;">${c.label}</div>
        <div dir="ltr" style="font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND_BLUE};font-family:'Courier New',monospace;">${code}</div>
      </div>
      <p style="margin:0 0 12px 0;">${c.expiry(minutes)}</p>
      <p style="margin:0 0 12px 0;color:#475569;">${c.ignore}</p>
      <p style="margin:0 0 16px 0;color:#475569;font-size:12px;">${c.never}</p>
      <p style="margin:0;">${c.sign}</p>`,
    text: [c.intro[kind], "", `${c.label} : ${code}`, "", strip(c.expiry(minutes)), "", c.ignore, c.never, "", c.sign].join("\n"),
  };
}

const EMAIL_CHANGED_COPY: Record<EmailLang, { subject: string; hello: (n: string) => string; body: (to: string, d: string) => string; notYou: string; sign: string }> = {
  fr: {
    subject: "L'adresse e-mail de votre compte MIZAN a été modifiée",
    hello: (n) => `Bonjour ${n},`,
    body: (to, d) => `Le ${d}, l'adresse e-mail de votre compte MIZAN a été remplacée par ${to}. Les prochains emails de MIZAN seront envoyés à cette nouvelle adresse.`,
    notYou: "Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement votre syndic : quelqu'un a peut-être accès à votre compte.",
    sign: "— L'équipe MIZAN",
  },
  en: {
    subject: "The e-mail address of your MIZAN account was changed",
    hello: (n) => `Hello ${n},`,
    body: (to, d) => `On ${d}, the e-mail address of your MIZAN account was changed to ${to}. Future MIZAN emails will go to this new address.`,
    notYou: "If you did not make this change, contact your property manager right away: someone may have access to your account.",
    sign: "— The MIZAN team",
  },
  ar: {
    subject: "تم تغيير عنوان البريد الإلكتروني لحسابك في ميزان",
    hello: (n) => `مرحبًا ${n}،`,
    body: (to, d) => `بتاريخ ${d}، تم استبدال عنوان البريد الإلكتروني لحسابك في ميزان بالعنوان ${to}. ستُرسل رسائل ميزان القادمة إلى هذا العنوان الجديد.`,
    notYou: "إذا لم تقم بهذا التغيير، تواصل فورًا مع وكيل الإقامة: قد يكون شخص ما قد وصل إلى حسابك.",
    sign: "— فريق ميزان",
  },
  es: {
    subject: "Se ha cambiado la dirección de correo de su cuenta MIZAN",
    hello: (n) => `Hola ${n}:`,
    body: (to, d) => `El ${d}, la dirección de correo de su cuenta MIZAN se cambió por ${to}. Los próximos correos de MIZAN se enviarán a esta nueva dirección.`,
    notYou: "Si no ha realizado este cambio, contacte de inmediato con su administrador: alguien podría tener acceso a su cuenta.",
    sign: "— El equipo de MIZAN",
  },
};

/** Sent to the former address once an address change is committed (contains no secret). */
export function emailChangedNoticeTemplate(name: string, newEmail: string, when: Date, lang: EmailLang = "fr"): EmailTemplate {
  const c = EMAIL_CHANGED_COPY[lang];
  const locale = { fr: "fr-FR", en: "en-GB", ar: "ar-MA", es: "es-ES" }[lang];
  const d = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(when);
  // Partly masked: enough to recognise it, not enough to harvest it.
  const masked = newEmail.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");
  return {
    lang,
    subject: c.subject,
    html: `
      <p style="margin:0 0 12px 0;">${escapeHtml(c.hello(name))}</p>
      <p style="margin:0 0 12px 0;">${escapeHtml(c.body(masked, d))}</p>
      <p style="margin:0 0 16px 0;color:#475569;">${escapeHtml(c.notYou)}</p>
      <p style="margin:0;">${c.sign}</p>`,
    text: [c.hello(name), "", c.body(masked, d), "", c.notYou, "", c.sign].join("\n"),
  };
}

const ACCOUNT_DELETED_COPY: Record<EmailLang, { subject: string; hello: (n: string) => string; body: string; kept: string; notYou: string; sign: string }> = {
  fr: {
    subject: "Votre compte MIZAN a été supprimé",
    hello: (n) => `Bonjour ${n},`,
    body: "Votre compte MIZAN a été supprimé à votre demande : vous ne pouvez plus vous y connecter et vos données personnelles de compte ont été effacées.",
    kept: "Restent conservés, au titre des obligations de la copropriété : votre fiche tenue par le syndic, les écritures financières, les votes et les documents signés.",
    notYou: "Si vous n'êtes pas à l'origine de cette suppression, contactez immédiatement votre syndic.",
    sign: "— L'équipe MIZAN",
  },
  en: {
    subject: "Your MIZAN account has been deleted",
    hello: (n) => `Hello ${n},`,
    body: "Your MIZAN account has been deleted at your request: you can no longer sign in and your personal account data has been erased.",
    kept: "Kept under the condominium's obligations: your record held by the property manager, financial records, votes and signed documents.",
    notYou: "If you did not request this deletion, contact your property manager right away.",
    sign: "— The MIZAN team",
  },
  ar: {
    subject: "تم حذف حسابك في ميزان",
    hello: (n) => `مرحبًا ${n}،`,
    body: "تم حذف حسابك في ميزان بناءً على طلبك: لم يعد بإمكانك تسجيل الدخول وقد مُحيت بيانات حسابك الشخصية.",
    kept: "تبقى محفوظة بموجب التزامات الإقامة: بطاقتك لدى وكيل الإقامة والسجلات المالية والتصويتات والوثائق الموقعة.",
    notYou: "إذا لم تطلب هذا الحذف، تواصل فورًا مع وكيل الإقامة.",
    sign: "— فريق ميزان",
  },
  es: {
    subject: "Su cuenta MIZAN ha sido eliminada",
    hello: (n) => `Hola ${n}:`,
    body: "Su cuenta MIZAN ha sido eliminada a petición suya: ya no puede iniciar sesión y se han borrado sus datos personales de la cuenta.",
    kept: "Se conservan, por las obligaciones de la comunidad: su ficha en poder del administrador, los registros financieros, los votos y los documentos firmados.",
    notYou: "Si no ha solicitado esta eliminación, contacte de inmediato con su administrador.",
    sign: "— El equipo de MIZAN",
  },
};

/** Last message to the address of a deleted account (contains no secret). */
export function accountDeletedTemplate(name: string, lang: EmailLang = "fr"): EmailTemplate {
  const c = ACCOUNT_DELETED_COPY[lang];
  return {
    lang,
    subject: c.subject,
    html: `
      <p style="margin:0 0 12px 0;">${escapeHtml(c.hello(name))}</p>
      <p style="margin:0 0 12px 0;">${escapeHtml(c.body)}</p>
      <p style="margin:0 0 12px 0;">${escapeHtml(c.kept)}</p>
      <p style="margin:0 0 16px 0;color:#475569;">${escapeHtml(c.notYou)}</p>
      <p style="margin:0;">${c.sign}</p>`,
    text: [c.hello(name), "", c.body, "", c.kept, "", c.notYou, "", c.sign].join("\n"),
  };
}

export function welcomeTemplate(name: string, role: string, loginUrl?: string, temporaryPassword?: string): EmailTemplate {
  const roleLabel: Record<string, string> = {
    super_admin: "Administrateur plateforme",
    syndicate_admin: "Administrateur de syndicat",
    member: "Copropriétaire",
    tenant: "Locataire",
  };
  return {
    subject: "Bienvenue sur MIZAN",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Votre compte MIZAN a été créé avec succès en tant que <strong>${escapeHtml(roleLabel[role] ?? role)}</strong>.</p>
      <p>Vous pouvez dès maintenant vous connecter pour gérer vos démarches liées à votre syndicat de copropriété.</p>
      ${temporaryPassword ? `<div style="margin:20px 0;padding:16px;background:#EFF6FF;border-radius:10px;border-left:4px solid #2563EB;"><p style="margin:0 0 6px 0;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;">Identifiant temporaire</p><p style="margin:0;color:#0A1628;"><strong>Mot de passe :</strong> <code style="background:#DBEAFE;padding:2px 8px;border-radius:4px;font-family:monospace;letter-spacing:1px;">${escapeHtml(temporaryPassword)}</code></p></div><p style="color:#DC2626;font-size:13px;">Veuillez changer ce mot de passe après votre première connexion.</p>` : ""}
      ${loginUrl ? button(loginUrl, "Accéder à mon compte") : ""}
      <p>— L'équipe MIZAN</p>`,
  };
}

export function teamInvitationTemplate(name: string, email: string, role: string, syndicateName: string, tempPassword: string): EmailTemplate {
  const roleLabels: Record<string, string> = {
    president: "Président",
    treasurer: "Trésorier",
    secretary: "Secrétaire",
    committee_member: "Membre du Conseil",
    syndicate_admin: "Administrateur de Syndicat",
  };
  const roleLabel = roleLabels[role] ?? role;

  return {
    subject: `Invitation à rejoindre ${syndicateName} — MIZAN`,
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez été invité(e) à rejoindre <strong>${escapeHtml(syndicateName)}</strong> sur la plateforme <strong>MIZAN</strong> en tant que <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <div style="margin:24px 0;padding:20px;background:#EFF6FF;border-radius:12px;border-left:4px solid #2563EB;">
        <p style="margin:0 0 8px 0;font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Vos identifiants de connexion</p>
        <p style="margin:0 0 4px 0;font-size:14px;color:#0A1628;"><strong>Email :</strong> ${escapeHtml(email)}</p>
        <p style="margin:0;font-size:14px;color:#0A1628;"><strong>Mot de passe temporaire :</strong> <code style="background:#DBEAFE;padding:2px 8px;border-radius:4px;font-family:monospace;letter-spacing:1px;">${escapeHtml(tempPassword)}</code></p>
      </div>
      <p style="color:#DC2626;font-size:13px;">⚠️ Vous devrez changer ce mot de passe lors de votre première connexion.</p>
      <p>Téléchargez l'application <strong>MIZAN</strong> depuis l'App Store ou Google Play pour commencer.</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

export function syndicateCreatedTemplate(syndicateName: string, adminName: string): EmailTemplate {
  return {
    subject: `Votre syndicat "${syndicateName}" est créé`,
    html: `
      <p>Bonjour ${escapeHtml(adminName)},</p>
      <p>Le syndicat <strong>${escapeHtml(syndicateName)}</strong> a été créé sur MIZAN et vous en êtes l'administrateur.</p>
      <p>Vous pouvez maintenant ajouter des membres, configurer les cotisations, et gérer les assemblées générales.</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

export function electionNotificationTemplate(
  electionTitle: string,
  eventLabel: string,
  message: string,
): EmailTemplate {
  return {
    subject: `${eventLabel} — ${electionTitle}`,
    html: `
      <p><strong>${escapeHtml(eventLabel)}</strong></p>
      <p>Élection : <strong>${escapeHtml(electionTitle)}</strong></p>
      <p>${escapeHtml(message)}</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

export function meetingInvitationTemplate(
  title: string,
  date: string,
  time: string | null | undefined,
  location: string | null | undefined,
  agenda?: string | null,
): EmailTemplate {
  return {
    subject: `Invitation — Réunion : ${title}`,
    html: `
      <p>Vous êtes invité(e) à la réunion suivante :</p>
      <p style="background:#f4f4f7;border-radius:8px;padding:16px;">
        <strong>${escapeHtml(title)}</strong><br/>
        📅 ${escapeHtml(date)}${time ? ` à ${escapeHtml(time)}` : ""}<br/>
        ${location ? `📍 ${escapeHtml(location)}<br/>` : ""}
      </p>
      ${agenda ? `<p><strong>Ordre du jour :</strong><br/>${escapeHtml(agenda).replace(/\n/g, "<br/>")}</p>` : ""}
      <p>— L'équipe MIZAN</p>`,
  };
}

export function agmInvitationTemplate(
  title: string,
  date: string,
  time: string | null | undefined,
  location: string | null | undefined,
  type: string,
): EmailTemplate {
  const typeLabel: Record<string, string> = {
    ag_ordinaire: "Assemblée Générale Ordinaire",
    ag_extraordinaire: "Assemblée Générale Extraordinaire",
    ag_constitutive: "Assemblée Générale Constitutive",
    ag_elective: "Assemblée Générale Élective",
  };
  return {
    subject: `Convocation — ${typeLabel[type] ?? "Assemblée Générale"} : ${title}`,
    html: `
      <p>Conformément à la loi 18-00, vous êtes convoqué(e) à :</p>
      <p style="background:#f4f4f7;border-radius:8px;padding:16px;">
        <strong>${escapeHtml(typeLabel[type] ?? "Assemblée Générale")}</strong><br/>
        ${escapeHtml(title)}<br/>
        📅 ${escapeHtml(date)}${time ? ` à ${escapeHtml(time)}` : ""}<br/>
        ${location ? `📍 ${escapeHtml(location)}<br/>` : ""}
      </p>
      <p>Merci de confirmer votre présence ou de désigner un mandataire (pouvoir) via l'application.</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

export function paymentReminderTemplate(
  memberName: string,
  amount: string,
  dueDate: string | null | undefined,
  period: string,
): EmailTemplate {
  return {
    subject: `Rappel de paiement — Charges de copropriété (${period})`,
    html: `
      <p>Bonjour ${escapeHtml(memberName)},</p>
      <p>Ceci est un rappel amical : un appel de fonds de <strong>${escapeHtml(amount)} MAD</strong> pour la période <strong>${escapeHtml(period)}</strong> reste impayé${dueDate ? ` (échéance : ${escapeHtml(dueDate)})` : ""}.</p>
      <p>Merci de régulariser votre situation dès que possible auprès de votre syndic.</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

export function latePaymentWarningTemplate(
  memberName: string,
  levelLabel: string,
  overdueMonths: number,
  totalOverdue: string,
): EmailTemplate {
  return {
    subject: `⚠️ Mise en demeure — ${levelLabel}`,
    html: `
      <p>Bonjour ${escapeHtml(memberName)},</p>
      <p>Votre compte présente un impayé de <strong>${escapeHtml(totalOverdue)} MAD</strong>, soit <strong>${overdueMonths} mois</strong> de retard.</p>
      <p>Ce dossier a atteint le niveau : <strong>${escapeHtml(levelLabel)}</strong>.</p>
      <p>Merci de régulariser votre situation sans délai pour éviter une escalade supplémentaire.</p>
      <p>— L'équipe MIZAN</p>`,
  };
}

export function supportTicketTemplate(ticketTitle: string, submittedBy: string, priority: string): EmailTemplate {
  return {
    subject: `Nouveau ticket support (${priority}) — ${ticketTitle}`,
    html: `
      <p>Un nouveau ticket de support a été soumis par <strong>${escapeHtml(submittedBy)}</strong>.</p>
      <p><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}<br/><strong>Priorité :</strong> ${escapeHtml(priority)}</p>
      <p>Merci de le traiter depuis le tableau de bord support.</p>
      <p>— MIZAN</p>`,
  };
}

export function marketplaceModerationTemplate(
  productName: string,
  action: "approved" | "rejected" | "modification_requested",
  reason?: string | null,
): EmailTemplate {
  if (action === "approved") {
    return {
      subject: `Votre annonce "${productName}" a été approuvée`,
      html: `<p>Bonne nouvelle ! Votre annonce <strong>${escapeHtml(productName)}</strong> a été approuvée et est maintenant visible sur le marketplace MIZAN.</p><p>— L'équipe MIZAN</p>`,
    };
  }
  const verb = action === "rejected" ? "rejetée" : "renvoyée pour modification";
  return {
    subject: `Votre annonce "${productName}" a été ${verb}`,
    html: `
      <p>Votre annonce <strong>${escapeHtml(productName)}</strong> a été ${verb}.</p>
      ${reason ? `<p><strong>Motif :</strong> ${escapeHtml(reason)}</p>` : ""}
      <p>— L'équipe MIZAN</p>`,
  };
}

export function incidentNotificationTemplate(type: string, description: string, urgency: string): EmailTemplate {
  return {
    subject: `🚨 Sinistre déclaré : ${type}`,
    html: `
      <p>Un nouveau sinistre a été déclaré.</p>
      <p><strong>Type :</strong> ${escapeHtml(type)}<br/><strong>Urgence :</strong> ${escapeHtml(urgency)}</p>
      <p><strong>Description :</strong><br/>${escapeHtml(description)}</p>
      <p>— MIZAN</p>`,
  };
}

export function testEmailTemplate(name: string): EmailTemplate {
  return {
    subject: "Email de test — MIZAN",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Ceci est un email de test envoyé depuis le Centre Email de MIZAN pour vérifier la configuration SMTP.</p>
      <p>Si vous recevez ce message, la livraison d'emails fonctionne correctement. ✅</p>
      <p>— L'équipe MIZAN</p>`,
  };
}
