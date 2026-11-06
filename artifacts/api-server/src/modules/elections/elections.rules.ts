/**
 * Election rules: what each type of election requires, and the outcome of a
 * count. Pure functions (no database): the routes load the figures and store
 * what these return; the unit tests call them directly.
 *
 * Legal basis (Loi 18-00 as amended by Loi 106-12, consolidated text of the
 * ANCFCC) — everything else here is an internal, configurable rule:
 *   art. 16 decies  each owner has as many voices as his quote-part;
 *   art. 17         the general assembly elects its president among its
 *                   members at each meeting; the syndic and the syndic
 *                   adjoint cannot preside it;
 *   art. 19, 21     the syndic and the syndic adjoint are designated at the
 *                   majority of three quarters of the voices of the
 *                   co-owners; failing a designation, the president of the
 *                   court of first instance designates them on request.
 * The law says nothing about ties. MIZAN's rule (decided by the product
 * owner): a tie for the last seat(s) leads to a second round between the tied
 * candidates; a tie that persists in the second round designates nobody and
 * calls for a new deliberation. Nobody — the syndic included — breaks a tie.
 */

export type ElectionKind = "syndic" | "vice_syndic" | "ag_president" | "members" | "custom";
export type VotingMethod = "simple_majority" | "absolute_majority" | "three_quarters";
export type Weighting = "per_voter" | "quote_part";
export type MajorityBase = "votes_cast" | "all_voices";
export type Outcome = "elected" | "runoff_required" | "deliberation_required" | "no_majority";

/** Types stored in elections.election_type, old ones included (internal rules). */
export const ELECTION_TYPES = [
  "syndic",
  "vice_syndic",
  "ag_president",
  "members",
  "president",
  "board",
  "financial_committee",
  "maintenance_committee",
  "building_representative",
  "special",
] as const;

export function kindOf(type: string | null | undefined): ElectionKind {
  if (type === "syndic" || type === "vice_syndic" || type === "ag_president") return type;
  if (type === "members" || type === "board" || type === "financial_committee" || type === "maintenance_committee") return "members";
  return "custom";
}

export interface ElectionConfig {
  electionType: string;
  seatsCount: number;
  ballotMode: "single" | "multiple";
  weighting: Weighting;
  votingMethod: VotingMethod;
  majorityBase: MajorityBase;
  majorityPercent: number;
  tenantsCanVote: boolean;
  buildingId: string | null;
}

export interface RuleError {
  field: string;
  code: string;
  message: string;
}

/**
 * Checks a configuration against its type. Legal requirements are enforced
 * (they cannot be configured away); internal ones only need to be coherent.
 */
export function validateConfig(c: ElectionConfig): RuleError[] {
  const errors: RuleError[] = [];
  const err = (field: string, code: string, message: string) => errors.push({ field, code, message });
  const kind = kindOf(c.electionType);
  if (c.seatsCount < 1) err("seatsCount", "SEATS_INVALID", "Au moins un siège");
  if (c.ballotMode === "multiple" && c.seatsCount < 2) err("ballotMode", "MULTIPLE_NEEDS_SEATS", "Le choix de plusieurs candidats suppose plusieurs sièges");
  if (c.weighting === "quote_part" && c.tenantsCanVote) {
    err("tenantsCanVote", "TENANTS_HAVE_NO_QUOTE_PART", "Un vote pondéré par les quotes-parts ne concerne que les copropriétaires (art. 16 decies)");
  }
  if (kind === "syndic" || kind === "vice_syndic") {
    const what = kind === "syndic" ? "Le syndic" : "Le syndic adjoint";
    if (c.seatsCount !== 1) err("seatsCount", "ONE_SEAT", `${what} : un seul siège`);
    if (c.ballotMode !== "single") err("ballotMode", "SINGLE_CHOICE", `${what} : un seul choix par bulletin`);
    if (c.weighting !== "quote_part") err("weighting", "QUOTE_PART_REQUIRED", `${what} est désigné à la majorité des voix des copropriétaires, pondérées par leurs quotes-parts (art. 16 decies, 19)`);
    if (c.votingMethod !== "three_quarters") err("votingMethod", "THREE_QUARTERS_REQUIRED", `${what} est désigné à la majorité des trois quarts des voix (art. 19, 21)`);
    if (c.tenantsCanVote) err("tenantsCanVote", "OWNERS_ONLY", `${what} est désigné par les copropriétaires`);
    if (c.buildingId) err("buildingId", "WHOLE_CONDOMINIUM", `${what} est désigné pour toute la copropriété`);
  }
  if (kind === "ag_president") {
    if (c.seatsCount !== 1) err("seatsCount", "ONE_SEAT", "Le président de l'assemblée : un seul siège");
    if (c.ballotMode !== "single") err("ballotMode", "SINGLE_CHOICE", "Le président de l'assemblée : un seul choix par bulletin");
  }
  if (c.votingMethod === "absolute_majority" && (c.majorityPercent < 50 || c.majorityPercent > 100)) {
    err("majorityPercent", "MAJORITY_PERCENT_INVALID", "Majorité absolue : un seuil entre 50 et 100 %");
  }
  return errors;
}

/** Defaults proposed by the app for a type (the organizer may change the internal ones). */
export function defaultsFor(type: string): Partial<ElectionConfig> {
  switch (kindOf(type)) {
    case "syndic":
    case "vice_syndic":
      return { seatsCount: 1, ballotMode: "single", weighting: "quote_part", votingMethod: "three_quarters", majorityBase: "all_voices", tenantsCanVote: false, buildingId: null };
    case "ag_president":
      return { seatsCount: 1, ballotMode: "single" };
    default:
      return {};
  }
}

