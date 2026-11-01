export type VerifStatus = "valid" | "pending" | "revoked" | "expired" | "replaced";

export interface SigRow {
  signerName: string | null;
  signerRole: string | null;
  signedAt: Date | null;
  isValid: boolean | null;
}

export function escHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildVerificationHtml(opts: {
  status: VerifStatus;
  title: string;
  documentNumber: string | null;
  issuedBy: string | null;
  issuedAt: Date | null;
  signatures: SigRow[];
  rejectionReason?: string | null;
  token: string;
  accentColor?: string;
  docVersion?: number;
}): string {
  const {
    status,
    title,
    documentNumber,
    issuedBy,
    issuedAt,
    signatures,
    rejectionReason,
    token,
    accentColor,
    docVersion,
  } = opts;
  // Derive gradient stops from syndicate accent color
  const ac = accentColor ?? "#1F5EFF";
  const _dk = (h: string, a: number) =>
    "#" +
    h
      .replace("#", "")
      .match(/../g)!
      .map((x) =>
        Math.max(0, parseInt(x, 16) - a)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const acDark = _dk(ac, 68);
  const acMid = _dk(ac, 36);

  const cfg: Record<
    VerifStatus,
    {
      bg: string;
      accent: string;
      icon: string;
      badge: string;
      label: string;
      sub: string;
    }
  > = {
    valid: {
      bg: "#f0fdf4",
      accent: "#16a34a",
      icon: "✓",
      badge: "#dcfce7",
      label: "DOCUMENT AUTHENTIQUE",
      sub: "Ce document a été vérifié et est valide.",
    },
    pending: {
      bg: "#fffbeb",
      accent: "#d97706",
      icon: "⏳",
      badge: "#fef3c7",
      label: "EN ATTENTE DE VALIDATION",
      sub: "Ce document est en cours d'examen par le syndicat.",
    },
    revoked: {
      bg: "#fef2f2",
      accent: "#dc2626",
      icon: "✕",
      badge: "#fee2e2",
      label: "DOCUMENT RÉVOQUÉ",
      sub: rejectionReason
        ? `Motif : ${rejectionReason}`
        : "Ce document a été révoqué ou rejeté.",
    },
    expired: {
      bg: "#fff7ed",
      accent: "#ea580c",
      icon: "⚠",
      badge: "#ffedd5",
      label: "DOCUMENT EXPIRÉ",
      sub: "La période de validité de ce document est écoulée.",
    },
    replaced: {
      bg: "#eff6ff",
      accent: "#2563eb",
      icon: "↻",
      badge: "#dbeafe",
      label: "VERSION REMPLACÉE",
      sub: "Ce document a été remplacé par une version plus récente.",
    },
  };
  const c = cfg[status];

  const fmtDate = (d: Date | null) =>
    d
      ? new Date(d).toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "—";
  const fmtDateTime = (d: Date | null) =>
    d
      ? new Date(d).toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const sigRows = signatures
    .map(
      (s) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
        <div style="font-weight:600;color:#1e293b;font-size:13px;">${escHtml(s.signerName)}</div>
        <div style="color:#64748b;font-size:11px;margin-top:2px;">${escHtml(s.signerRole)}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px;">${fmtDateTime(s.signedAt)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">
        ${
          s.isValid
            ? `<span style="display:inline-block;background:#dcfce7;color:#16a34a;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">VALIDE</span>`
            : `<span style="display:inline-block;background:#fee2e2;color:#dc2626;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">INVALIDÉE</span>`
        }
      </td>
    </tr>`,
    )
    .join("");

  // Build chronological event timeline from available dates
  const timelineEvents: Array<{
    date: Date | null;
    label: string;
    detail: string | null;
    color: string;
  }> = [
    {
      date: issuedAt,
      label: "Document créé",
      detail: issuedBy ? `par ${issuedBy}` : null,
      color: ac,
    },
    ...signatures.map((s) => ({
      date: s.signedAt,
      label: `Signé — ${s.signerName || "—"}`,
      detail: s.signerRole ? `Rôle : ${s.signerRole}` : null,
      color: s.isValid ? "#16a34a" : "#dc2626",
    })),
  ]
    .filter((e) => e.date != null)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime());

  const timelineRows = timelineEvents
    .map(
      (e) => `
    <div style="position:relative;margin-bottom:12px;padding-left:0;">
      <div style="position:absolute;left:-22px;top:4px;width:8px;height:8px;background:${e.color};border-radius:50%;border:2px solid #fff;outline:1px solid ${e.color};"></div>
      <div style="font-size:11px;font-weight:700;color:#1e293b;">${escHtml(e.label)}</div>
      <div style="font-size:10px;color:#64748b;">${fmtDateTime(e.date)}</div>
      ${e.detail ? `<div style="font-size:10px;color:#94a3b8;margin-top:1px;">${escHtml(e.detail)}</div>` : ""}
    </div>`,
    )
    .join("");

  const timelineSection =
    timelineEvents.length > 0
      ? `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span style="font-size:14px;">📋</span>
        <span style="font-weight:700;font-size:12px;color:#1e293b;letter-spacing:.4px;text-transform:uppercase;">Chronologie du document</span>
      </div>
      <div style="border-left:2px solid ${ac};margin-left:4px;padding-left:18px;">
        ${timelineRows}
      </div>
    </div>`
      : "";

  const sigSection =
    signatures.length > 0
      ? `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;margin-bottom:16px;">
      <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
        <span style="font-size:15px;">✍️</span>
        <span style="font-weight:700;font-size:13px;color:#1e293b;letter-spacing:.4px;text-transform:uppercase;">Signatures électroniques</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Signataire</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Date</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Statut</th>
          </tr>
        </thead>
        <tbody>${sigRows}</tbody>
      </table>
    </div>`
      : "";

  const fingerprint =
    token
      .slice(0, 8)
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join("-") ?? token.slice(0, 8);
  const issuedAtStr = fmtDate(issuedAt);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Vérification de document — MIZAN</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${c.bg};min-height:100vh;padding:0 0 40px}
    a{color:inherit;text-decoration:none}
  </style>
</head>
<body>

  <!-- ── Header band ─────────────────────────────────────────────────────── -->
  <div style="background:linear-gradient(135deg,${acDark} 0%,${acMid} 55%,${ac} 100%);padding:28px 20px 80px;text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="width:28px;height:28px;background:rgba(255,255,255,.15);border-radius:6px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:15px;">🏛</span>
      </div>
      <span style="color:rgba(255,255,255,.85);font-size:13px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;">MIZAN — Portail de vérification</span>
    </div>
    <div style="color:rgba(255,255,255,.5);font-size:11px;margin-top:4px;letter-spacing:.3px;">documents.mizan.ma</div>
  </div>

  <!-- ── Status card (overlaps header) ─────────────────────────────────── -->
  <div style="max-width:520px;margin:-52px auto 0;padding:0 16px;">

    <div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.12);overflow:hidden;margin-bottom:16px;">

      <!-- Status hero -->
      <div style="background:${c.badge};padding:28px 20px;text-align:center;border-bottom:1px solid rgba(0,0,0,.06);">
        <div style="width:64px;height:64px;background:${c.accent};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 4px 14px ${c.accent}55;">
          <span style="color:#fff;font-size:28px;font-weight:700;">${c.icon}</span>
        </div>
        <div style="font-size:15px;font-weight:800;color:${c.accent};letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px;">${c.label}</div>
        <div style="font-size:13px;color:#475569;line-height:1.5;">${escHtml(c.sub)}</div>
      </div>

      <!-- Document metadata -->
      <div style="padding:20px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.6px;text-transform:uppercase;margin-bottom:12px;">Informations du document</div>

        <div style="font-size:17px;font-weight:700;color:#0f172a;line-height:1.4;margin-bottom:16px;">${escHtml(title)}</div>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:7px 0;font-size:12px;color:#64748b;font-weight:500;width:42%;">Référence</td>
            <td style="padding:7px 0;font-size:12px;color:#1e293b;font-weight:700;font-family:monospace;">${escHtml(documentNumber) || "—"}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;font-size:12px;color:#64748b;font-weight:500;border-top:1px solid #f8fafc;">Émis par</td>
            <td style="padding:7px 0;font-size:12px;color:#1e293b;font-weight:600;border-top:1px solid #f8fafc;">${escHtml(issuedBy) || "—"}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;font-size:12px;color:#64748b;font-weight:500;border-top:1px solid #f8fafc;">Date d'émission</td>
            <td style="padding:7px 0;font-size:12px;color:#1e293b;border-top:1px solid #f8fafc;">${escHtml(issuedAtStr)}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;font-size:12px;color:#64748b;font-weight:500;border-top:1px solid #f8fafc;">Signatures</td>
            <td style="padding:7px 0;font-size:12px;color:#1e293b;border-top:1px solid #f8fafc;">${signatures.length} signature${signatures.length !== 1 ? "s" : ""}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;font-size:12px;color:#64748b;font-weight:500;border-top:1px solid #f8fafc;">Version</td>
            <td style="padding:7px 0;font-size:12px;color:#1e293b;border-top:1px solid #f8fafc;">${docVersion ? `v${docVersion}` : "v1"}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Signatures -->
    ${sigSection}

    <!-- Document timeline -->
    ${timelineSection}

    <!-- Security fingerprint -->
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:14px;">🔐</span>
        <span style="font-weight:700;font-size:12px;color:#1e293b;letter-spacing:.4px;text-transform:uppercase;">Certificat de sécurité</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;background:#f8fafc;border-radius:8px;padding:10px 12px;">
        <div style="flex:1;">
          <div style="font-size:10px;color:#94a3b8;letter-spacing:.4px;text-transform:uppercase;margin-bottom:3px;">Empreinte du document</div>
          <div style="font-family:monospace;font-size:13px;font-weight:700;color:#334155;letter-spacing:.5px;">${escHtml(fingerprint)}</div>
        </div>
        <div style="width:1px;height:32px;background:#e2e8f0;"></div>
        <div style="flex:1;">
          <div style="font-size:10px;color:#94a3b8;letter-spacing:.4px;text-transform:uppercase;margin-bottom:3px;">Protocole</div>
          <div style="font-size:12px;font-weight:600;color:#334155;">Token QR SHA-256</div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:#94a3b8;line-height:1.6;">
        Ce lien de vérification est généré cryptographiquement par MIZAN et est unique à ce document.
        Toute modification du document invalide automatiquement ce certificat.
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:8px 0;">
      <div style="font-size:11px;color:#94a3b8;">Propulsé par <span style="font-weight:700;color:#1F5EFF;">MIZAN</span> · Gouvernance des résidences</div>
      <div style="font-size:10px;color:#cbd5e1;margin-top:3px;">Vérifié le ${new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
    </div>

  </div>
</body>
</html>`;
}

export function buildVerificationNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Document introuvable — MIZAN</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fef2f2;min-height:100vh;padding:0 0 40px}</style>
</head>
<body>
  <div style="background:linear-gradient(135deg,#0B1F3A 0%,#102B4D 60%,#1F5EFF 100%);padding:28px 20px 80px;text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:8px;">
      <span style="color:rgba(255,255,255,.85);font-size:13px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;">MIZAN — Portail de vérification</span>
    </div>
  </div>
  <div style="max-width:520px;margin:-52px auto 0;padding:0 16px;">
    <div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.12);overflow:hidden;margin-bottom:16px;">
      <div style="background:#fee2e2;padding:28px 20px;text-align:center;border-bottom:1px solid rgba(0,0,0,.06);">
        <div style="width:64px;height:64px;background:#dc2626;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 4px 14px #dc262655;">
          <span style="color:#fff;font-size:28px;font-weight:700;">?</span>
        </div>
        <div style="font-size:15px;font-weight:800;color:#dc2626;letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px;">DOCUMENT INTROUVABLE</div>
        <div style="font-size:13px;color:#475569;line-height:1.5;">Ce code QR ne correspond à aucun document enregistré dans notre système.<br>Il est possible qu'il soit invalide, corrompu ou qu'il ait été supprimé.</div>
      </div>
      <div style="padding:20px;">
        <div style="background:#f8fafc;border-radius:8px;padding:14px;font-size:12px;color:#64748b;line-height:1.7;">
          <strong style="color:#1e293b;">Que faire ?</strong><br>
          • Vérifiez que le code QR est complet et non endommagé<br>
          • Demandez une copie valide du document à l'émetteur<br>
          • Contactez le syndicat qui a émis ce document
        </div>
      </div>
    </div>
      <div style="text-align:center;padding:8px 0;">
       <div style="font-size:11px;color:#94a3b8;">Propulsé par <span style="font-weight:700;color:#1F5EFF;">MIZAN</span> · Gouvernance des résidences</div>
    </div>
  </div>
</body>
</html>`;
}
