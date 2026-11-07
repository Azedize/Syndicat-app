/**
 * Drops a write request (POST, PUT, PATCH, DELETE) that is identical — same method, path and
 * JSON body — to one still on its way. Two taps in the same frame both pass a `saving` check,
 * since React state only changes on the next render, and created two records. The duplicate
 * call never settles, so the screen does not run its success code twice; the first call
 * carries on normally. File uploads (FormData bodies) are not compared and always go through.
 */
const inFlight = new Set<string>();

export function dropDuplicateWrite<T>(method: string | undefined, path: string, body: unknown, run: () => Promise<T>): Promise<T> {
  const verb = (method ?? "GET").toUpperCase();
  if (verb === "GET" || (body !== undefined && typeof body !== "string")) return run();
  const key = `${verb} ${path.trim()} ${body ?? ""}`;
  if (inFlight.has(key)) return new Promise<T>(() => {});
  inFlight.add(key);
  return run().finally(() => inFlight.delete(key));
}
