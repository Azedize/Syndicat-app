/**
 * Reusable HTML email templates for VERIDIAN.
 *
 * Every template returns `{ subject, html }`. The `html` is the inner body only —
 * `EmailService.send()` wraps it in `wrapEmail()` so every outgoing email shares the
 * same branded header/footer, regardless of which flow triggered it.
 */

const BRAND_NAVY  = "#0A1628";   // VERIDIAN navyDeep — header background
const BRAND_BLUE  = "#2563EB";   // VERIDIAN blue — action color, buttons
const BRAND_COLOR = BRAND_BLUE;  // legacy alias kept for button() helper

/** Shared branded shell every email body gets wrapped in. */
export function wrapEmail(preheader: string, bodyHtml: string): string {
  return `
  <!DOCTYPE html>
  <html lang="fr">
    <body style="margin:0;padding:0;background:#EFF6FF;font-family:Helvetica,Arial,sans-serif;">
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
                              <div style="width:38px;height:44px;background:linear-gradient(160deg,${BRAND_BLUE},#60A5FA);border-radius:4px 4px 6px 6px;display:inline-block;text-align:center;line-height:44px;">
                                <span style="color:#fff;font-size:18px;font-weight:900;">V</span>
                              </div>
                            </td>
                            <td style="vertical-align:middle;">
                              <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:3px;font-family:Helvetica,Arial,sans-serif;">VERIDIAN</div>
                              <div style="color:#93C5FD;font-size:10px;font-weight:600;letter-spacing:2px;margin-top:2px;font-family:Helvetica,Arial,sans-serif;">PROPERTY &amp; SYNDICATE MANAGEMENT</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <!-- Brand accent stripe -->
                    <tr>
                      <td style="height:3px;background:linear-gradient(90deg,${BRAND_BLUE},#60A5FA,${BRAND_BLUE});"></td>
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
                        <p style="margin:0 0 4px 0;color:#2563EB;font-size:11px;font-weight:700;letter-spacing:1px;">VERIDIAN</p>
                        <p style="margin:0;color:#64748B;font-size:10px;line-height:1.5;">
                          Cet email a été envoyé automatiquement par la plateforme VERIDIAN Property &amp; Syndicate Management.<br/>
                          Ne répondez pas directement à ce message.
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
    subject: "Réinitialisation de votre mot de passe — VERIDIAN",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe VERIDIAN.</p>
      ${button(resetUrl, "Réinitialiser mon mot de passe")}
      ${tokenBlock}
      <p>Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas effectué cette demande, ignorez cet email.</p>
      <p>— L'équipe VERIDIAN</p>`,
  };
}

export function welcomeTemplate(name: string, role: string, loginUrl?: string): EmailTemplate {
  const roleLabel: Record<string, string> = {
    super_admin: "Administrateur plateforme",
    syndicate_admin: "Administrateur de syndicat",
    member: "Copropriétaire",
    tenant: "Locataire",
  };
  return {
    subject: "Bienvenue sur VERIDIAN",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Votre compte VERIDIAN a été créé avec succès en tant que <strong>${escapeHtml(roleLabel[role] ?? role)}</strong>.</p>
      <p>Vous pouvez dès maintenant vous connecter pour gérer vos démarches liées à votre syndicat de copropriété.</p>
      ${loginUrl ? button(loginUrl, "Accéder à mon compte") : ""}
      <p>— L'équipe VERIDIAN</p>`,
  };
}

export function syndicateCreatedTemplate(syndicateName: string, adminName: string): EmailTemplate {
  return {
    subject: `Votre syndicat "${syndicateName}" est créé`,
    html: `
      <p>Bonjour ${escapeHtml(adminName)},</p>
      <p>Le syndicat <strong>${escapeHtml(syndicateName)}</strong> a été créé sur VERIDIAN et vous en êtes l'administrateur.</p>
      <p>Vous pouvez maintenant ajouter des membres, configurer les cotisations, et gérer les assemblées générales.</p>
      <p>— L'équipe VERIDIAN</p>`,
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
      <p>— L'équipe VERIDIAN</p>`,
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
      <p>— L'équipe VERIDIAN</p>`,
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
      <p>— L'équipe VERIDIAN</p>`,
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
      <p>— L'équipe VERIDIAN</p>`,
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
      <p>— L'équipe VERIDIAN</p>`,
  };
}

export function supportTicketTemplate(ticketTitle: string, submittedBy: string, priority: string): EmailTemplate {
  return {
    subject: `Nouveau ticket support (${priority}) — ${ticketTitle}`,
    html: `
      <p>Un nouveau ticket de support a été soumis par <strong>${escapeHtml(submittedBy)}</strong>.</p>
      <p><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}<br/><strong>Priorité :</strong> ${escapeHtml(priority)}</p>
      <p>Merci de le traiter depuis le tableau de bord support.</p>
      <p>— VERIDIAN</p>`,
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
      html: `<p>Bonne nouvelle ! Votre annonce <strong>${escapeHtml(productName)}</strong> a été approuvée et est maintenant visible sur le marketplace VERIDIAN.</p><p>— L'équipe VERIDIAN</p>`,
    };
  }
  const verb = action === "rejected" ? "rejetée" : "renvoyée pour modification";
  return {
    subject: `Votre annonce "${productName}" a été ${verb}`,
    html: `
      <p>Votre annonce <strong>${escapeHtml(productName)}</strong> a été ${verb}.</p>
      ${reason ? `<p><strong>Motif :</strong> ${escapeHtml(reason)}</p>` : ""}
      <p>— L'équipe VERIDIAN</p>`,
  };
}

export function incidentNotificationTemplate(type: string, description: string, urgency: string): EmailTemplate {
  return {
    subject: `🚨 Sinistre déclaré : ${type}`,
    html: `
      <p>Un nouveau sinistre a été déclaré.</p>
      <p><strong>Type :</strong> ${escapeHtml(type)}<br/><strong>Urgence :</strong> ${escapeHtml(urgency)}</p>
      <p><strong>Description :</strong><br/>${escapeHtml(description)}</p>
      <p>— VERIDIAN</p>`,
  };
}

export function testEmailTemplate(name: string): EmailTemplate {
  return {
    subject: "Email de test — VERIDIAN",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Ceci est un email de test envoyé depuis le Centre Email de VERIDIAN pour vérifier la configuration SMTP.</p>
      <p>Si vous recevez ce message, la livraison d'emails fonctionne correctement. ✅</p>
      <p>— L'équipe VERIDIAN</p>`,
  };
}
