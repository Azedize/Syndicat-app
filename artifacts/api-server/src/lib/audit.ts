import { Request } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";

interface AuditPayload {
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  /** The syndicate this action actually affected — pass this explicitly when the
   *  actor (e.g. a super_admin using ?syndicateId=) may not match req.user.syndicateId,
   *  so supervision actions are traceable to the real syndicate they touched. */
  syndicateId?: string;
  /** Set true for platform-level actions a super_admin takes outside any single
   *  syndicate's scope (e.g. creating a syndicate, managing subscriptions) — these
   *  are normal super_admin duties, not supervision of someone else's syndicate. */
  platformAction?: boolean;
}

export async function serverAuditLog(req: Request, payload: AuditPayload): Promise<void> {
  try {
    const role = req.user!.role;
    const syndicateId = payload.syndicateId ?? req.user!.syndicateId;
    // A super_admin has no syndicate of their own to operate in day-to-day, so any
    // syndicate-scoped action they take is by definition supervision/support — never
    // a normal syndicate_admin-style action. Explicit platform-level actions are exempt.
    const isSupervision = role === "super_admin" && !payload.platformAction && !!syndicateId;

    await db.insert(auditLogsTable).values({
      userId: req.user!.userId,
      userName: req.user!.name,
      actorRole: role,
      syndicateId,
      isSupervision,
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId,
      details: payload.details,
      ipAddress: req.ip ?? req.socket?.remoteAddress,
    });
  } catch {
    // Non-blocking — audit log failure must never break the main operation
  }
}
