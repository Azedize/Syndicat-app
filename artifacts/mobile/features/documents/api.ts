// Documents endpoints and their types.
import { request } from "@/services/api/client";

// ─── Documents ───────────────────────────────────────────────────────────────

export const documents = {
  // Generated documents (templates, signatures). Uploaded files: library.search.
  list: (params?: { category?: string; status?: string }) => {
    const qs = new URLSearchParams({ source: "generated", limit: "200" });
    if (params?.category) qs.set("category", params.category);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: unknown[] }>(`/documents?${qs}`);
  },
  generate: (
    title: string,
    category: string,
    content?: string,
    templateId?: string,
    memberName?: string,
    language?: "fr" | "ar" | "en" | "es",
    expiresAt?: string,
  ) =>
    request<{ data: unknown }>("/documents", {
      method: "POST",
      body: JSON.stringify({
        title,
        category,
        content,
        templateId,
        memberName,
        language,
        expiresAt,
      }),
    }),
  get: (id: string) => request<{ data: unknown }>(`/documents/${id}`),
  update: (
    id: string,
    data: {
      title?: string;
      category?: string;
      content?: string;
      status?: string;
      rejectionReason?: string;
      expiresAt?: string;
      language?: string;
    },
  ) =>
    request<{ data: unknown }>(`/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // Version history — list past snapshots and restore one
  versions: (id: string) =>
    request<{ data: unknown[] }>(`/documents/${id}/versions`),
  restoreVersion: (id: string, versionId: string) =>
    request<{ data: unknown; message: string }>(
      `/documents/${id}/versions/${versionId}/restore`,
      { method: "POST" },
    ),
  // FIX BUG-07: delete a document (admin only)
  delete: (id: string) =>
    request<{ message: string }>(`/documents/${id}`, { method: "DELETE" }),
  // Get a signed 1-hour download URL for a document's PDF
  downloadUrl: (id: string) =>
    request<{ url: string; expiresIn: number }>(
      `/documents/${id}/download-url`,
    ),
  // Record a signature on a document
  sign: (id: string, signatureData?: string) =>
    request<{ data: unknown }>(`/documents/${id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signatureData }),
    }),
  // Get signature history for a document
  signatures: (id: string) =>
    request<{ data: unknown[] }>(`/documents/${id}/signatures`),
  // Real dashboard aggregates: counts by status + 30/60/90-day retention-expiry buckets
  summary: (source?: "generated" | "upload") =>
    request<{
      data: {
        total: number;
        byStatus: Record<string, number>;
        expiring: {
          in30: number;
          in60: number;
          in90: number;
          documents30: { id: string; title: string }[];
        };
      };
    }>(`/documents/summary${source ? `?source=${source}` : ""}`),
  // Recycle bin — admin-only, lists soft-deleted documents
  deleted: (params?: { search?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.category) qs.set("category", params.category);
    return request<{ data: unknown[] }>(`/documents/deleted?${qs}`);
  },
  // Restore a soft-deleted document (super_admin / syndicate_admin)
  restore: (id: string) =>
    request<{ data: unknown; message: string }>(`/documents/${id}/restore`, {
      method: "POST",
    }),
  // Permanently purge a soft-deleted document (super_admin only)
  purge: (id: string) =>
    request<{ message: string }>(`/documents/${id}/purge`, { method: "POST" }),
  // Comments
  comments: (id: string) =>
    request<{
      data: Array<{
        id: string;
        content: string;
        parentId: string | null;
        isDeleted: boolean;
        editedAt: string | null;
        createdAt: string;
        authorId: string;
        authorName: string | null;
        authorRole: string | null;
      }>;
    }>(`/documents/${id}/comments`),
  addComment: (id: string, content: string, parentId?: string) =>
    request<{ data: unknown; message: string }>(`/documents/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content, parentId }),
    }),
  deleteComment: (id: string, commentId: string) =>
    request<{ message: string }>(`/documents/${id}/comments/${commentId}`, {
      method: "DELETE",
    }),
  // QR code image (returns { qrDataUrl })
  qrCode: (id: string) =>
    request<{ qrDataUrl: string; verifyUrl: string }>(`/documents/${id}/qr`),
  // Template catalog — all 21 templates with sections + variables + data sources
  templates: () =>
    request<{
      data: Array<{
        id: string;
        name: string;
        category: string;
        description: string;
        icon: string;
        color: string;
        version: string;
        author: string;
        updatedAt: string;
        sections: Array<{ title: string; description: string; source: string }>;
        variables: Array<{
          name: string;
          label: string;
          source: string;
          required: boolean;
        }>;
        requiredInputs: string[];
      }>;
    }>("/documents/templates"),
  // Preview — resolve DB variable values without generating a PDF
  preview: (params: {
    templateId: string;
    buildingId?: string;
    memberName?: string;
    language?: string;
  }) =>
    request<{
      data: {
        templateId: string;
        syndicateInfo: Record<string, string | null>;
        propertyInfo: Record<string, unknown> | null;
        officeHolders: Record<string, unknown> | null;
        resolvedVariables: Record<string, string | null>;
        resolvedAt: string;
      };
    }>("/documents/preview", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  // Full generate with all extra fields
  generateFull: (body: Record<string, unknown>) =>
    request<{ data: unknown }>("/documents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Auto-fill — resolve DB variables (syndicate, property, office holders, member) for current user
  autofill: () =>
    request<{
      data: {
        syndicateInfo: Record<string, string | null>;
        propertyInfo: Record<string, string | null> | null;
        officeHolders: Record<string, string | null> | null;
        memberInfo: Record<string, string | null>;
        generated: Record<string, string | null>;
      };
    }>("/documents/autofill"),
  // Entity lists for smart document generation — replaces manual text entry with DB pickers.
  // type = meetings | lots | members | elections | invoices | appels | budgets
  entities: (type: string) =>
    request<{ data: Array<{ id: string; label: string; sublabel: string }> }>(
      `/documents/entities?type=${encodeURIComponent(type)}`,
    ),

  // Self-service document request (member/tenant) — auto-fills all DB data, creates pending_review
  request: (body: {
    templateId: string;
    category: string;
    title?: string;
    note?: string;
    language?: string;
    objet?: string;
    periode?: string;
  }) =>
    request<{ data: unknown; message: string }>("/documents/request", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Role-aware template catalog — grouped by family, filtered by user role
  availableTemplates: () =>
    request<{
      data: {
        role: string;
        total: number;
        families: Array<{
          id: string;
          label: string;
          color: string;
          templates: Array<{
            id: string;
            name: string;
            family: string;
            familyLabel: string;
            icon: string;
            color: string;
            category: string;
            description: string;
            allowedRoles: string[];
            isBundle: boolean;
            requiresBalance: boolean;
            autoFilled: string[];
          }>;
        }>;
      };
    }>("/documents/available-templates"),

  // Payment certificate eligibility pre-check
  paymentCertificateCheck: () =>
    request<{
      data: {
        eligible: boolean;
        blockedReason: string | null;
        totalPaid: number;
        totalCharged: number;
        remainingBalance: number;
        overdueCount: number;
        overdueAmount: number;
        lastPaymentDate: string | null;
        lotNumber: string | null;
      };
    }>("/documents/payment-certificate/check", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  // Recovery package — 5-step debt recovery bundle (admin only)
  recoveryPackage: (body: { memberId: string; language?: string }) =>
    request<{
      data: {
        memberName: string;
        totalDue: string;
        documents: Array<{
          step: number;
          documentId: string;
          title: string;
          documentNumber: string;
        }>;
        message: string;
      };
    }>("/documents/recovery-package", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Sale bundle — 4 notary docs for apartment sale
  saleBundle: (body: { lotId: string; language?: string }) =>
    request<{
      data: {
        memberName: string;
        lotNumber: string | null;
        documents: Array<{
          documentId: string;
          title: string;
          templateId: string;
          documentNumber: string;
        }>;
        message: string;
      };
    }>("/documents/sale-bundle", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // AG bundle — convocation + PV + décisions for Assemblée Générale
  agBundle: (body: {
    meetingId?: string;
    meetingDate?: string;
    lieu?: string;
    heure?: string;
    agendaText?: string;
    language?: string;
  }) =>
    request<{
      data: {
        agTitle: string;
        meetingDate: string;
        documents: Array<{
          documentId: string;
          title: string;
          templateId: string;
          documentNumber: string;
        }>;
        message: string;
      };
    }>("/documents/ag-bundle", { method: "POST", body: JSON.stringify(body) }),

  // Signature order status for a document
  signers: (id: string) =>
    request<{
      data: {
        documentId: string;
        title: string;
        status: string;
        requiredSigners: Array<{ order: number; role: string; label: string }>;
        completedSignatures: Array<{
          id: string;
          signedBy: string;
          signerName: string | null;
          signerRole: string | null;
          signedAt: string | null;
          signatureOrder: number | null;
          isValid: boolean | null;
        }>;
        nextSigner: { order: number; role: string; label: string } | null;
        isMyTurn: boolean;
        allSigned: boolean;
        totalRequired: number;
        totalCompleted: number;
        percentage: number;
      };
    }>(`/documents/${id}/signers`),

  // Template requests
  templateRequests: {
    list: () =>
      request<{
        data: Array<{
          id: string;
          title: string;
          category: string;
          description: string | null;
          businessPurpose: string | null;
          status: string;
          priority: string;
          reviewNotes: string | null;
          rejectionReason: string | null;
          createdAt: string;
          updatedAt: string;
          requestedByName?: string | null;
          requestedByEmail?: string | null;
          syndicateName?: string | null;
        }>;
      }>("/documents/template-requests"),
    create: (body: {
      title: string;
      category: string;
      description?: string;
      businessPurpose?: string;
      requiredFields?: Array<{ name: string; type: string; required: boolean }>;
      legalNotes?: string;
      priority?: string;
      publishScope?: string;
    }) =>
      request<{ data: unknown; message: string }>(
        "/documents/template-requests",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    update: (
      id: string,
      body: {
        status?: string;
        reviewNotes?: string;
        rejectionReason?: string;
        publishScope?: string;
      },
    ) =>
      request<{ data: unknown; message: string }>(
        `/documents/template-requests/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
      ),
  },
};

