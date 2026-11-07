// Governance endpoints and their types.
import { request } from "@/services/api/client";

// ─── Elections ────────────────────────────────────────────────────────────────

export const elections = {
  list: () => request<{ data: unknown[] }>("/elections"),
  get: (id: string) =>
    // Ballots are anonymous by design — the API only confirms participation (hasVoted),
    // it never reveals which candidate was chosen, even to the voter themselves.
    request<{
      data: unknown;
      candidates: unknown[];
      questions: unknown[];
      hasVoted: boolean;
      isEligible: boolean;
      mandates: unknown[];
      myDelegation: any;
      delegatedToMe: any[];
    }>(`/elections/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/elections", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/elections/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // Nobody breaks a tie: publishing a tied count prepares a second round
  // (outcome runoff_required) or calls for a new deliberation.
  transition: (id: string, action: string, reason?: string) =>
    request<{ data: any; message: string; outcome?: string; runoffElectionId?: string | null }>(`/elections/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    }),
  // A ballot: one candidate, or up to the number of seats when several are elected.
  vote: (
    electionId: string,
    candidateIds: string[],
    abstain?: boolean,
    onBehalfOfUserId?: string,
  ) =>
    request<{ message: string }>(`/elections/${electionId}/vote`, {
      method: "POST",
      body: JSON.stringify({
        candidateIds: abstain ? undefined : candidateIds,
        abstain: !!abstain,
        onBehalfOfUserId,
      }),
    }),
  eligibleVoters: (electionId: string) =>
    request<{ data: { id: string; name: string }[] }>(
      `/elections/${electionId}/eligible-voters`,
    ),
  delegate: (electionId: string, granteeId: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/delegate`,
      {
        method: "POST",
        body: JSON.stringify({ granteeId }),
      },
    ),
  revokeDelegation: (electionId: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/delegate`,
      { method: "DELETE" },
    ),
  setInvalidVotes: (electionId: string, count: number) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/invalid-votes`,
      {
        method: "PUT",
        body: JSON.stringify({ count }),
      },
    ),
  results: (electionId: string) =>
    request<{ data: any }>(`/elections/${electionId}/results`),
  submitCandidacy: (electionId: string, data: unknown) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/candidates`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  validateCandidacy: (
    electionId: string,
    candidateId: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/candidates/${candidateId}/validate`,
      {
        method: "PUT",
        body: JSON.stringify({ decision, reason }),
      },
    ),
  withdrawCandidacy: (electionId: string, candidateId: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/candidates/${candidateId}/withdraw`,
      { method: "POST" },
    ),
  updateProgram: (electionId: string, candidateId: string, data: unknown) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/candidates/${candidateId}/program`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
  askQuestion: (electionId: string, candidateId: string, question: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/candidates/${candidateId}/questions`,
      {
        method: "POST",
        body: JSON.stringify({ question }),
      },
    ),
  answerQuestion: (electionId: string, questionId: string, answer: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/${electionId}/questions/${questionId}/answer`,
      {
        method: "PUT",
        body: JSON.stringify({ answer }),
      },
    ),
  mandates: () => request<{ data: unknown[] }>("/elections/mandates"),
  resignMandate: (mandateId: string, reason?: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/mandates/${mandateId}/resign`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    ),
  revokeMandate: (mandateId: string, reason: string) =>
    request<{ data: unknown; message: string }>(
      `/elections/mandates/${mandateId}/revoke`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    ),
};

// ─── Resignation of the syndic / syndic adjoint (Loi 18-00, art. 26 ter, 27, 27 ter) ──

export type HandoverKey = "documents" | "archives" | "registers" | "treasury" | "assets" | "cash";
export interface ApiResignation {
  id: string;
  role: "syndic" | "vice_syndic";
  userId: string | null;
  reason: string | null;
  notifiedAt: string;
  agDeadline: string;
  agMeetingId: string | null;
  interimMandateId: string | null;
  handoverItems: { key: HandoverKey; done: boolean }[];
  handoverCompletedAt: string | null;
  escalation: "none" | "no_deputy" | "no_successor";
  status: "open" | "closed";
  daysLeft: number;
  assemblyOverdue: boolean;
  mandate: { id: string; name: string; role: string } | null;
  interim: { id: string; name: string; role: string } | null;
  successor: { id: string; name: string; role: string } | null;
  createdAt: string;
}

