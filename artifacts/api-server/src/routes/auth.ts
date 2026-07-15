import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable, passwordResetTokensTable } from "@workspace/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { requireAuth, signToken, signRefreshToken, type JwtPayload } from "../middleware/auth.js";
import { sendTransactionalEmail } from "../lib/email/emailService.js";
import { passwordResetTemplate } from "../lib/email/templates.js";

/**
 * Sends a password reset email via the centralized EmailService (real Gmail SMTP,
 * retry-on-failure, and email_logs/audit trail — see lib/email/emailService.ts).
 */
async function sendPasswordResetEmail(email: string, name: string, token: string, req: any) {
  const resetUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/reset-password?token=${token}`
    : `[APP_URL not set] token=${token}`;

  const { subject, html } = passwordResetTemplate(name, resetUrl);
  await sendTransactionalEmail({ to: email, subject, html, template: "password_reset" });
  req.log.info({ to: email }, "Password reset email dispatched");
}

const router = Router();

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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
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
    res.json({ data: { token: accessToken, refreshToken: refreshTokenValue, user: safeUser } });
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

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tokenRow.userId));
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
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
      await tx.update(usersTable).set({ passwordHash, updatedAt: now }).where(eq(usersTable.id, user.id));
      // Revoke all existing refresh tokens — forces re-login on all devices after password change
      await tx.update(refreshTokensTable).set({ revokedAt: now }).where(eq(refreshTokensTable.userId, user.id));
    });
    res.json({ message: "Mot de passe modifié avec succès. Veuillez vous reconnecter." });
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
    await db.update(usersTable).set({ ...result.data, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.userId));
    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
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
    res.json({ message: "Si cet email existe, un lien de réinitialisation vous a été envoyé." });
    return;
  }
  const { email } = result.data;

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

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
    res.json({ message: "Si cet email existe, un lien de réinitialisation vous a été envoyé." });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(64).max(64),
  newPassword: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
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
      res.status(400).json({ error: "Lien de réinitialisation invalide ou expiré." });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, resetToken.userId));

    if (!user || user.status !== "active") {
      res.status(400).json({ error: "Compte introuvable ou désactivé." });
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

    res.json({ message: "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter." });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
