import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { meetingsTable, meetingAttendeesTable } from "@workspace/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const ALL_MEETING_TYPES = ["board", "general", "committee", "emergency", "ag_ordinaire", "ag_extraordinaire", "ag_constitutive", "ag_elective"] as const;

router.get("/meetings", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    const meetings = syndicateId
      ? await db.select().from(meetingsTable)
          .where(eq(meetingsTable.syndicateId, syndicateId))
          .orderBy(asc(meetingsTable.date))
      : await db.select().from(meetingsTable).orderBy(asc(meetingsTable.date));

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
      const userConfirmed = attendees.some((a) => a.userId === req.user!.userId);
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
    const [meeting] = await db.insert(meetingsTable).values({
      ...result.data,
      syndicateId: req.user!.syndicateId || "",
      status: "scheduled",
      createdBy: req.user!.userId,
    }).returning();
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
    const whereClause = req.user!.role === "super_admin"
      ? eq(meetingsTable.id, req.params.id)
      : and(eq(meetingsTable.id, req.params.id), eq(meetingsTable.syndicateId, req.user!.syndicateId ?? ""));
    const [meeting] = await db
      .update(meetingsTable)
      .set(result.data)
      .where(whereClause)
      .returning();
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable ou accès refusé" }); return; }
    res.json({ data: meeting, message: "Réunion mise à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/meetings/:id", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  try {
    const whereClause = req.user!.role === "super_admin"
      ? eq(meetingsTable.id, req.params.id)
      : and(eq(meetingsTable.id, req.params.id), eq(meetingsTable.syndicateId, req.user!.syndicateId ?? ""));
    const [meeting] = await db.delete(meetingsTable).where(whereClause).returning();
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable ou accès refusé" }); return; }
    res.json({ message: "Réunion supprimée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/meetings/:id/attend", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const existing = await db.select().from(meetingAttendeesTable).where(
      and(eq(meetingAttendeesTable.meetingId, id), eq(meetingAttendeesTable.userId, req.user!.userId))
    );
    if (existing.length > 0) {
      res.json({ message: "Présence déjà confirmée" });
      return;
    }
    await db.insert(meetingAttendeesTable).values({ meetingId: id, userId: req.user!.userId });
    res.json({ message: "Présence confirmée avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
