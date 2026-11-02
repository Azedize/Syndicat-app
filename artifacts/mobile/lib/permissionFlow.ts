/** Decisions of the permission flows, without any native call. */

/** This phone's notification token, kept so that signing out can remove it from the server. */
export const PUSH_TOKEN_KEY = "@mizan_push_token";

export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

export type PermissionStep = "granted" | "explain" | "settings";

/** What to do when the user starts a feature: use it, explain then ask, or point to the system settings. */
export function nextPermissionStep(state: PermissionState): PermissionStep {
  if (state.granted) return "granted";
  return state.canAskAgain ? "explain" : "settings";
}

/** Notifications are offered once: a user who declined is not asked again, Settings stays available. */
export function shouldOfferPush(state: PermissionState, alreadyOffered: boolean): boolean {
  return !state.granted && state.canAskAgain && !alreadyOffered;
}

export type FirstLaunchStage = "new" | "language" | "done";

/** The first screen of a signed-out launch. */
export function publicEntry(stage: FirstLaunchStage): "/first-launch" | "/welcome" | "/login" {
  if (stage === "new") return "/first-launch";
  return stage === "language" ? "/welcome" : "/login";
}