/** Mandate role created for the winners of a type (rank order for the board). */
export const MANDATE_ROLES: Record<string, string[]> = {
  syndic: ["syndic"],
  vice_syndic: ["vice_syndic"],
  ag_president: ["ag_president"],
  members: ["committee_member"],
  president: ["president"],
  board: ["president", "vice_president", "secretary", "treasurer", "committee_member"],
  financial_committee: ["treasurer", "committee_member"],
  maintenance_committee: ["committee_member"],
  building_representative: ["building_representative"],
  special: ["committee_member"],
};

// ─── Ballots ──────────────────────────────────────────────────────────────────

/** A ballot's selections: at least one, distinct, at most the number of seats. */
export function validateSelection(c: Pick<ElectionConfig, "ballotMode" | "seatsCount">, candidateIds: string[], abstain: boolean): RuleError | null {
  if (abstain) return candidateIds.length ? { field: "candidateIds", code: "ABSTAIN_WITH_CHOICE", message: "Une abstention ne comporte aucun candidat" } : null;
  if (!candidateIds.length) return { field: "candidateIds", code: "NO_CHOICE", message: "Choisissez un candidat ou abstenez-vous" };
  if (new Set(candidateIds).size !== candidateIds.length) return { field: "candidateIds", code: "DUPLICATE_CHOICE", message: "Un candidat ne peut être choisi qu'une fois" };
  const max = c.ballotMode === "multiple" ? c.seatsCount : 1;
  if (candidateIds.length > max) {
    return { field: "candidateIds", code: "TOO_MANY_CHOICES", message: max === 1 ? "Un seul candidat par bulletin" : `Au plus ${max} candidats (nombre de sièges)` };
  }
  return null;
}

// ─── Count ────────────────────────────────────────────────────────────────────

/** Voices are kept to 4 decimals (numeric(14,4)): compared as integers, never as floats. */
export const toUnits = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 10_000);

export interface Tally {
  candidates: { id: string; votes: number; voices: string | number }[];
  /** ballots cast (abstentions and invalid ballots included) */
  ballotsCast: number;
  voicesCast: string | number;
  eligibleCount: number;
  eligibleVoices: string | number | null;
}

export interface CountResult {
  outcome: Outcome;
  /** elected now (seats won outright) */
  winners: string[];
  /** tied for the last seat(s): second round, or new deliberation */
  tied: string[];
  /** seats the tie leaves open (filled by the second round) */
  seatsInPlay: number;
  /** seats nobody won (not enough candidates reaching the majority) */
  vacantSeats: number;
  base: number;
  ranking: { id: string; score: number; meetsMajority: boolean; sharePct: number }[];
}

/**
 * Outcome of a count. The score is the voices (quote_part) or the ballots
 * (per_voter). A candidate is elected if he reaches the majority of the
 * election and is ranked within the seats; candidates tied on the last seat
 * are never split by the system.
 */
export function countOutcome(cfg: Pick<ElectionConfig, "seatsCount" | "weighting" | "votingMethod" | "majorityBase" | "majorityPercent">, tally: Tally, round: number): CountResult {
  const weighted = cfg.weighting === "quote_part";
  const score = (c: Tally["candidates"][number]) => (weighted ? toUnits(c.voices) : c.votes * 10_000);
  const base =
    cfg.majorityBase === "all_voices"
      ? weighted
        ? toUnits(tally.eligibleVoices)
        : tally.eligibleCount * 10_000
      : weighted
        ? toUnits(tally.voicesCast)
        : tally.ballotsCast * 10_000;
  const meets = (s: number) => {
    if (s <= 0) return false;
    if (cfg.votingMethod === "three_quarters") return s * 4 >= base * 3;
    if (cfg.votingMethod === "absolute_majority") return s * 100 > base * cfg.majorityPercent;
    return true; // relative majority: the best scores win the seats
  };
  const ranking = [...tally.candidates]
    .map((c) => ({ id: c.id, score: score(c) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((c) => ({ ...c, meetsMajority: meets(c.score), sharePct: base > 0 ? Math.round((c.score / base) * 1000) / 10 : 0 }));
  const qualified = ranking.filter((c) => c.meetsMajority);
  const seats = cfg.seatsCount;

  if (qualified.length <= seats) {
    const winners = qualified.map((c) => c.id);
    return { outcome: winners.length ? "elected" : "no_majority", winners, tied: [], seatsInPlay: 0, vacantSeats: seats - winners.length, base, ranking };
  }
  const cutoff = qualified[seats - 1].score;
  if (qualified[seats].score !== cutoff) {
    return { outcome: "elected", winners: qualified.slice(0, seats).map((c) => c.id), tied: [], seatsInPlay: 0, vacantSeats: 0, base, ranking };
  }
  const winners = qualified.filter((c) => c.score > cutoff).map((c) => c.id);
  const tied = qualified.filter((c) => c.score === cutoff).map((c) => c.id);
  return { outcome: round === 1 ? "runoff_required" : "deliberation_required", winners, tied, seatsInPlay: seats - winners.length, vacantSeats: 0, base, ranking };
}

/**
 * Roles of the winners for a type whose roles follow the rank (board): a role
 * is given only where the scores differ; winners tied with each other get the
 * last (generic) role and the functions are left to a separate election.
 */
export function rolesForWinners(type: string, winners: { id: string; score: number }[]): { id: string; role: string; roleTie: boolean }[] {
  const roles = MANDATE_ROLES[type] ?? ["committee_member"];
  const generic = roles[roles.length - 1];
  return winners.map((w, i) => {
    const tiedWithOther = winners.some((o, j) => j !== i && o.score === w.score);
    const role = roles.length > 1 && tiedWithOther ? generic : (roles[i] ?? generic);
    return { id: w.id, role, roleTie: roles.length > 1 && tiedWithOther && (roles[i] ?? generic) !== generic };
  });
}
