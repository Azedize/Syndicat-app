import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  usersTable,
  refreshTokensTable,
  passwordResetTokensTable,
  otpTokensTable,
} from "@workspace/db/schema";
import { eq, and, gt, isNull, desc } from "drizzle-orm";
import {
  requireAuth,
  signToken,
  signRefreshToken,
  type JwtPayload,
} from "../middleware/auth.js";
import { sendTransactionalEmail } from "../lib/email/emailService.js";
import { passwordResetTemplate } from "../lib/email/templates.js";

/**
 * Sends a password reset email via the centralized EmailService (real Gmail SMTP,
 * retry-on-failure, and email_logs/audit trail — see lib/email/emailService.ts).
 */
async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
  req: any,
) {
  const resetUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/reset-password?token=${token}`
    : `[APP_URL not set] token=${token}`;

  const { subject, html } = passwordResetTemplate(name, resetUrl);
  await sendTransactionalEmail({
    to: email,
    subject,
    html,
    template: "password_reset",
  });
  req.log.info({ to: email }, "Password reset email dispatched");
}

const router = Router();

// ─── Register ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

router.post("/auth/register", async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: result.error.issues[0]?.message ?? "Données invalides" });
    return;
  }
  const { name, email, phone, password } = result.data;
  const emailLower = email.trim().toLowerCase();

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, emailLower));
    if (existing) {
      res.status(409).json({ error: "Cet email est déjà utilisé" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        name: name.trim(),
        email: emailLower,
        phone: phone?.trim() ?? null,
        passwordHash,
        role: "syndicate_admin",
        status: "active",
      } as any)
      .returning();

    const accessToken = signToken({
      userId: newUser.id,
      email: newUser.email,
      role: "syndicate_admin",
      name: newUser.name,
    });

    const refreshTokenValue = signRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokensTable).values({
      userId: newUser.id,
      token: refreshTokenValue,
      expiresAt,
    });

    const { passwordHash: _, ...safeUser } = newUser;
    req.log.info(
      { userId: newUser.id, email: emailLower },
      "New user registered",
    );
    res.status(201).json({
      data: {
        token: accessToken,
        refreshToken: refreshTokenValue,
        user: safeUser,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Email ou mot de passe invalide" });
    return;
  }
  const { email, password } = result.data;
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (!user) {
      res.status(401).json({ error: "Email ou mot de passe incorrect" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Email ou mot de passe incorrect" });
      return;
    }
    if (user.status !== "active") {
      res.status(403).json({ error: "Compte désactivé" });
      return;
    }

    const accessToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role as JwtPayload["role"],
      syndicateId: user.syndicateId ?? undefined,
      name: user.name,
    });

    // Issue a refresh token valid for 30 days
    const refreshTokenValue = signRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokensTable).values({
      userId: user.id,
      token: refreshTokenValue,
      expiresAt,
    });

    const { passwordHash: _, ...safeUser } = user;
    res.json({
      data: {
        token: accessToken,
        refreshToken: refreshTokenValue,
        user: safeUser,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Refresh Token ────────────────────────────────────────────────────────────

router.post("/auth/refresh", async (req, res) => {
  const schema = z.object({ refreshToken: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Token requis" });
    return;
  }
  try {
    const now = new Date();
    const [tokenRow] = await db
      .select()
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.token, result.data.refreshToken),
          gt(refreshTokensTable.expiresAt, now),
        ),
      );

    if (!tokenRow || tokenRow.revokedAt !== null) {
      res.status(401).json({ error: "Token invalide ou expiré" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, tokenRow.userId));
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Compte introuvable ou désactivé" });
      return;
    }

    // Rotate: revoke old token, issue new pair
    const newRefreshToken = signRefreshToken();
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await tx
        .update(refreshTokensTable)
        .set({ revokedAt: now })
        .where(eq(refreshTokensTable.id, tokenRow.id));
      await tx.insert(refreshTokensTable).values({
        userId: user.id,
        token: newRefreshToken,
        expiresAt: newExpiresAt,
      });
    });

    const accessToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role as JwtPayload["role"],
      syndicateId: user.syndicateId ?? undefined,
      name: user.name,
    });

    res.json({ data: { token: accessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Logout (revoke refresh token) ───────────────────────────────────────────

router.post("/auth/logout", async (req, res) => {
  const schema = z.object({ refreshToken: z.string().optional() });
  const result = schema.safeParse(req.body);
  const token = result.success ? result.data.refreshToken : undefined;
  if (token) {
    try {
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokensTable.token, token));
    } catch {
      // Best-effort
    }
  }
  res.json({ message: "Déconnecté" });
});

// ─── Me ───────────────────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    if (!user) {
      res.status(404).json({ error: "Utilisateur introuvable" });
      return;
    }
    const { passwordHash: _, ...safeUser } = user;
    res.json({ data: safeUser });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Change password ─────────────────────────────────────────────────────────

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  const { currentPassword, newPassword } = result.data;
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    if (!user) {
      res.status(404).json({ error: "Utilisateur introuvable" });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Mot de passe actuel incorrect" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    await db.transaction(async (tx) => {
      // Update the password
      await tx
        .update(usersTable)
        .set({ passwordHash, updatedAt: now })
        .where(eq(usersTable.id, user.id));
      // Revoke all existing refresh tokens — forces re-login on all devices after password change
      await tx
        .update(refreshTokensTable)
        .set({ revokedAt: now })
        .where(eq(refreshTokensTable.userId, user.id));
    });
    res.json({
      message: "Mot de passe modifié avec succès. Veuillez vous reconnecter.",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Profile ─────────────────────────────────────────────────────────────────

router.put("/profile", requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).optional(),
    profession: z.string().max(100).optional(),
    // Avatar is either a server-hosted object path ("/objects/uploads/<uuid>.jpg",
    // returned by POST /storage/uploads) or a full https URL — never an arbitrary
    // protocol or a local device URI (file://, content://, blob:).
    avatar: z
      .string()
      .max(500)
      .refine((v) => v.startsWith("/objects/") || v.startsWith("https://"), {
        message: "L'avatar doit être une image téléchargée sur le serveur",
      })
      .optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
    const [updated] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    const { passwordHash: _, ...safeUser } = updated;
    res.json({ data: safeUser, message: "Profil mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Forgot Password ─────────────────────────────────────────────────────────
// Always returns 200 to prevent user enumeration attacks.

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post("/auth/forgot-password", async (req, res) => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    // Still return 200 — don't reveal validation state
    res.json({
      message:
        "Si cet email existe, un lien de réinitialisation vous a été envoyé.",
    });
    return;
  }
  const { email } = result.data;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (user && user.status === "active") {
      // Invalidate any existing unexpired tokens for this user
      await db
        .update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            isNull(passwordResetTokensTable.usedAt),
          ),
        );

      // Generate a cryptographically secure token (64 hex chars = 256 bits)
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Date.now() + Number(process.env.RESET_TOKEN_EXPIRY_MS ?? 3_600_000), // default 1 hour
      );

      await db.insert(passwordResetTokensTable).values({
        userId: user.id,
        token,
        expiresAt,
      });

      try {
        await sendPasswordResetEmail(user.email, user.name, token, req);
      } catch (emailErr) {
        // Don't fail the request if email sending fails — log and continue
        req.log.error(emailErr, "Failed to send password reset email");
      }
    }

    // Always return the same response to prevent enumeration
    res.json({
      message:
        "Si cet email existe, un lien de réinitialisation vous a été envoyé.",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(64).max(64),
  newPassword: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

router.post("/auth/reset-password", async (req, res) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? "Données invalides";
    res.status(400).json({ error: msg });
    return;
  }
  const { token, newPassword } = result.data;

  try {
    const now = new Date();

    const [resetToken] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.token, token),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, now),
        ),
      );

    if (!resetToken) {
      res.status(400).json({
        code: "RESET_TOKEN_INVALID_OR_EXPIRED",
        error: "Lien de réinitialisation invalide ou expiré.",
      });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, resetToken.userId));

    if (!user || user.status !== "active") {
      res.status(400).json({
        code: "RESET_ACCOUNT_UNAVAILABLE",
        error: "Compte introuvable ou désactivé.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.transaction(async (tx) => {
      // Update the user's password
      await tx
        .update(usersTable)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));

      // Mark the token as used (one-time use)
      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(eq(passwordResetTokensTable.id, resetToken.id));

      // Revoke all existing refresh tokens for security
      await tx
        .update(refreshTokensTable)
        .set({ revokedAt: now })
        .where(eq(refreshTokensTable.userId, user.id));
    });

    res.json({
      message:
        "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── In-memory OTP rate limit (per email, 5 sends/hour) ──────────────────────
const _otpRate = new Map<string, { count: number; resetAt: number }>();
function checkOtpRate(email: string): boolean {
  const now = Date.now();
  const e = _otpRate.get(email);
  if (!e || now > e.resetAt) {
    _otpRate.set(email, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (e.count >= 5) return false;
  e.count++;
  return true;
}

// ─── POST /auth/otp/send ─────────────────────────────────────────────────────
router.post("/auth/otp/send", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Adresse email invalide" });
    return;
  }
  const em = email.trim().toLowerCase();
  if (!checkOtpRate(em)) {
    res
      .status(429)
      .json({ error: "Trop de tentatives. Réessayez dans 1 heure." });
    return;
  }
  try {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 min

    await db.delete(otpTokensTable).where(eq(otpTokensTable.email, em));
    await db.insert(otpTokensTable).values({
      email: em,
      codeHash,
      purpose: "email_verification",
      expiresAt,
    } as any);

    const subject = "Votre code de vérification MIZAN";
    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #E2E8F0;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;background:#EFF6FF;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:24px;">🔐</span>
          </div>
        </div>
        <h2 style="color:#0A1628;font-size:22px;margin:0 0 8px;text-align:center;">Vérifiez votre email</h2>
        <p style="color:#64748B;font-size:14px;text-align:center;margin:0 0 28px;">Utilisez ce code pour finaliser la création de votre compte MIZAN.</p>
        <div style="background:#EFF6FF;border:2px solid #2563EB;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#2563EB;">${code}</span>
        </div>
        <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">Ce code expire dans <strong>10 minutes</strong>. Ne le partagez avec personne.</p>
      </div>`;
    await sendTransactionalEmail({ to: em, subject, html, template: "otp" });
    res.json({ message: "Code envoyé", expiresIn: 600 });
  } catch (err) {
    req.log.error(err, "POST /auth/otp/send error");
    res.status(500).json({
      error: "Impossible d'envoyer le code. Vérifiez l'adresse email.",
    });
  }
});

