import type { Request, Response } from "express";

/**
 * Answers a caught error. Route helpers throw refusals as errors carrying an
 * HTTP status (e.g. « supervision required », 403): those keep their status,
 * message and code. Only an unexpected failure becomes a logged 500.
 */
export function sendRouteError(req: Request, res: Response, err: unknown): void {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as Error).message, code: (err as { code?: string }).code });
    return;
  }
  req.log.error(err);
  res.status(500).json({ error: "Erreur serveur" });
}
