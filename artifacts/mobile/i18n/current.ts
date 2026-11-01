// The language chosen in the app, readable outside React (HTTP clients send it
// as Accept-Language so the server writes e-mails and messages in it).
import type { LangCode } from "./languages";

let current: LangCode = "fr";

export function setRequestLanguage(lang: LangCode): void {
  current = lang;
}

export function requestLanguage(): LangCode {
  return current;
}