// ─── POST /auth/otp/verify ───────────────────────────────────────────────────
router.post("/auth/otp/verify", async (req, res) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email || !code) {
    res.status(400).json({ error: "Email et code requis" });
    return;
  }
  const em = email.trim().toLowerCase();
  try {
    const now = new Date();
    const [token] = await db
      .select()
      .from(otpTokensTable)
      .where(
        and(
          eq(otpTokensTable.email, em),
          eq(otpTokensTable.purpose, "email_verification"),
          isNull(otpTokensTable.usedAt),
          gt(otpTokensTable.expiresAt, now),
        ),
      )
      .orderBy(desc(otpTokensTable.createdAt))
      .limit(1);

    if (!token) {
      res.status(400).json({
        error: "Code expiré ou introuvable. Demandez un nouveau code.",
      });
      return;
    }

    const attempts = (token.attempts ?? 0) + 1;
    await db
      .update(otpTokensTable)
      .set({ attempts } as any)
      .where(eq(otpTokensTable.id, token.id));

    if (attempts > 5) {
      res.status(429).json({
        error: "Trop de tentatives incorrectes. Demandez un nouveau code.",
      });
      return;
    }

    const valid = await bcrypt.compare(code.trim(), token.codeHash);
    if (!valid) {
      res.status(400).json({
        error: `Code incorrect (${6 - attempts} tentatives restantes).`,
      });
      return;
    }

    await db
      .update(otpTokensTable)
      .set({ usedAt: now } as any)
      .where(eq(otpTokensTable.id, token.id));
    res.json({ verified: true, message: "Email vérifié avec succès" });
  } catch (err) {
    req.log.error(err, "POST /auth/otp/verify error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /auth/sms/send ──────────────────────────────────────────────────────
// Sends a 6-digit SMS OTP via ZimSend.
router.post("/auth/sms/send", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || phone.trim().length < 6) {
    res.status(400).json({ error: "Numéro de téléphone requis" });
    return;
  }
  try {
    const { sendOtp } = await import("../lib/zimsend.service.js");
    const result = await sendOtp(phone.trim());
    if (!result.ok) {
      const status =
        result.errorCode === "RESEND_TOO_SOON"
          ? 429
          : result.errorCode === "INVALID_PHONE"
            ? 400
            : result.errorCode === "NOT_CONFIGURED"
              ? 503
              : 502;
      res.status(status).json({ error: result.error, code: result.errorCode });
      return;
    }
    req.log.info({ phone: result.phone }, "SMS OTP envoyé via ZimSend");
    res.json({
      message: "Code SMS envoyé",
      phone: result.phone,
      expiresIn: result.expiresIn,
    });
  } catch (err: any) {
    req.log.error(err, "POST /auth/sms/send error");
    res.status(500).json({ error: err?.message ?? "Erreur serveur" });
  }
});

