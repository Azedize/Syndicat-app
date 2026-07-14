import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { meetingsTable, meetingAttendeesTable, usersTable } from "@workspace/db/schema";
import { eq, and, inArray, asc, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { sendEmailToMany } from "../lib/notify.js";
import { meetingInvitationTemplate } from "../lib/email/templates.js";

const router = Router();

const ALL_MEETING_TYPES = ["board", "general", "committee", "emergency", "ag_ordinaire", "ag_extraordinaire", "ag_constitutive", "ag_elective"] as const;

router.get("/meetings", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    // Tenants do not participate in meetings (not copropriétaires)
    if (user.role === "tenant") {
      return void res.status(403).json({ error: "Les locataires n'ont pas accès aux assemblées générales" });
    }

    // Non-super users must have syndicateId in JWT — never fall through to global scope
    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const meetings = user.role === "super_admin"
      ? await db.select().from(meetingsTable).orderBy(asc(meetingsTable.date))
      : await db.select().from(meetingsTable)
          .where(eq(meetingsTable.syndicateId, user.syndicateId!))
          .orderBy(asc(meetingsTable.date));

    if (meetings.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    const meetingIds = meetings.map((m) => m.id);
    const allAttendees = await db
      .select()
      .from(meetingAttendeesTable)
      .where(inArray(meetingAttendeesTable.meetingId, meetingIds));

    const attendeesByMeeting = allAttendees.reduce<Record<string, typeof allAttendees>>((acc, a) => {
      if (!acc[a.meetingId]) acc[a.meetingId] = [];
      acc[a.meetingId].push(a);
      return acc;
    }, {});

    const withAttendance = meetings.map((m) => {
      const attendees = attendeesByMeeting[m.id] ?? [];
      const userConfirmed = attendees.some((a) => a.userId === user.userId);
      const agendaLines = m.agenda
        ? m.agenda.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      return { ...m, attendees: attendees.length, userConfirmed, agendaLines };
    });

    res.json({ data: withAttendance, total: withAttendance.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/meetings", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    date: z.string(),
    time: z.string(),
    location: z.string(),
    type: z.enum(ALL_MEETING_TYPES).default("general"),
    description: z.string().default(""),
    agenda: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const user = req.user!;

    // syndicate_admin must have a syndicateId — hard fail to prevent unscoped records
    if (user.role === "syndicate_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const syndicateId = user.syndicateId ?? "";
    const [meeting] = await db.insert(meetingsTable).values({
      ...result.data,
      syndicateId,
      status: "scheduled",
      createdBy: user.userId,
    }).returning();

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "meeting",
      entityId: meeting.id,
      syndicateId: syndicateId || undefined,
      details: `Réunion créée: ${meeting.title} le ${meeting.date}`,
    });

    // Invite every member of the syndicate (tenants don't attend meetings — see GET guard above)
    if (syndicateId) {
      const recipients = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(and(eq(usersTable.syndicateId, syndicateId), ne(usersTable.role, "tenant")));
      const { subject, html } = meetingInvitationTemplate(meeting.title, meeting.date, meeting.time, meeting.location, meeting.agenda);
      sendEmailToMany(recipients.map((r) => r.email), subject, html, "meeting_invitation", syndicateId).catch(() => {});
    }

    res.status(201).json({ data: meeting, message: "Réunion créée avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/meetings/:id", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
    agenda: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const user = req.user!;

    if (user.role === "syndicate_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const whereClause = user.role === "super_admin"
      ? eq(meetingsTable.id, String(req.params.id))
      : and(eq(meetingsTable.id, String(req.params.id)), eq(meetingsTable.syndicateId, user.syndicateId!));

    const [meeting] = await db
      .update(meetingsTable)
      .set(result.data)
      .where(whereClause)
      .returning();
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable ou accès refusé" }); return; }

    await serverAuditLog(req, {
      action: "UPDATE",
      entity: "meeting",
      entityId: String(req.params.id),
      syndicateId: meeting.syndicateId || undefined,
      details: `Réunion mise à jour: ${JSON.stringify(result.data)}`,
    });

    res.json({ data: meeting, message: "Réunion mise à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/meetings/:id", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  try {
    const user = req.user!;

    if (user.role === "syndicate_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const whereClause = user.role === "super_admin"
      ? eq(meetingsTable.id, String(req.params.id))
      : and(eq(meetingsTable.id, String(req.params.id)), eq(meetingsTable.syndicateId, user.syndicateId!));

    const [meeting] = await db.delete(meetingsTable).where(whereClause).returning();
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable ou accès refusé" }); return; }

    await serverAuditLog(req, {
      action: "DELETE",
      entity: "meeting",
      entityId: String(req.params.id),
      syndicateId: meeting.syndicateId || undefined,
      details: `Réunion supprimée: ${meeting.title}`,
    });

    res.json({ message: "Réunion supprimée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/meetings/:id/attend", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const user = req.user!;

  // Tenants cannot attend AG meetings
  if (user.role === "tenant") {
    return void res.status(403).json({ error: "Les locataires n'ont pas accès aux assemblées générales" });
  }

  // Non-super users must have syndicateId — hard fail
  if (user.role !== "super_admin" && !user.syndicateId) {
    return void res.status(403).json({ error: "Syndicat non défini dans le token" });
  }

  try {
    const [meeting] = await db
      .select({ syndicateId: meetingsTable.syndicateId })
      .from(meetingsTable)
      .where(eq(meetingsTable.id, id));

    if (!meeting) return void res.status(404).json({ error: "Réunion introuvable" });

    // Verify the meeting belongs to the user's syndicate
    if (user.role !== "super_admin" && meeting.syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const existing = await db.select().from(meetingAttendeesTable).where(
      and(eq(meetingAttendeesTable.meetingId, id), eq(meetingAttendeesTable.userId, user.userId))
    );
    if (existing.length > 0) {
      res.json({ message: "Présence déjà confirmée" });
      return;
    }
    await db.insert(meetingAttendeesTable).values({ meetingId: id, userId: user.userId });
    res.json({ message: "Présence confirmée avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
