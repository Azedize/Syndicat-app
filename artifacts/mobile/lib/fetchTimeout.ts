import { requestLanguage } from "@/i18n/current";

const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

/** Shown by screens that display the error message: « Network request failed » was English in every language. */
const NETWORK_MESSAGE: Record<string, string> = {
  fr: "Connexion au serveur impossible. Vérifiez votre connexion puis réessayez.",
  en: "Unable to connect to the server. Check your connection and try again.",
  ar: "تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة.",
  es: "No se puede conectar con el servidor. Compruebe su conexión e inténtelo de nuevo.",
};

/**
 * fetch has no time limit: on a stalled network a screen would wait forever. Past the limit this
 * rejects with a TypeError, as fetch does when a request cannot be sent, so screens show their
 * usual network error. Both carry a message in the app's language.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted || err instanceof TypeError) {
      throw new TypeError(NETWORK_MESSAGE[requestLanguage()] ?? NETWORK_MESSAGE.fr);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
