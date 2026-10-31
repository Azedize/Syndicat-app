// Abonnements : périmètre d'accès (syndicat du jeton, supervision du super admin).

export function requireSubscriptionScope(
  req: any,
  res: any,
  next: any,
  requireSupervisionForSuperAdmin = false,
): void {
  if (req.user.role !== "super_admin" && !req.user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  if (
    requireSupervisionForSuperAdmin &&
    req.user.role === "super_admin" &&
    (req.query.supervision !== "true" || !requestedSyndicateId(req))
  ) {
    res.status(403).json({
      error:
        "La supervision et un syndicat cible sont requis pour cette opération.",
      code: "SUPERVISION_REQUIRED",
    });
    return;
  }
  next();
}

export function requestedSyndicateId(req: any): string | undefined {
  const value =
    typeof req.query?.syndicateId === "string"
      ? req.query.syndicateId.trim()
      : "";
  return value || undefined;
}

export function assertSupervisedTarget(
  req: any,
  res: any,
  resourceSyndicateId: string | null | undefined,
): boolean {
  if (req.user?.role !== "super_admin") return true;
  const targetSyndicateId = requestedSyndicateId(req);
  if (
    req.query?.supervision !== "true" ||
    !targetSyndicateId ||
    resourceSyndicateId !== targetSyndicateId
  ) {
    res.status(404).json({ error: "Ressource introuvable" });
    return false;
  }
  return true;
}

export function requireSupervisedTargetWhenProvided(
  req: any,
  res: any,
  next: any,
): void {
  if (
    req.user?.role === "super_admin" &&
    requestedSyndicateId(req) &&
    req.query.supervision !== "true"
  ) {
    res.status(403).json({
      error: "La supervision est requise pour cibler un syndicat.",
      code: "SUPERVISION_REQUIRED",
    });
    return;
  }
  next();
}
