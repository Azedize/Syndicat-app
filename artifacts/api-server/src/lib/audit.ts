import { Request } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";

interface AuditPayload {
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
}

export async function serverAuditLog(req: Request, payload: AuditPayload): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: req.user!.userId,
      userName: req.user!.name,
      syndicateId: req.user!.syndicateId,
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
