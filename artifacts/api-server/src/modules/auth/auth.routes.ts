import { Router } from "express";
import { initialEmailStatus, isReservedEmail, reservedEmailRefused, RESERVED_EMAIL_ERROR } from "../../lib/email/deliverability.js";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  usersTable,
  refreshTokensTable,
  passwordResetTokensTable,
  otpTokensTable,
  syndicatesTable,
} from "@workspace/db/schema";
import {
  eq,
  and,
  gt,
  isNull,
  desc,
  sql,
} from "drizzle-orm";
import {
  requireAuth,
  signRefreshToken,
  hashToken,
  signFileTicket,
  FILE_TICKET_TTL_SECONDS,
  BCRYPT_COST,
} from "../../middleware/auth.js";
import { sendTransactionalEmail } from "../../lib/email/emailService.js";
import { emailLang, passwordChangedTemplate, passwordResetCodeTemplate, verificationCodeTemplate } from "../../lib/email/templates.js";
import { serverAuditLog } from "../../lib/audit.js";
import { listContexts, resolveContextRole } from "../../lib/access.js";
import {
  accessTokenFor,
  defaultContext,
  issueRefreshToken,
  checkOtpRate,
  REFRESH_TOKEN_TTL_MS,
} from "./auth.service.js";


const router = Router();

// A refresh token presented again within this window after its rotation is
// treated as a benign client race (two parallel refreshes), not as theft.
const REFRESH_REUSE_GRACE_MS = 10_000;

