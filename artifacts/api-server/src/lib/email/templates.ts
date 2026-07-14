/**
 * Reusable HTML email templates for SYNDYCAT.
 *
 * Every template returns `{ subject, html }`. The `html` is the inner body only —
 * `EmailService.send()` wraps it in `wrapEmail()` so every outgoing email shares the
 * same branded header/footer, regardless of which flow triggered it.
 */

const BRAND_COLOR = "#7c3aed";

/** Shared branded shell every email body gets wrapped in. */
export function wrapEmail(preheader: string, bodyHtml: string): string {
  return `
  <!DOCTYPE html>
  <html lang="fr">
    <body style="margin:0;padding:0;background:#f4f4f7;font-family:Helvetica,Arial,sans-serif;">
      <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="background:${BRAND_COLOR};padding:24px 32px;">
                  <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.5px;">SYNDYCAT</span>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;color:#1f2937;font-size:14px;line-height:1.6;">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;">
                  <p style="margin:0;color:#9ca3af;font-size:11px;">
                    Cet email a été envoyé automatiquement par la plateforme SYNDYCAT. Ne répondez pas directement à ce message.
                  </p>
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

export function passwordResetTemplate(name: string, resetUrl: string): EmailTemplate {
  return {
    subject: "Réinitialisation de votre mot de passe — SYNDYCAT",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe SYNDYCAT.</p>
      ${button(resetUrl, "Réinitialiser mon mot de passe")}
      <p>Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas effectué cette demande, ignorez cet email.</p>
      <p>— L'équipe SYNDYCAT</p>`,
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
    subject: "Bienvenue sur SYNDYCAT",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Votre compte SYNDYCAT a été créé avec succès en tant que <strong>${escapeHtml(roleLabel[role] ?? role)}</strong>.</p>
      <p>Vous pouvez dès maintenant vous connecter pour gérer vos démarches liées à votre syndicat de copropriété.</p>
      ${loginUrl ? button(loginUrl, "Accéder à mon compte") : ""}
      <p>— L'équipe SYNDYCAT</p>`,
  };
}

export function syndicateCreatedTemplate(syndicateName: string, adminName: string): EmailTemplate {
  return {
    subject: `Votre syndicat "${syndicateName}" est créé`,
    html: `
      <p>Bonjour ${escapeHtml(adminName)},</p>
      <p>Le syndicat <strong>${escapeHtml(syndicateName)}</strong> a été créé sur SYNDYCAT et vous en êtes l'administrateur.</p>
      <p>Vous pouvez maintenant ajouter des membres, configurer les cotisations, et gérer les assemblées générales.</p>
      <p>— L'équipe SYNDYCAT</p>`,
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
      <p>— L'équipe SYNDYCAT</p>`,
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
      <p>— L'équipe SYNDYCAT</p>`,
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
      <p>— L'équipe SYNDYCAT</p>`,
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
      <p>— L'équipe SYNDYCAT</p>`,
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
      <p>— L'équipe SYNDYCAT</p>`,
  };
}

export function supportTicketTemplate(ticketTitle: string, submittedBy: string, priority: string): EmailTemplate {
  return {
    subject: `Nouveau ticket support (${priority}) — ${ticketTitle}`,
    html: `
      <p>Un nouveau ticket de support a été soumis par <strong>${escapeHtml(submittedBy)}</strong>.</p>
      <p><strong>Sujet :</strong> ${escapeHtml(ticketTitle)}<br/><strong>Priorité :</strong> ${escapeHtml(priority)}</p>
      <p>Merci de le traiter depuis le tableau de bord support.</p>
      <p>— SYNDYCAT</p>`,
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
      html: `<p>Bonne nouvelle ! Votre annonce <strong>${escapeHtml(productName)}</strong> a été approuvée et est maintenant visible sur le marketplace SYNDYCAT.</p><p>— L'équipe SYNDYCAT</p>`,
    };
  }
  const verb = action === "rejected" ? "rejetée" : "renvoyée pour modification";
  return {
    subject: `Votre annonce "${productName}" a été ${verb}`,
    html: `
      <p>Votre annonce <strong>${escapeHtml(productName)}</strong> a été ${verb}.</p>
      ${reason ? `<p><strong>Motif :</strong> ${escapeHtml(reason)}</p>` : ""}
      <p>— L'équipe SYNDYCAT</p>`,
  };
}

export function incidentNotificationTemplate(type: string, description: string, urgency: string): EmailTemplate {
  return {
    subject: `🚨 Sinistre déclaré : ${type}`,
    html: `
      <p>Un nouveau sinistre a été déclaré.</p>
      <p><strong>Type :</strong> ${escapeHtml(type)}<br/><strong>Urgence :</strong> ${escapeHtml(urgency)}</p>
      <p><strong>Description :</strong><br/>${escapeHtml(description)}</p>
      <p>— SYNDYCAT</p>`,
  };
}

export function testEmailTemplate(name: string): EmailTemplate {
  return {
    subject: "Email de test — SYNDYCAT",
    html: `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Ceci est un email de test envoyé depuis le Centre Email de SYNDYCAT pour vérifier la configuration SMTP.</p>
      <p>Si vous recevez ce message, la livraison d'emails fonctionne correctement. ✅</p>
      <p>— L'équipe SYNDYCAT</p>`,
  };
}