export const resignations = {
  list: () => request<{ data: ApiResignation[] }>("/governance/resignations"),
  create: (mandateId: string, reason?: string, notifiedAt?: string) =>
    request<{ data: ApiResignation; message: string }>("/governance/resignations", {
      method: "POST",
      body: JSON.stringify({ mandateId, reason, notifiedAt }),
    }),
  handover: (id: string, items: Partial<Record<HandoverKey, boolean>>) =>
    request<{ data: ApiResignation }>(`/governance/resignations/${id}/handover`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),
  assembly: (id: string, meetingId: string) =>
    request<{ data: ApiResignation; warning: { code: string; message: string } | null }>(`/governance/resignations/${id}/assembly`, {
      method: "PUT",
      body: JSON.stringify({ meetingId }),
    }),
  close: (id: string, body: { successorMandateId: string } | { noSuccessor: true }) =>
    request<{ data: ApiResignation }>(`/governance/resignations/${id}/close`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ─── Meetings ─────────────────────────────────────────────────────────────────

export const meetings = {
  list: (scope?: { supervision?: boolean; syndicateId?: string }) => {
    const params = new URLSearchParams();
    if (scope?.supervision) params.set("supervision", "true");
    if (scope?.syndicateId) params.set("syndicateId", scope.syndicateId);
    const query = params.toString();
    return request<{ data: unknown[] }>(`/meetings${query ? `?${query}` : ""}`);
  },
  create: (data: unknown) =>
    request<{ data: unknown }>("/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  confirmAttendance: (id: string, syndicateId?: string) => {
    const query = syndicateId
      ? `?supervision=true&syndicateId=${encodeURIComponent(syndicateId)}`
      : "";
    return request<{ message: string }>(`/meetings/${id}/attend${query}`, {
      method: "POST",
    });
  },
};

// ─── Organizational structure (statutory bodies, internal committees) ─────────

export interface OrgAssignment { id: string; userId: string; userName: string; kind: "holder" | "substitute"; startDate: string; endDate: string | null; status: "active" | "ended"; endReason: string | null }
export interface OrgPosition { id: string; title: string; description: string | null; responsibilities: string[]; permissions: string[]; isLeader: boolean; maxHolders: number | null; status: string; assignments: OrgAssignment[] }
export interface OrgComponent {
  id: string;
  category: "statutory" | "committee" | "custom";
  type: string;
  name: string;
  description: string | null;
  objectives: string | null;
  responsibilities: string[];
  status: "active" | "inactive" | "closed";
  visibility: "members" | "team" | "component";
  reportingFrequency: string | null;
  legalStatus: "statutory" | "conditional" | "internal";
  legalBasis: string | null;
  mine: boolean;
  closeReason: string | null;
  positions: OrgPosition[];
}
export interface OrgStructureResponse {
  data: null | { id: string; status: "draft" | "active"; version: number; template: string | null; components: OrgComponent[] };
  facts: { buildings: number; lots: number; residents: number; floors: number };
  statutoryHolders: { id: string; role: string; name: string; mandateStart: string | null; mandateEnd: string | null }[];
  canManage: boolean;
  review: null | { errors: { code: string; message: string }[]; warnings: { code: string; message: string }[] };
}
export interface OrgRecommendation { type: string; strength: "statutory" | "consider"; reasons: string[] }

export const organization = {
  structure: () => request<OrgStructureResponse>("/org/structure"),
  catalog: () => request<{ data: { types: { type: string; category: string; legalStatus: string; legalBasis?: string }[]; capabilities: string[] } }>("/org/catalog"),
  recommend: (profile: Record<string, unknown>) => request<{ data: { template: "small" | "medium" | "large"; items: OrgRecommendation[] } }>("/org/recommendations", { method: "POST", body: JSON.stringify(profile) }),
  create: (template: string, profile: Record<string, unknown>, components?: string[]) => request<{ data: { id: string } }>("/org/structure", { method: "POST", body: JSON.stringify({ template, profile, components }) }),
  activate: (reason?: string) => request<{ data: { version: number; warnings: unknown[] } }>("/org/structure/activate", { method: "POST", body: JSON.stringify({ reason }) }),
  addComponent: (type: string, data: Record<string, unknown> = {}) => request<{ data: OrgComponent }>("/org/components", { method: "POST", body: JSON.stringify({ type, ...data }) }),
  updateComponent: (id: string, data: Record<string, unknown>) => request<{ data: OrgComponent }>(`/org/components/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  removeComponent: (id: string) => request<{ data: { id: string } }>(`/org/components/${id}`, { method: "DELETE" }),
  closeComponent: (id: string, reason: string) => request<{ data: unknown }>(`/org/components/${id}/close`, { method: "POST", body: JSON.stringify({ reason }) }),
  addPosition: (componentId: string, data: { title: string; permissions?: string[]; isLeader?: boolean }) => request<{ data: OrgPosition }>(`/org/components/${componentId}/positions`, { method: "POST", body: JSON.stringify(data) }),
  people: () => request<{ data: { id: string; name: string; role: string }[] }>("/org/people"),
  assign: (positionId: string, userId: string, kind: "holder" | "substitute" = "holder") => request<{ data: OrgAssignment }>(`/org/positions/${positionId}/assignments`, { method: "POST", body: JSON.stringify({ userId, kind }) }),
  endAssignment: (id: string, reason: string) => request<{ data: unknown }>(`/org/assignments/${id}/end`, { method: "POST", body: JSON.stringify({ reason }) }),
  replace: (id: string, userId: string, reason: string) => request<{ data: unknown }>(`/org/assignments/${id}/replace`, { method: "POST", body: JSON.stringify({ userId, reason }) }),
  workspace: (componentId: string) => request<{ data: { capabilities: string[]; leader: boolean; tasks: { id: string; kind: string; title: string; status: string; syndicResponse: string | null }[]; finance: any; maintenance: any } }>(`/org/components/${componentId}/workspace`),
  addTask: (componentId: string, data: { kind: "task" | "recommendation" | "report"; title: string; description?: string }) => request<{ data: unknown }>(`/org/components/${componentId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, status: string) => request<{ data: unknown }>(`/org/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
  respond: (id: string, response: "accepted" | "declined", note?: string) => request<{ data: unknown }>(`/org/tasks/${id}/respond`, { method: "POST", body: JSON.stringify({ response, note }) }),
  history: () => request<{ data: { versions: { id: string; version: number; reason: string | null; createdAt: string }[]; events: { action: string; details: string | null; userName: string | null; createdAt: string }[] } }>("/org/structure/history"),
};
