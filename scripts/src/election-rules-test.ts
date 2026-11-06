/**
 * Unit tests of the election rules (artifacts/api-server/src/modules/elections/elections.rules.ts):
 * pure functions, no database, no API.
 *   pnpm --filter @workspace/scripts run election-rules:test
 */
import { apiLib } from "./api-lib.js";

const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const R = await apiLib("modules/elections/elections.rules.ts");
  const cfg = (o: Record<string, unknown> = {}) => ({ electionType: "special", seatsCount: 1, ballotMode: "single", weighting: "per_voter", votingMethod: "simple_majority", majorityBase: "votes_cast", majorityPercent: 50, tenantsCanVote: false, buildingId: null, ...o });
  const tally = (cands: [string, number, (number | string)?][], o: Record<string, unknown> = {}) => ({
    candidates: cands.map(([id, votes, voices]) => ({ id, votes, voices: String(voices ?? votes) })),
    ballotsCast: cands.reduce((s, c) => s + c[1], 0),
    voicesCast: String(cands.reduce((s, c) => s + Number(c[2] ?? c[1]), 0)),
    eligibleCount: 20,
    eligibleVoices: "1000",
    ...o,
  });

  // 1. One seat
  let r = R.countOutcome(cfg(), tally([["a", 8], ["b", 6], ["c", 3]]), 1);
  check("1 seat: the best score is elected", r.outcome === "elected" && r.winners.join() === "a", JSON.stringify(r.winners));

  // 2. Several seats
  r = R.countOutcome(cfg({ seatsCount: 2, ballotMode: "multiple" }), tally([["a", 9], ["b", 7], ["c", 4]]), 1);
  check("2 seats: the two best scores are elected", r.outcome === "elected" && r.winners.join() === "a,b");

  // 3. Tie in the first round → second round between the tied candidates
  r = R.countOutcome(cfg(), tally([["a", 8], ["b", 8], ["c", 1]]), 1);
  check("tie in round 1: second round, nobody elected", r.outcome === "runoff_required" && r.winners.length === 0 && r.tied.sort().join() === "a,b" && r.seatsInPlay === 1);
  r = R.countOutcome(cfg({ seatsCount: 2, ballotMode: "multiple" }), tally([["a", 9], ["b", 5], ["c", 5], ["d", 1]]), 1);
  check("tie for the last of 2 seats: the first is elected, the tie goes to round 2 for 1 seat", r.outcome === "runoff_required" && r.winners.join() === "a" && r.tied.sort().join() === "b,c" && r.seatsInPlay === 1);

  // 4. Tie again in the second round → new deliberation, no automatic winner
  r = R.countOutcome(cfg(), tally([["a", 8], ["b", 8]]), 2);
  check("tie in round 2: new deliberation, nobody elected", r.outcome === "deliberation_required" && r.winners.length === 0 && r.tied.length === 2);

  // 5. Fewer candidates than seats
  r = R.countOutcome(cfg({ seatsCount: 3, ballotMode: "multiple" }), tally([["a", 5], ["b", 2]]), 1);
  check("fewer candidates than seats: both elected, one seat vacant", r.outcome === "elected" && r.winners.length === 2 && r.vacantSeats === 1);

  // 6. Insufficient majority
  const syndic = cfg({ electionType: "syndic", weighting: "quote_part", votingMethod: "three_quarters", majorityBase: "all_voices" });
  r = R.countOutcome(syndic, tally([["a", 12, 700], ["b", 3, 100]]), 1);
  check("syndic: 700 voices out of 1 000 (< 3/4) → not designated", r.outcome === "no_majority" && r.winners.length === 0, `share ${r.ranking[0].sharePct} %`);
  r = R.countOutcome(syndic, tally([["a", 12, 750], ["b", 3, 100]]), 1);
  check("syndic: exactly 750 of 1 000 voices (3/4) → designated", r.outcome === "elected" && r.winners.join() === "a");
  r = R.countOutcome(cfg({ votingMethod: "absolute_majority", majorityPercent: 50 }), tally([["a", 5], ["b", 5]]), 1);
  check("absolute majority: 5 of 10 ballots is not more than half → nobody", r.outcome === "no_majority");

  // 7. Weighted by quotes-parts: ballots and voices are different things
  r = R.countOutcome(cfg({ weighting: "quote_part" }), tally([["a", 10, 200], ["b", 3, 600]]), 1);
  check("quote-part vote: 3 ballots worth 600 voices beat 10 ballots worth 200", r.winners.join() === "b");
  r = R.countOutcome(cfg({ weighting: "per_voter" }), tally([["a", 10, 200], ["b", 3, 600]]), 1);
  check("one voice per voter: the 10 ballots win", r.winners.join() === "a");
  r = R.countOutcome(cfg({ weighting: "quote_part" }), tally([["a", 4, "33.3333"], ["b", 4, "33.3334"]]), 1);
  check("voices compared exactly to 4 decimals (no float rounding)", r.winners.join() === "b" && r.outcome === "elected");

  // Ballots
  const multi = { ballotMode: "multiple", seatsCount: 3 };
  check("ballot: several seats, up to that many candidates", R.validateSelection(multi, ["a", "b", "c"], false) === null);
  check("ballot: fewer candidates than seats is allowed", R.validateSelection(multi, ["a"], false) === null);
  check("ballot: more candidates than seats is refused", R.validateSelection(multi, ["a", "b", "c", "d"], false)?.code === "TOO_MANY_CHOICES");
  check("ballot: the same candidate twice is refused", R.validateSelection(multi, ["a", "a"], false)?.code === "DUPLICATE_CHOICE");
  check("ballot: one seat, one choice", R.validateSelection({ ballotMode: "single", seatsCount: 1 }, ["a", "b"], false)?.code === "TOO_MANY_CHOICES");
  check("ballot: an abstention has no candidate", R.validateSelection(multi, [], true) === null && R.validateSelection(multi, ["a"], true)?.code === "ABSTAIN_WITH_CHOICE");

  // Configurations per type
  check("syndic: the legal settings are valid", R.validateConfig({ ...syndic, seatsCount: 1, ballotMode: "single" }).length === 0);
  const bad = R.validateConfig(cfg({ electionType: "syndic" })).map((e: any) => e.code);
  check("syndic: one voice per voter or a relative majority are refused", bad.includes("QUOTE_PART_REQUIRED") && bad.includes("THREE_QUARTERS_REQUIRED"), bad.join(","));
  check("syndic adjoint: two seats are refused", R.validateConfig({ ...syndic, electionType: "vice_syndic", seatsCount: 2 }).some((e: any) => e.code === "ONE_SEAT"));
  check("assembly president: one seat", R.validateConfig(cfg({ electionType: "ag_president", seatsCount: 2, ballotMode: "multiple" })).some((e: any) => e.code === "ONE_SEAT"));
  check("several choices need several seats", R.validateConfig(cfg({ ballotMode: "multiple" })).some((e: any) => e.code === "MULTIPLE_NEEDS_SEATS"));
  check("tenants have no quote-part", R.validateConfig(cfg({ weighting: "quote_part", tenantsCanVote: true })).some((e: any) => e.code === "TENANTS_HAVE_NO_QUOTE_PART"));
  check("custom election: internal rules are free", R.validateConfig(cfg({ seatsCount: 4, ballotMode: "multiple", votingMethod: "absolute_majority", majorityPercent: 60 })).length === 0);

  // Board roles: never assigned between equal scores
  const roles = R.rolesForWinners("board", [{ id: "a", score: 9 }, { id: "b", score: 9 }, { id: "c", score: 4 }]);
  check("board: two winners with the same score do not get president / vice-president", roles[0].role === "committee_member" && roles[1].role === "committee_member" && roles[0].roleTie, JSON.stringify(roles.map((x: any) => x.role)));
  const roles2 = R.rolesForWinners("syndic", [{ id: "a", score: 9 }]);
  check("syndic election: the mandate is « syndic »", roles2[0].role === "syndic");

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} election rule checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
