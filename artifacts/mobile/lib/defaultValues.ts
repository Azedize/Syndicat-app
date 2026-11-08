/**
 * Default values that used to be stored already translated (« Tous les résidents »,
 * « جميع السكان », « سيُحدد لاحقاً »…): a reader in another language then saw the
 * writer's language. New records store a neutral value; old ones are recognised
 * here and shown in the reader's language.
 */

/** Audience of an announcement meaning « everybody ». */
const ALL_AUDIENCE = new Set([
  "", "all",
  "Tous les membres", "Tous les résidents", "All residents", "جميع السكان", "Todos los residentes",
]);

export const isAllAudience = (v: string | null | undefined) => ALL_AUDIENCE.has((v ?? "").trim());

/** Meeting place « to be decided ». */
const TBD_LOCATION = new Set(["", "À définir", "A définir", "To be decided", "TBD", "سيُحدد لاحقاً", "Por definir", "Por determinar"]);

export const isLocationTbd = (v: string | null | undefined) => TBD_LOCATION.has((v ?? "").trim());
