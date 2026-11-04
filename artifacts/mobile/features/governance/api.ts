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
  transition: (
    id: string,
    action: string,
    reason?: string,
    tiebreakWinnerIds?: string[],
  ) =>
    request<{ data: unknown; message: string }>(`/elections/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ action, reason, tiebreakWinnerIds }),
    }),
  vote: (
    electionId: string,
    candidateId?: string,
    abstain?: boolean,
    onBehalfOfUserId?: string,
  ) =>
    request<{ message: string }>(`/elections/${electionId}/vote`, {
      method: "POST",
      body: JSON.stringify({
        candidateId,
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
