export function assertAccess(
  req: any,
  election: { syndicateId: string | null },
): boolean {
  if (req.user!.role === "super_admin") {
    return (
      req.query.supervision === "true" &&
      typeof req.query.syndicateId === "string" &&
      !!req.query.syndicateId &&
      election.syndicateId === req.query.syndicateId
    );
  }
  return (
    (!!election.syndicateId && election.syndicateId === req.user!.syndicateId)
  );
}

export function requireSyndicateScope(req: any, res: any): boolean {
  if (req.user!.role === "super_admin") {
    if (req.query.supervision !== "true" || typeof req.query.syndicateId !== "string" || !req.query.syndicateId) {
      res.status(403).json({
        error: "La supervision et un syndicat cible sont requis pour les élections.",
        code: "SUPERVISION_REQUIRED",
      });
      return false;
    }
    return true;
  }
  if (!req.user!.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return false;
  }
  return true;
}