// Compared against when the email is unknown so that login takes the same time
// whether or not the account exists (prevents account enumeration by timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("mizan-timing-equalizer", BCRYPT_COST);

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
  if (reservedEmailRefused(emailLower)) return void res.status(400).json(RESERVED_EMAIL_ERROR);

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, emailLower));
    if (existing) {
      res.status(409).json({ error: "Cet email est déjà utilisé" });
      return;
    }

    const verificationCutoff = new Date(Date.now() - 15 * 60_000);
    const [verifiedOtp] = await db
      .select({ id: otpTokensTable.id })
      .from(otpTokensTable)
      .where(
        and(
          eq(otpTokensTable.email, emailLower),
          eq(otpTokensTable.purpose, "email_verification"),
          gt(otpTokensTable.usedAt, verificationCutoff),
        ),
      )
      .orderBy(desc(otpTokensTable.usedAt))
      .limit(1);
    if (!verifiedOtp) {
      res.status(403).json({
        error: "Veuillez vérifier votre adresse email avant de créer le compte.",
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        name: name.trim(),
        email: emailLower,
        phone: phone?.trim() ?? null,
        passwordHash,
        role: "syndicate_admin",
        status: "active",
        emailStatus: initialEmailStatus(emailLower, true),
      } as any)
      .returning();

    const accessToken = accessTokenFor(newUser);
    const refreshTokenValue = await issueRefreshToken(newUser.id);

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
    if (res.headersSent) return;
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Email ou mot de passe invalide" });
    return;
  }
  const { password } = result.data;
  const email = result.data.email.trim().toLowerCase();
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    // Always run one bcrypt comparison so response time does not reveal
    // whether the email is registered.
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid) {
      res.status(401).json({ error: "Email ou mot de passe incorrect" });
      return;
    }
    if (user.status !== "active") {
      // The code lets the app explain the situation in the reader's language.
      res.status(403).json(
        user.status === "pending"
          ? { error: "Compte en attente d'activation", code: "ACCOUNT_PENDING" }
          : { error: "Compte désactivé", code: "ACCOUNT_DISABLED" },
      );
      return;
    }

    const context = await defaultContext(user);
    const accessToken = accessTokenFor(user, context);
    const refreshTokenValue = await issueRefreshToken(user.id, context?.syndicateId);

    const { passwordHash: _, ...safeUser } = user;
    res.json({
      data: {
        token: accessToken,
        refreshToken: refreshTokenValue,
        user: { ...safeUser, role: context?.role ?? safeUser.role, syndicateId: context?.syndicateId ?? safeUser.syndicateId },
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
          eq(refreshTokensTable.token, hashToken(result.data.refreshToken)),
          gt(refreshTokensTable.expiresAt, now),
        ),
      );

    if (!tokenRow) {
      res.status(401).json({ error: "Token invalide ou expiré" });
      return;
    }

    if (tokenRow.revokedAt !== null) {
      // A rotated token presented again outside the race window means it was
      // copied: revoke every session of this user (refresh-token reuse
      // detection, OAuth 2.0 Security Best Current Practice).
      if (now.getTime() - tokenRow.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        await db
          .update(refreshTokensTable)
          .set({ revokedAt: now })
          .where(
            and(
              eq(refreshTokensTable.userId, tokenRow.userId),
              isNull(refreshTokensTable.revokedAt),
            ),
          );
        req.log.warn(
          { userId: tokenRow.userId },
          "Refresh token reuse detected — all sessions revoked",
        );
      }
      res.status(401).json({ error: "Token invalide ou expiré" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, tokenRow.userId));
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Compte introuvable ou désactivé", code: "ACCOUNT_DISABLED" });
      return;
    }

    // The session keeps the condominium it selected, as long as the grant
    // still exists; otherwise it falls back to the account's default context.
    const context =
      (tokenRow.contextSyndicateId ? await resolveContextRole(user.id, tokenRow.contextSyndicateId) : null) ??
      (await defaultContext(user));

    // Rotate atomically: only the request that actually revokes the old token
    // may issue a new pair (a concurrent refresh loses and gets 401).
    const newRefreshToken = signRefreshToken();
    const rotated = await db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(refreshTokensTable)
        .set({ revokedAt: now })
        .where(
          and(
            eq(refreshTokensTable.id, tokenRow.id),
            isNull(refreshTokensTable.revokedAt),
          ),
        )
        .returning({ id: refreshTokensTable.id });
      if (!revoked) return false;
      await tx.insert(refreshTokensTable).values({
        userId: user.id,
        token: hashToken(newRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        contextSyndicateId: context?.syndicateId ?? null,
      });
      return true;
    });
    if (!rotated) {
      res.status(401).json({ error: "Token invalide ou expiré" });
      return;
    }

    res.json({
      data: { token: accessTokenFor(user, context), refreshToken: newRefreshToken },
    });
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
        .where(eq(refreshTokensTable.token, hashToken(token)));
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
    // Role and condominium are those of the session's current context.
    const [syndicate] = req.user!.syndicateId
      ? await db
          .select({ name: syndicatesTable.name, status: syndicatesTable.status, organizationId: syndicatesTable.organizationId })
          .from(syndicatesTable)
          .where(eq(syndicatesTable.id, req.user!.syndicateId))
      : [];
    res.json({
      data: {
        ...safeUser,
        role: req.user!.role,
        syndicateId: req.user!.syndicateId ?? null,
        syndicateName: syndicate?.name ?? null,
        syndicateStatus: syndicate?.status ?? null,
        organizationId: syndicate?.organizationId ?? null,
        homeSyndicateId: safeUser.syndicateId,
        homeRole: safeUser.role,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Condominium context ─────────────────────────────────────────────────────

/** Condominiums the signed-in person can switch to, with their role in each. */
router.get("/me/contexts", requireAuth, async (req, res) => {
  try {
    const contexts = await listContexts(req.user!.userId);
    res.json({ data: contexts.map((c) => ({ ...c, current: c.syndicateId === req.user!.syndicateId })) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const switchContextSchema = z.object({ syndicateId: z.string().min(1), refreshToken: z.string().min(1) }).strict();

/**
 * Switches the session to another condominium. The server decides the role
 * there (assignment / company / home) — the client only names the target.
 * The presented refresh token is revoked and a new pair bound to the new
 * context is issued, so the previous context cannot be resumed by a refresh.
 */
router.post("/auth/context", requireAuth, async (req, res) => {
  const parsed = switchContextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Copropriété et session requises", code: "INVALID_CONTEXT" });
    return;
  }
  try {
    const userId = req.user!.userId;
    const context = await resolveContextRole(userId, parsed.data.syndicateId);
    if (!context) {
      res.status(403).json({ error: "Vous n'avez pas accès à cette copropriété", code: "CONTEXT_FORBIDDEN" });
      return;
    }
    const [syndicate] = await db
      .select({ status: syndicatesTable.status, name: syndicatesTable.name })
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, context.syndicateId));
    if (syndicate?.status === "archived" && context.via !== "org_admin") {
      res.status(403).json({ error: "Cette copropriété est archivée", code: "CONDOMINIUM_ARCHIVED" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Compte désactivé", code: "ACCOUNT_DISABLED" });
      return;
    }
    const newRefreshToken = signRefreshToken();
    const switched = await db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokensTable.token, hashToken(parsed.data.refreshToken)),
            eq(refreshTokensTable.userId, userId),
            isNull(refreshTokensTable.revokedAt),
          ),
        )
        .returning({ id: refreshTokensTable.id });
      if (!revoked) return false;
      await tx.insert(refreshTokensTable).values({
        userId,
        token: hashToken(newRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        contextSyndicateId: context.syndicateId,
      });
      return true;
    });
    if (!switched) {
      res.status(401).json({ error: "Session invalide : reconnectez-vous", code: "INVALID_SESSION" });
      return;
    }
    await serverAuditLog(req, {
      action: "CONTEXT_SWITCHED",
      entity: "syndicate",
      entityId: context.syndicateId,
      syndicateId: context.syndicateId,
      details: `${context.role} (${context.via})`,
    });
    res.json({
      data: {
        token: accessTokenFor(user, context),
        refreshToken: newRefreshToken,
        context: { syndicateId: context.syndicateId, role: context.role, via: context.via, name: syndicate?.name, status: syndicate?.status },
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Download ticket ─────────────────────────────────────────────────────────
// PDFs and private images opened by URL (Linking.openURL, <Image>, WebView)
// cannot send an Authorization header. Instead of putting the session token in
// the URL, the client exchanges it for a 5-minute, GET-only ticket.

router.post("/auth/file-ticket", requireAuth, (req, res) => {
  res.json({
    data: {
      ticket: signFileTicket(req.user!),
      expiresIn: FILE_TICKET_TTL_SECONDS,
    },
  });
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
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      res.status(400).json({
        error: "Le nouveau mot de passe doit être différent de l'actuel",
      });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const now = new Date();
    await db.transaction(async (tx) => {
      // Update the password
      await tx
        .update(usersTable)
        .set({ passwordHash, mustChangePassword: false, passwordChangedAt: now, updatedAt: now })
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

// Only these fields: role, condominium, status, e-mail (own flow) and the
// like are not part of the schema, so they are dropped, never written.
router.put("/profile", requireAuth, async (req, res) => {
  // Text without control characters; surrounding spaces removed.
  const cleanText = (max: number) =>
    z
      .string()
      .transform((v) => v.replace(/\s+/g, " ").trim())
      .refine((v) => v.length <= max, { message: `${max} caractères au maximum` })
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), { message: "Caractères non autorisés" });
  const schema = z.object({
    name: cleanText(100).refine((v) => v.length >= 2, { message: "Le nom doit contenir au moins 2 caractères" }).optional(),
    // Empty clears the number; otherwise it is stored in E.164 (+212…).
    phone: z.string().max(30).optional(),
    profession: cleanText(100).optional(),
    // Language of push notifications, set by the app when the user changes it.
    language: z.enum(["fr", "en", "ar", "es"]).optional(),
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
    const issue = result.error.issues[0];
    res.status(400).json({ error: issue?.message && issue.message !== "Required" ? issue.message : "Données invalides", code: "PROFILE_INVALID", field: issue?.path?.[0] });
    return;
  }
  const changes: Record<string, unknown> = { ...result.data };
  if (typeof changes.phone === "string") {
    const raw = (changes.phone as string).trim();
    if (!raw) changes.phone = null;
    else {
      const { normalizePhone } = await import("../../integrations/zimsend.service.js");
      try {
        changes.phone = normalizePhone(raw);
      } catch {
        res.status(400).json({ error: "Numéro de téléphone invalide (ex. : 06 XX XX XX XX ou +212 6 XX XX XX XX)", code: "PHONE_INVALID", field: "phone" });
        return;
      }
    }
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Aucune modification fournie", code: "PROFILE_INVALID" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ ...changes, updatedAt: new Date() })
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
// Sends a six-digit code by email (same policy as the sign-up code: bcrypt hash,
// 10 minutes, 5 attempts, 5 codes per hour and address). The answer is the same
// and immediate whether or not the address belongs to an account (no enumeration).

const RESET_CODE_PURPOSE = "password_reset";
const RESET_CODE_TTL_MIN = 10;
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_CODES_PER_HOUR = 5;
const RESET_GENERIC_ANSWER = {
  message: "Si un compte actif utilise cette adresse, un code de réinitialisation vient d'y être envoyé.",
  expiresIn: RESET_CODE_TTL_MIN * 60,
};
// Compared against when no code exists, so that both cases take the same time.
const DUMMY_CODE_HASH = bcrypt.hashSync("000000-timing", 8);

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

/** Creates and sends a code. Runs after the answer: nothing observable depends on the account. */
async function issueResetCode(email: string, log: { warn: (o: object, m: string) => void; error: (o: object, m: string) => void }) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || user.status !== "active") return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 8);
  // One request at a time per address: the hourly limit and "one open code" hold under parallel requests.
  const issued = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email}))`);
    const since = new Date(Date.now() - 3600_000);
    const [{ recent }] = await tx
      .select({ recent: sql<number>`count(*)::int` })
      .from(otpTokensTable)
      .where(and(eq(otpTokensTable.email, email), eq(otpTokensTable.purpose, RESET_CODE_PURPOSE), gt(otpTokensTable.createdAt, since)));
    if (recent >= RESET_CODES_PER_HOUR) return false;
    // A new code replaces every earlier one (codes and legacy reset links).
    const now = new Date();
    await tx
      .update(otpTokensTable)
      .set({ usedAt: now } as any)
      .where(and(eq(otpTokensTable.email, email), eq(otpTokensTable.purpose, RESET_CODE_PURPOSE), isNull(otpTokensTable.usedAt)));
    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokensTable.userId, user.id), isNull(passwordResetTokensTable.usedAt)));
    await tx.insert(otpTokensTable).values({
      email,
      codeHash,
      purpose: RESET_CODE_PURPOSE,
      expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MIN * 60_000),
    } as any);
    return true;
  });
  if (!issued) {
    log.warn({ userId: user.id }, "Password reset code limit reached");
    return;
  }

  const lang = emailLang(user.language);
  const tpl = passwordResetCodeTemplate(user.name, code, RESET_CODE_TTL_MIN, lang);
  const sent = await sendTransactionalEmail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    lang,
    template: "password_reset",
    syndicateId: user.syndicateId,
  });
  if (!sent.ok) log.error({ userId: user.id, error: sent.error, skipped: sent.skipped }, "Password reset code not sent");
}

router.post("/auth/forgot-password", (req, res) => {
  const result = forgotPasswordSchema.safeParse(req.body);
  // Answered before any lookup: the delay of an SMTP send would reveal that the account exists.
  res.json(RESET_GENERIC_ANSWER);
  if (!result.success) return;
  issueResetCode(result.data.email.toLowerCase(), req.log).catch((err) => req.log.error(err, "Password reset code failed"));
});

// ─── Reset Password ───────────────────────────────────────────────────────────
// { email, code, newPassword }. The 64-character token of the former e-mail link
// ({ token, newPassword }) is still accepted until those links expire.

const resetPasswordSchema = z.union([
  z.object({
    email: z.string().trim().email(),
    code: z.string().trim().regex(/^\d{6}$/, "Le code comporte 6 chiffres"),
    newPassword: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  }),
  z.object({
    token: z.string().min(64).max(64),
    newPassword: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  }),
]);

const RESET_CODE_INVALID = {
  code: "RESET_CODE_INVALID",
  error: "Code incorrect ou expiré. Vérifiez le code ou demandez-en un nouveau.",
};

/** Sets the new password, closes every session, and sends the security notice. */
async function applyNewPassword(
  user: typeof usersTable.$inferSelect,
  newPassword: string,
  consume: (tx: any, now: Date) => Promise<void>,
) {
  const now = new Date();
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await db.transaction(async (tx) => {
    // A reset also clears temporary credentials.
    await tx
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false, passwordChangedAt: now, updatedAt: now })
      .where(eq(usersTable.id, user.id));
    await consume(tx, now);
    // Every other code or link still open for this account dies with the reset.
    await tx
      .update(otpTokensTable)
      .set({ usedAt: now } as any)
      .where(and(eq(otpTokensTable.email, user.email.toLowerCase()), eq(otpTokensTable.purpose, RESET_CODE_PURPOSE), isNull(otpTokensTable.usedAt)));
    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokensTable.userId, user.id), isNull(passwordResetTokensTable.usedAt)));
    // Every open session ends: a reset usually means the old password leaked.
    await tx
      .update(refreshTokensTable)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokensTable.userId, user.id), isNull(refreshTokensTable.revokedAt)));
  });
  // After the commit only: the notice must never announce a change that failed.
  const lang = emailLang(user.language);
  const tpl = passwordChangedTemplate(user.name, now, lang);
  sendTransactionalEmail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    lang,
    template: "password_changed",
    syndicateId: user.syndicateId,
  }).catch(() => {});
}

const RESET_DONE = { message: "Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter." };

router.post("/auth/reset-password", async (req, res) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.issues[0]?.message ?? "Données invalides";
    res.status(400).json({ error: msg });
    return;
  }

  try {
    const now = new Date();

    if ("code" in result.data) {
      const { code, newPassword } = result.data;
      const email = result.data.email.toLowerCase();
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
      const [otp] = user && user.status === "active"
        ? await db
            .select()
            .from(otpTokensTable)
            .where(
              and(
                eq(otpTokensTable.email, email),
                eq(otpTokensTable.purpose, RESET_CODE_PURPOSE),
                isNull(otpTokensTable.usedAt),
                gt(otpTokensTable.expiresAt, now),
              ),
            )
            .orderBy(desc(otpTokensTable.createdAt))
            .limit(1)
        : [];

      if (!user || !otp) {
        await bcrypt.compare(code, DUMMY_CODE_HASH);
        res.status(400).json(RESET_CODE_INVALID);
        return;
      }

      // Count the attempt before comparing, so parallel guesses cannot exceed the limit.
      const [counted] = await db
        .update(otpTokensTable)
        .set({ attempts: sql`${otpTokensTable.attempts} + 1` } as any)
        .where(and(eq(otpTokensTable.id, otp.id), isNull(otpTokensTable.usedAt)))
        .returning({ attempts: otpTokensTable.attempts });
      if (!counted || (counted.attempts ?? 0) > RESET_CODE_MAX_ATTEMPTS) {
        // Too many guesses: this code is dead, a new one must be requested.
        await db.update(otpTokensTable).set({ usedAt: now } as any).where(eq(otpTokensTable.id, otp.id));
        res.status(429).json({
          code: "RESET_CODE_LOCKED",
          error: "Trop de tentatives incorrectes. Demandez un nouveau code.",
        });
        return;
      }

      if (!(await bcrypt.compare(code, otp.codeHash))) {
        res.status(400).json(RESET_CODE_INVALID);
        return;
      }

      await applyNewPassword(user, newPassword, async (tx, at) => {
        // Single use: the update only succeeds while the code is still unused.
        const used = await tx
          .update(otpTokensTable)
          .set({ usedAt: at })
          .where(and(eq(otpTokensTable.id, otp.id), isNull(otpTokensTable.usedAt)))
          .returning({ id: otpTokensTable.id });
        if (!used.length) throw Object.assign(new Error("code already used"), { resetCodeUsed: true });
      });
      res.json(RESET_DONE);
      return;
    }

    // Former e-mail link (64-character token).
    const { token, newPassword } = result.data;
    const [resetToken] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.token, hashToken(token)),
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, resetToken.userId));
    if (!user || user.status !== "active") {
      res.status(400).json({
        code: "RESET_ACCOUNT_UNAVAILABLE",
        error: "Compte introuvable ou désactivé.",
      });
      return;
    }
    await applyNewPassword(user, newPassword, async (tx, at) => {
      const used = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: at })
        .where(and(eq(passwordResetTokensTable.id, resetToken.id), isNull(passwordResetTokensTable.usedAt)))
        .returning({ id: passwordResetTokensTable.id });
      if (!used.length) throw Object.assign(new Error("token already used"), { resetCodeUsed: true });
    });
    res.json(RESET_DONE);
  } catch (err: any) {
    if (err?.resetCodeUsed) {
      res.status(400).json(RESET_CODE_INVALID);
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


// ─── POST /auth/otp/send ─────────────────────────────────────────────────────
router.post("/auth/otp/send", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Adresse email invalide" });
    return;
  }
  const em = email.trim().toLowerCase();
  // A reserved address can never receive a code: say so instead of a 502.
  if (isReservedEmail(em)) {
    return void res.status(400).json(RESERVED_EMAIL_ERROR);
  }
  try {
    if (!(await checkOtpRate(em))) {
      res
        .status(429)
        .json({ error: "Trop de tentatives. Réessayez dans 1 heure." });
      return;
    }
    const code = String(randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 min

    await db.insert(otpTokensTable).values({
      email: em,
      codeHash,
      purpose: "email_verification",
      expiresAt,
    } as any);

    const lang = emailLang(req.headers["accept-language"]);
    const tpl = verificationCodeTemplate("signup", code, 10, lang);
    const result = await sendTransactionalEmail({ to: em, subject: tpl.subject, html: tpl.html, text: tpl.text, lang, template: "otp" });
    if (!result.ok) {
      res.status(502).json({ error: "Le service email est indisponible. Réessayez plus tard." });
      return;
    }
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
    const { sendOtp } = await import("../../integrations/zimsend.service.js");
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
    const { verifyOtp } = await import("../../integrations/zimsend.service.js");
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
    const { verifyOtp } = await import("../../integrations/zimsend.service.js");
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
  const { zimSendConfigured } = await import("../../integrations/zimsend.service.js");
  res.json({ provider: "ZimSend", configured: zimSendConfigured() });
});

export default router;
