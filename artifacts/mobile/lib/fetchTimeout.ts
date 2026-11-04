const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * fetch has no time limit: on a stalled network a screen would wait forever. Past the limit this
 * rejects with a TypeError, as fetch does when a request cannot be sent, so screens show their
 * usual network error.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new TypeError("Network request timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