// ─── Template Requests ────────────────────────────────────────────────────────

export interface ApiTemplateRequest {
  id: string;
  title: string;
  category: string;
  description: string | null;
  businessPurpose: string | null;
  requiredFields: string | null;
  legalNotes: string | null;
  status: "pending" | "in_review" | "approved" | "rejected" | "need_more_info";
  priority: "low" | "normal" | "high" | "urgent";
  publishScope: "global" | "private";
  reviewNotes: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  syndicateId: string | null;
  requesterName: string | null;
  syndicateName: string | null;
}

export const templateRequests = {
  list: () =>
    request<{ data: ApiTemplateRequest[] }>("/template-studio/requests"),
  create: (data: {
    title: string;
    category: string;
    description?: string;
    businessPurpose?: string;
    requiredFields?: string;
    legalNotes?: string;
    priority?: string;
    publishScope?: string;
  }) =>
    request<{ data: ApiTemplateRequest; message: string }>(
      "/template-studio/requests",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  review: (
    id: string,
    data: {
      status:
        | "pending"
        | "in_review"
        | "approved"
        | "rejected"
        | "need_more_info";
      reviewNotes?: string;
      rejectionReason?: string;
    },
  ) =>
    request<{ data: ApiTemplateRequest; message: string }>(
      `/template-studio/requests/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
};

// ─── Document library (uploaded files + generated documents) ─────────────────

export type DocVisibility = "syndic" | "council" | "owners" | "residents" | "unit" | "personal";
export interface LibraryDocument {
  id: string;
  title: string;
  category: string;
  description: string | null;
  status: string | null;
  source: "generated" | "upload";
  visibility: DocVisibility;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number | null;
  documentNumber: string | null;
  entityType?: string | null;
  entityId?: string | null;
  lotId: string | null;
  hasFile: boolean;
  createdAt: string;
  updatedAt: string | null;
  publishedAt?: string | null;
  /** Number of the unit a unit-level document concerns (when authorized). */
  lotNumber?: string | null;
}
export interface LibraryQuery {
  q?: string;
  category?: string;
  sort?: "recent" | "oldest" | "title" | "-title" | "largest";
  source?: "generated" | "upload";
  entityType?: string;
  entityId?: string;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}

export const library = {
  /** One document's metadata (the server checks the person's access; 404 otherwise). */
  get: (id: string) => request<{ data: LibraryDocument }>(`/documents/${encodeURIComponent(id)}`),
  search: (q: LibraryQuery = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
    return request<{ data: LibraryDocument[]; total: number; page: number; pages: number; categories: { category: string; n: number }[] }>(`/documents?${qs}`);
  },
  link: (id: string, versionId?: string) =>
    request<{ url: string; expiresIn: number; filename: string; mimeType?: string }>(
      `/documents/${encodeURIComponent(id)}/download-url${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`,
    ),
  versions: (id: string) =>
    request<{ data: { id: string; versionNumber: number; fileName: string | null; sizeBytes: number | null; changeReason: string | null; modifiedByName: string | null; modifiedAt: string; hasFile: boolean }[]; currentVersion: number }>(
      `/documents/${encodeURIComponent(id)}/versions`,
    ),
  archive: (id: string, reason: string) =>
    request<{ data: LibraryDocument }>(`/documents/${encodeURIComponent(id)}/archive`, { method: "POST", body: JSON.stringify({ reason }) }),
  unarchive: (id: string) => request<{ data: LibraryDocument }>(`/documents/${encodeURIComponent(id)}/unarchive`, { method: "POST" }),
};