// ─── POST /auth/sms/verify ────────────────────────────────────────────────────
// Verifies a 6-digit SMS OTP code via ZimSend.
router.post("/auth/sms/verify", async (req, res) => {
  const { phone, code } = req.body as { phone?: string; code?: string };
  if (!phone || !code) {
    res.status(400).json({ error: "Numéro de téléphone et code requis" });
    return;
  }
  try {
    const { verifyOtp } = await import("../lib/zimsend.service.js");
    const result = await verifyOtp(phone.trim(), code.trim());
    if (!result.ok) {
      const status =
        result.errorCode === "MAX_ATTEMPTS"
          ? 429
          : result.errorCode === "INVALID_PHONE"
            ? 400
            : 400;
      res.status(status).json({
        error: result.error,
        code: result.errorCode,
        attemptsLeft: result.attemptsLeft,
      });
      return;
    }
    req.log.info(
      { phone: result.phone },
      "SMS OTP vérifié avec succès via ZimSend",
    );
    res.json({
      verified: true,
      phone: result.phone,
      message: "Téléphone vérifié avec succès",
    });
  } catch (err: any) {
    req.log.error(err, "POST /auth/sms/verify error");
    res.status(500).json({ error: err?.message ?? "Erreur serveur" });
  }
});

// ─── POST /auth/verify-phone ──────────────────────────────────────────────────
// Alias for /auth/sms/verify — validates phone + code, returns { success, verified }.
router.post("/auth/verify-phone", async (req, res) => {
  const { phone, code } = req.body as { phone?: string; code?: string };
  if (!phone || !code) {
    res.status(400).json({ success: false, error: "phone et code requis" });
    return;
  }
  try {
    const { verifyOtp } = await import("../lib/zimsend.service.js");
    const result = await verifyOtp(phone.trim(), code.trim());
    if (!result.ok) {
      const status = result.errorCode === "MAX_ATTEMPTS" ? 429 : 400;
      res.status(status).json({
        success: false,
        verified: false,
        error: result.error,
        code: result.errorCode,
      });
      return;
    }
    req.log.info({ phone: result.phone }, "verify-phone: OTP vérifié");
    res.json({ success: true, verified: true });
  } catch (err: any) {
    req.log.error(err, "POST /auth/verify-phone error");
    res
      .status(500)
      .json({ success: false, error: err?.message ?? "Erreur serveur" });
  }
});

// ─── GET /auth/sms/status ─────────────────────────────────────────────────────
// Health-check for ZimSend config.
router.get("/auth/sms/status", async (_req, res) => {
  const { zimSendConfigured } = await import("../lib/zimsend.service.js");
  res.json({ provider: "ZimSend", configured: zimSendConfigured() });
});

export default router;
