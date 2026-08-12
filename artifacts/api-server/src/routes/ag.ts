import { Router } from "express";
import { db } from "@workspace/db";
import {
  meetingsTable,
  meetingAttendeesTable,
  agResolutionsTable,
  agProxiesTable,
  buildingsTable,
  membersTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, count, inArray, ne } from "drizzle-orm";
import {
  assertSyndicateAccess,
  requireAuth,
  requireAdmin,
  requireOperationalAccess,
  requireNotTenant,
} from "../middleware/auth.js";
import { z } from "zod";
import { sendEmailToMany } from "../lib/notify.js";
import { agmInvitationTemplate } from "../lib/email/templates.js";

const router = Router();

// ─── AG Meetings ──────────────────────────────────────────────────────────────

// GET /ag-meetings — Assemblée Générale is a copropriétaire governance right (Loi 18-00);
// tenants (locataires) are not co-owners and have no vote or attendance right here.
router.get("/ag-meetings", requireAuth, requireNotTenant, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, status, type } = req.query as Record<string, string>;

    // Syndicate scoping: syndicate_admin and member see only their syndicate's meetings.
    // super_admin sees all, or filters by ?syndicateId= for supervision mode.
    // Non-super_admin without syndicateId in JWT: blocked (never return unscoped results).
    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const syndicateFilter =
      user.role === "super_admin"
        ? req.query.syndicateId
          ? eq(meetingsTable.syndicateId, req.query.syndicateId as string)
          : undefined
        : eq(meetingsTable.syndicateId, user.syndicateId!);

    // Filter meetings of AG type
    const rows = await db
      .select()
      .from(meetingsTable)
      .where(
        and(
          // AG meetings have type "general" or "ag_*"
          sql`(${meetingsTable.type} LIKE 'ag%' OR ${meetingsTable.type} = 'general')`,
          buildingId ? sql`${meetingsTable.description} LIKE ${"%" + buildingId + "%"}` : undefined,
          status ? eq(meetingsTable.status, status) : undefined,
          syndicateFilter,
        )
      )
      .orderBy(desc(meetingsTable.date));

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load attendees and resolutions (no N+1)
    const meetingIds = rows.map((m) => m.id);
    const [allAttendees, allResolutions] = await Promise.all([
      db.select().from(meetingAttendeesTable).where(inArray(meetingAttendeesTable.meetingId, meetingIds)),
      db.select().from(agResolutionsTable).where(inArray(agResolutionsTable.meetingId, meetingIds)).orderBy(agResolutionsTable.number),
    ]);

    const attendeesByMeeting = new Map<string, typeof allAttendees>();
    for (const a of allAttendees) {
      const list = attendeesByMeeting.get(a.meetingId) ?? [];
      list.push(a);
      attendeesByMeeting.set(a.meetingId, list);
    }
    const resolutionsByMeeting = new Map<string, typeof allResolutions>();
    for (const r of allResolutions) {
      const list = resolutionsByMeeting.get(r.meetingId) ?? [];
      list.push(r);
      resolutionsByMeeting.set(r.meetingId, list);
    }

    const enriched = rows.map((m) => {
      const attendees = attendeesByMeeting.get(m.id) ?? [];
      const resolutions = resolutionsByMeeting.get(m.id) ?? [];
      const userAttending = attendees.some((a) => a.userId === user.userId);
      const adoptedResolutions = resolutions.filter((r) => r.result === "adopted").length;
      const rejectedResolutions = resolutions.filter((r) => r.result === "rejected").length;
      return {
        ...m,
        attendeesCount: attendees.length,
        userAttending,
        resolutionsCount: resolutions.length,
        adoptedResolutions,
        rejectedResolutions,
        resolutions,
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /ag-meetings/:id
router.get("/ag-meetings/:id", requireAuth, requireNotTenant, async (req, res) => {
  try {
    const user = (req as any).user;

    const [meeting] = await db
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, String(req.params.id)));

    if (!meeting) return void res.status(404).json({ error: "AG introuvable" });

    // Syndicate isolation: non-super_admin can only read their own syndicate's meetings
    if (user.role !== "super_admin" && meeting.syndicateId && meeting.syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const [attendees, resolutions] = await Promise.all([
      db.select().from(meetingAttendeesTable).where(eq(meetingAttendeesTable.meetingId, meeting.id)),
      db
        .select()
        .from(agResolutionsTable)
        .where(eq(agResolutionsTable.meetingId, meeting.id))
        .orderBy(agResolutionsTable.number),
    ]);

    const userAttending = attendees.some((a) => a.userId === user.userId);

    res.json({
      data: {
        ...meeting,
        attendeesCount: attendees.length,
        userAttending,
        resolutions,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /ag-meetings — Create AG meeting
router.post("/ag-meetings", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    date: z.string(),
    time: z.string().optional().default("10:00"),
    location: z.string().optional().default(""),
    type: z.enum(["ag_ordinaire", "ag_extraordinaire", "ag_constitutive", "ag_elective", "general"]).default("ag_ordinaire"),
    description: z.string().optional().default(""),
    agenda: z.string().optional().default(""),
    buildingId: z.string().optional(),
    quorumRequis: z.number().int().min(1).max(100).optional().default(50),
    membresConvoques: z.number().int().optional().default(0),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({ error: "Données invalides", details: result.error.issues });

  try {
    const user = (req as any).user;
    const data = result.data;
    const syndicateId =
      user.role === "super_admin"
        ? (req.query.syndicateId as string | undefined)
        : user.syndicateId;

    if (!syndicateId) {
      return void res.status(400).json({
        error: "Un syndicat cible est requis pour planifier une AG",
      });
    }

    if (data.buildingId) {
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, data.buildingId));
      if (!building || building.syndicateId !== syndicateId) {
        return void res.status(403).json({ error: "Bâtiment hors du périmètre du syndicat" });
      }
    }

    // Embed quorum and building info into description JSON-ish field
    const meta = JSON.stringify({
      buildingId: data.buildingId,
      quorumRequis: data.quorumRequis,
      membresConvoques: data.membresConvoques,
    });

    const [meeting] = await db
      .insert(meetingsTable)
      .values({
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location,
        type: data.type,
        description: data.description + (data.buildingId ? `\n__meta:${meta}` : ""),
        agenda: data.agenda,
        syndicateId,
        status: "scheduled",
        createdBy: user.userId,
      })
      .returning();

    // Convoke every co-owner/tenant-excluded member of the syndicate (Loi 18-00 requires
    // written convocation for AG meetings).
    if (meeting.syndicateId) {
      const recipients = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(and(eq(usersTable.syndicateId, meeting.syndicateId), ne(usersTable.role, "tenant")));
      const { subject, html } = agmInvitationTemplate(meeting.title, meeting.date, meeting.time, meeting.location, meeting.type ?? "ag_ordinaire");
      sendEmailToMany(recipients.map((r) => r.email), subject, html, "agm_invitation", meeting.syndicateId).catch(() => {});
    }

    res.status(201).json({ data: meeting, message: "AG planifiée avec succès" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /ag-meetings/:id/status — Update AG status
router.put("/ag-meetings/:id/status", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
    membresPresents: z.number().int().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({ error: "Statut invalide" });

  try {
    const [meeting] = await db
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, String(req.params.id)));

    if (!meeting) return void res.status(404).json({ error: "AG introuvable" });
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    let descUpdate = meeting.description;
    if (result.data.membresPresents !== undefined) {
      descUpdate = meeting.description?.replace(/__membres_presents:\d+/, "") ?? "";
      descUpdate += `\n__membres_presents:${result.data.membresPresents}`;
    }

    const [updated] = await db
      .update(meetingsTable)
      .set({ status: result.data.status, description: descUpdate })
      .where(
        and(
          eq(meetingsTable.id, String(req.params.id)),
          req.user?.role === "super_admin"
            ? undefined
            : eq(meetingsTable.syndicateId, req.user!.syndicateId!),
        ),
      )
      .returning();

    res.json({ data: updated, message: "Statut AG mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /ag-meetings/:id/attend — Confirm attendance
router.post("/ag-meetings/:id/attend", requireAuth, requireNotTenant, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = String(req.params.id);
    const [meeting] = await db
      .select({ syndicateId: meetingsTable.syndicateId })
      .from(meetingsTable)
      .where(eq(meetingsTable.id, id));
    if (!meeting) return void res.status(404).json({ error: "AG introuvable" });
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const existing = await db
      .select()
      .from(meetingAttendeesTable)
      .where(
        and(
          eq(meetingAttendeesTable.meetingId, id),
          eq(meetingAttendeesTable.userId, user.userId)
        )
      );

    if (existing.length > 0) {
      // Toggle: remove attendance
      await db
        .delete(meetingAttendeesTable)
        .where(
          and(
            eq(meetingAttendeesTable.meetingId, id),
            eq(meetingAttendeesTable.userId, user.userId)
          )
        );
      return void res.json({ attending: false, message: "Présence annulée" });
    }

    await db.insert(meetingAttendeesTable).values({ meetingId: id, userId: user.userId });
    res.json({ attending: true, message: "Présence confirmée" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Resolutions ──────────────────────────────────────────────────────────────

// POST /ag-meetings/:id/resolutions — Add resolution
router.post("/ag-meetings/:id/resolutions", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
    requiredMajority: z.enum(["simple", "absolute", "qualified", "unanimite"]).default("simple"),
    buildingId: z.string().optional().default(""),
    number: z.number().int().optional(),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({ error: "Données invalides" });

  try {
    const meetingId = String(req.params.id);
    const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId));
    if (!meeting) return void res.status(404).json({ error: "AG introuvable" });
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const buildingIdFromRequest = result.data.buildingId;
    if (buildingIdFromRequest) {
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, buildingIdFromRequest));
      if (!building || building.syndicateId !== meeting.syndicateId) {
        return void res.status(403).json({ error: "Bâtiment hors du périmètre du syndicat" });
      }
    }

    // Auto-increment resolution number
    const existing = await db
      .select()
      .from(agResolutionsTable)
      .where(eq(agResolutionsTable.meetingId, meetingId));
    const nextNumber = result.data.number ?? existing.length + 1;

    const buildingId = result.data.buildingId ||
      (meeting.description?.match(/__meta:({.*?})/)?.[1] &&
        JSON.parse(meeting.description.match(/__meta:({.*?})/)![1])?.buildingId) ||
      "";

    if (buildingId) {
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, buildingId));
      if (!building || building.syndicateId !== meeting.syndicateId) {
        return void res.status(403).json({ error: "Bâtiment hors du périmètre du syndicat" });
      }
    }

    const [resolution] = await db
      .insert(agResolutionsTable)
      .values({
        meetingId,
        buildingId,
        number: nextNumber,
        title: result.data.title,
        description: result.data.description,
        requiredMajority: result.data.requiredMajority,
        tantiemesFor: 0,
        tantiemesAgainst: 0,
        tantiemesAbstain: 0,
        result: "pending",
      })
      .returning();

    res.status(201).json({ data: resolution, message: "Résolution ajoutée" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /ag-meetings/:id/resolutions/:resId/vote — Cast votes on resolution
router.put("/ag-meetings/:id/resolutions/:resId/vote", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    tantiemesFor: z.number().int().nonnegative(),
    tantiemesAgainst: z.number().int().nonnegative(),
    tantiemesAbstain: z.number().int().nonnegative().optional().default(0),
    totalTantiemes: z.number().int().positive().optional().default(1000),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({ error: "Données invalides" });

  try {
    const meetingId = String(req.params.id);
    const [resolutionRow] = await db
      .select()
      .from(agResolutionsTable)
      .innerJoin(meetingsTable, eq(meetingsTable.id, agResolutionsTable.meetingId))
      .where(
        and(
          eq(agResolutionsTable.id, String(req.params.resId)),
          eq(agResolutionsTable.meetingId, meetingId),
        ),
      );

    if (!resolutionRow) return void res.status(404).json({ error: "Résolution introuvable" });
    if (!assertSyndicateAccess(req, resolutionRow.meetings.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    const resolution = resolutionRow.ag_resolutions;

    const { tantiemesFor, tantiemesAgainst, tantiemesAbstain, totalTantiemes } = result.data;

    // Compute result based on majority type
    const voix = tantiemesFor + tantiemesAgainst + tantiemesAbstain;
    let adoptionResult: "adopted" | "rejected" | "pending" = "pending";

    if (voix > 0) {
      const pctFor = tantiemesFor / totalTantiemes;
      const majority = resolution.requiredMajority;
      if (majority === "simple") adoptionResult = tantiemesFor > tantiemesAgainst ? "adopted" : "rejected";
      else if (majority === "absolute") adoptionResult = pctFor > 0.5 ? "adopted" : "rejected";
      else if (majority === "qualified") adoptionResult = pctFor >= 2 / 3 ? "adopted" : "rejected";
      else if (majority === "unanimite") adoptionResult = tantiemesAgainst === 0 && tantiemesAbstain === 0 ? "adopted" : "rejected";
    }

    const [updated] = await db
      .update(agResolutionsTable)
      .set({
        tantiemesFor,
        tantiemesAgainst,
        tantiemesAbstain,
        result: adoptionResult,
      })
      .where(
        and(
          eq(agResolutionsTable.id, String(req.params.resId)),
          eq(agResolutionsTable.meetingId, meetingId),
        ),
      )
      .returning();

    res.json({ data: updated, message: `Résolution ${adoptionResult === "adopted" ? "adoptée" : adoptionResult === "rejected" ? "rejetée" : "mise à jour"}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /ag-meetings/:id/pv — Generate Procès-Verbal text
router.get("/ag-meetings/:id/pv", requireAuth, requireNotTenant, async (req, res) => {
  try {
    const user = (req as any).user;
    const [meeting] = await db
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, String(req.params.id)));

    if (!meeting) return void res.status(404).json({ error: "AG introuvable" });

    // Syndicate isolation: this route previously had none — any authenticated
    // non-tenant user could fetch any syndicate's PV by guessing/incrementing IDs.
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const [resolutions, attendees] = await Promise.all([
      db.select().from(agResolutionsTable).where(eq(agResolutionsTable.meetingId, meeting.id)).orderBy(agResolutionsTable.number),
      db.select().from(meetingAttendeesTable).where(eq(meetingAttendeesTable.meetingId, meeting.id)),
    ]);

    const typeLabels: Record<string, string> = {
      ag_ordinaire: "Assemblée Générale Ordinaire",
      ag_extraordinaire: "Assemblée Générale Extraordinaire",
      ag_constitutive: "Assemblée Générale Constitutive",
      ag_elective: "Assemblée Générale Élective",
      general: "Assemblée Générale",
    };

    const pvText = `
PROCÈS-VERBAL DE L'${(typeLabels[meeting.type ?? "general"] ?? "ASSEMBLÉE GÉNÉRALE").toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date : ${meeting.date ?? "—"}
Heure : ${meeting.time ?? "—"}
Lieu : ${meeting.location ?? "—"}
Statut : ${meeting.status}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRÉSENCE
Copropriétaires présents / représentés : ${attendees.length}

${meeting.agenda ? `ORDRE DU JOUR\n${meeting.agenda}\n\n` : ""}
RÉSOLUTIONS ADOPTÉES / REJETÉES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${resolutions.map((r) => `
Résolution n°${r.number} — ${r.title}
${r.description ? `Objet : ${r.description}` : ""}
Majorité requise : ${r.requiredMajority}
Votes pour : ${r.tantiemesFor} tantiemes
Votes contre : ${r.tantiemesAgainst} tantiemes
Abstentions : ${r.tantiemesAbstain} tantiemes
Résultat : ${r.result === "adopted" ? "✓ ADOPTÉE" : r.result === "rejected" ? "✗ REJETÉE" : "En attente"}
`).join("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")}

L'ordre du jour étant épuisé, la séance est levée.

Fait à _____________, le ${meeting.date ?? "—"}

Le Syndic                                    Le Secrétaire de séance
_____________________                    _____________________
`.trim();

    res.json({ data: { pvText, meeting, resolutions, attendeesCount: attendees.length } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── AG Proxies (Pouvoirs / Procurations) ────────────────────────────────────

const proxySchema = z.object({
  grantorId: z.string().optional(),
  grantorName: z.string().min(1).max(200),
  granteeId: z.string().optional(),
  granteeName: z.string().min(1).max(200),
  documentUrl: z.string().url().optional(),
  notes: z.string().max(1000).optional(),
});

// GET /ag-meetings/:id/proxies
router.get("/ag-meetings/:id/proxies", requireAuth, requireNotTenant, async (req, res) => {
  try {
    const user = (req as any).user;
    const [meeting] = await db.select({ id: meetingsTable.id, syndicateId: meetingsTable.syndicateId })
      .from(meetingsTable).where(eq(meetingsTable.id, String(req.params.id)));
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable" }); return; }
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const proxies = await db.select().from(agProxiesTable)
      .where(eq(agProxiesTable.meetingId, String(req.params.id)))
      .orderBy(desc(agProxiesTable.createdAt));
    res.json({ data: proxies });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

// POST /ag-meetings/:id/proxies
router.post("/ag-meetings/:id/proxies", requireAuth, requireOperationalAccess, async (req, res) => {
  const parsed = proxySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  try {
    const user = (req as any).user;
    const [meeting] = await db.select({ id: meetingsTable.id, syndicateId: meetingsTable.syndicateId })
      .from(meetingsTable).where(eq(meetingsTable.id, String(req.params.id)));
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable" }); return; }
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const syndicateId = meeting.syndicateId ?? user.syndicateId;
    const [proxy] = await db.insert(agProxiesTable).values({
      meetingId: String(req.params.id),
      syndicateId,
      grantorId: parsed.data.grantorId,
      grantorName: parsed.data.grantorName,
      granteeId: parsed.data.granteeId,
      granteeName: parsed.data.granteeName,
      documentUrl: parsed.data.documentUrl,
      notes: parsed.data.notes,
    }).returning();
    res.status(201).json({ data: proxy });
  } catch (e: any) {
    if (e?.code === "23505") { res.status(409).json({ error: "Ce copropriétaire a déjà un pouvoir pour cette réunion" }); return; }
    console.error(e); res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /ag-meetings/:id/proxies/:proxyId — update status (accepted | revoked)
router.put("/ag-meetings/:id/proxies/:proxyId", requireAuth, requireOperationalAccess, async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status || !["pending", "accepted", "revoked"].includes(status)) {
    res.status(400).json({ error: "Statut invalide (pending|accepted|revoked)" }); return;
  }
  try {
    const user = (req as any).user;
    const [meeting] = await db.select({ id: meetingsTable.id, syndicateId: meetingsTable.syndicateId })
      .from(meetingsTable).where(eq(meetingsTable.id, String(req.params.id)));
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable" }); return; }
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [updated] = await db.update(agProxiesTable)
      .set({ status })
      .where(and(eq(agProxiesTable.id, String(req.params.proxyId)), eq(agProxiesTable.meetingId, String(req.params.id))))
      .returning();
    if (!updated) { res.status(404).json({ error: "Pouvoir introuvable" }); return; }
    res.json({ data: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

// DELETE /ag-meetings/:id/proxies/:proxyId
router.delete("/ag-meetings/:id/proxies/:proxyId", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = (req as any).user;
    const [meeting] = await db.select({ id: meetingsTable.id, syndicateId: meetingsTable.syndicateId })
      .from(meetingsTable).where(eq(meetingsTable.id, String(req.params.id)));
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable" }); return; }
    if (!assertSyndicateAccess(req, meeting.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [deleted] = await db.delete(agProxiesTable)
      .where(and(eq(agProxiesTable.id, String(req.params.proxyId)), eq(agProxiesTable.meetingId, String(req.params.id))))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Pouvoir introuvable" }); return; }
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

export default router;
