import React, { createContext, useContext, useEffect, useState } from "react";
import * as api from "../services/api";
import * as directoryApi from "@/features/directory/api";
import * as organizationsApi from "@/features/organizations/api";
import * as communityApi from "@/features/community/api";
import * as governanceApi from "@/features/governance/api";
import * as chatApi from "@/features/chat/api";
import * as financesApi from "@/features/finances/api";
import * as documentsApi from "@/features/documents/api";
import { marketplace as marketplaceApi } from "@/features/marketplace/api";
import { notifications as notificationsApi } from "@/features/notifications/api";
import { notificationBus } from "@/hooks/useNotificationBus";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  profession: string;
  joinDate: string;
  status: "active" | "inactive" | "pending";
  cotisationStatus: "paid" | "pending" | "overdue";
  syndicate: string;
}

export interface Election {
  id: string;
  title: string;
  status: "open" | "closed" | "upcoming";
  candidates: number;
  votes: number;
  startDate: string;
  endDate: string;
  description: string;
}

export interface Candidate {
  id: string;
  electionId: string;
  name: string;
  post: string;
  votes: number;
  bio: string;
  voted?: boolean;
}

export interface Meeting {
  id: string;
  syndicateId?: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type:
    | "board"
    | "general"
    | "committee"
    | "emergency"
    | "ag_ordinaire"
    | "ag_extraordinaire"
    | "ag_constitutive"
    | "ag_elective";
  status: "scheduled" | "completed" | "cancelled" | "in_progress";
  attendees: number;
  description: string;
  agenda?: string[];
  userConfirmed?: boolean;
}

export interface Document {
  id: string;
  title: string;
  category:
    | "reglements"
    | "statuts"
    | "pv"
    | "juridique"
    | "finances"
    | "attestation";
  date: string;
  size: string;
  status:
    | "published"
    | "draft"
    | "pending"
    | "generated"
    | "pending_review"
    | "validated"
    | "signed"
    | "archived";
  content?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  seller: string;
  category: string;
  status:
    | "approved"
    | "pending_review"
    | "rejected"
    | "modification_requested"
    | "sold_out";
  stock: number;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  seller: string;
  quantity: number;
}

export interface BonLivraison {
  id: string;
  reference: string;
  recipient: string;
  date: string;
  items: { label: string; quantity: number; unitPrice: number }[];
  total: number;
  status: "draft" | "sent" | "delivered" | "cancelled";
  type: "sortie" | "entree";
}

export interface Invoice {
  id: string;
  reference: string;
  type: "devis" | "facture";
  recipient: string;
  syndicate: string;
  date: string;
  dueDate: string;
  amount: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  items: { label: string; quantity: number; unitPrice: number }[];
  proofUri?: string;
  proofUrl?: string;
}

export type InvoiceCreateInput = {
  type: Invoice["type"];
  recipient: string;
  items: { label: string; quantity: number; unitPrice: number }[];
  proofUrl?: string;
};

export interface Review {
  id: string;
  productId: string;
  productName: string;
  orderId: string;
  reviewer: string;
  rating: number;
  comment: string;
  date: string;
  seller: string;
}

export interface Transaction {
  id: string;
  type: "cotisation" | "depense" | "salaire" | "recette";
  amount: number;
  label: string;
  date: string;
  status: "paid" | "pending" | "overdue";
  member?: string;
}

export interface SalaryRecord {
  id: string;
  employee: string;
  role: string;
  amount: number;
  month: string;
  status: "paid" | "pending";
  date: string;
}

export interface CaisseEntry {
  id: string;
  label: string;
  amount: number;
  type: "encaissement" | "decaissement";
  date: string;
  balance: number;
  category: string;
}

export interface ChatConversation {
  id: string;
  convType:
    | "direct"
    | "group"
    | "announcement"
    | "support"
    | "building"
    | "marketplace"
    | "incident"
    | "emergency";
  isGroup: boolean;
  participant: string;
  participantId?: string | null;
  role: string;
  lastMessage: string;
  time: string;
  unread: number;
  buildingId?: string | null;
  productId?: string | null;
  incidentId?: string | null;
  participantIds?: string[];
  isArchived?: boolean;
  isBlocked?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: string;
  senderId?: string;
  text: string;
  time: string;
  isMe: boolean;
  messageType?: "text" | "image" | "document" | "announcement" | "voice";
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  durationSeconds?: number | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  createdAt?: string;
  /** ISO timestamp of last edit; null/undefined = never edited */
  editedAt?: string | null;
  /** True when sender deleted for everyone — content cleared, tombstone shown */
  isDeletedForEveryone?: boolean;
}

export interface Syndicate {
  id: string;
  name: string;
  sector: string;
  members: number;
  admin: string;
  adminId?: string; // userId of the syndicate_admin — used to open DMs
  status: "active" | "inactive";
  createdAt: string;
  region: string;
}

export interface LegalAlert {
  id: string;
  title: string;
  description: string;
  level: "critical" | "warning" | "info";
  category: "statuts" | "budget" | "election" | "travail" | "convention";
  date: string;
  status: "open" | "resolved" | "in_progress";
  action?: string;
}

export interface TicketReply {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  title: string;
  description: string;
  submittedBy: string;
  submittedById?: string;
  syndicate: string;
  syndicateId?: string;
  priority: "high" | "medium" | "low";
  status: "open" | "in_progress" | "resolved" | "closed";
  date: string;
  // Level 1 (resident → syndicate admin)
  // Level 2 (syndicate admin → platform)
  scope: "syndicate" | "platform";
  escalatedFrom?: string;
  category: // Syndicate-scope categories (Level 1)
    | "paiement"
    | "maintenance"
    | "juridique"
    | "administratif"
    | "general"
    // Platform-scope categories (Level 2)
    | "bug"
    | "feature"
    | "acces"
    | "formation"
    | "autre"
    // Legacy values kept for backward-compatibility
    | "technique"
    | "financier";
  replies?: TicketReply[];
}

export interface Order {
  id: string;
  product: string;
  buyer: string;
  seller: string;
  amount: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  date: string;
  type: "purchase" | "sale";
}

export interface Cotisation {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: "paid" | "pending" | "overdue";
  receipt?: string;
  period: string;
}

export interface Publication {
  id: string;
  title: string;
  content: string;
  date: string;
  author: string;
  category: string;
  pinned: boolean;
  likes: number;
  comments: number;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  date: string;
  read: boolean;
  target: "all" | "admin" | "member";
  /** Screen the notification is about, when this user may open it. */
  link?: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  billingCycle: "monthly" | "annual";
  maxMembers: number;
  features: string[];
  color: string;
  popular?: boolean;
}

export interface SyndicateSubscription {
  id: string;
  syndicateId: string;
  syndicateName: string;
  planId: string;
  planName: string;
  status: "active" | "trial" | "suspended" | "cancelled";
  startDate: string;
  renewalDate: string;
  amount: number;
  membersUsed: number;
  maxMembers: number;
  autoRenew: boolean;
}

export interface NotificationPreference {
  id: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  push: boolean;
  email: boolean;
  inApp: boolean;
}

export interface Partner {
  id: string;
  name: string;
  type:
    | "assurance"
    | "banque"
    | "formation"
    | "sante"
    | "juridique"
    | "commercial"
    | "autre";
  sector: string;
  contact: string;
  phone: string;
  email: string;
  benefit: string;
  discount?: string;
  status: "active" | "pending" | "expired";
  startDate: string;
  endDate?: string;
  description: string;
}

export interface PayslipRecord {
  id: string;
  employeeId: string;
  employee: string;
  role: string;
  month: string;
  baseSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: "paid" | "pending" | "draft";
  payDate?: string;
  cnss: number;
  ir: number;
  mutuelle: number;
}

interface DataContextType {
  dataLoading: boolean;
  dataLoadError: boolean;
  refreshData: () => void;
  meetingsLoadError: boolean;
  members: Member[];
  elections: Election[];
  candidates: Candidate[];
  meetings: Meeting[];
  documents: Document[];
  documentsLoading: boolean;
  documentsLoadError: boolean;
  partnersLoadError: boolean;
  legalAlertsLoading: boolean;
  legalAlertsLoadError: boolean;
  refreshLegalAlerts: () => Promise<boolean>;
  products: Product[];
  transactions: Transaction[];
  salaries: SalaryRecord[];
  caisseEntries: CaisseEntry[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
  syndicates: Syndicate[];
  legalAlerts: LegalAlert[];
  supportTickets: SupportTicket[];
  orders: Order[];
  cotisations: Cotisation[];
  alerts: Alert[];
  publications: Publication[];
  cart: CartItem[];
  bonsLivraison: BonLivraison[];
  invoices: Invoice[];
  invoicesLoading: boolean;
  invoicesLoadError: boolean;
  reviews: Review[];
  subscriptionPlans: SubscriptionPlan[];
  syndicateSubscriptions: SyndicateSubscription[];
  notificationPreferences: NotificationPreference[];
  notificationPreferencesLoading: boolean;
  notificationPreferencesLoadError: boolean;
  refreshNotificationPreferences: () => Promise<boolean>;
  partners: Partner[];
  payslips: PayslipRecord[];
  updateSubscription: (id: string, planId: string) => Promise<boolean>;
  toggleNotificationPref: (
    id: string,
    channel: "push" | "email" | "inApp",
    value?: boolean,
  ) => Promise<boolean>;
  toggleNotificationChannel: (
    channel: "push" | "email" | "inApp",
    value: boolean,
  ) => Promise<boolean>;
  addPartner: (p: Partner) => Promise<boolean>;
  updatePartnerStatus: (
    id: string,
    status: Partner["status"],
  ) => Promise<boolean>;
  generatePayslip: (employeeId: string, month: string) => Promise<boolean>;
  likePublication: (id: string) => Promise<boolean>;
  addPublication: (p: Publication) => Promise<boolean>;
  addMember: (m: Member) => void;
  updateMemberStatus: (id: string, status: Member["status"]) => Promise<boolean>;
  addProduct: (p: Product) => Promise<boolean>;
  updateProduct: (p: Product) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  validateProduct: (id: string) => Promise<boolean>;
  addSyndicate: (s: Syndicate) => Promise<boolean>;
  updateSyndicateStatus: (id: string, status: Syndicate["status"], reason?: string) => Promise<boolean>;
  resolveLegalAlert: (id: string) => Promise<boolean>;
  addSupportTicket: (t: SupportTicket) => Promise<boolean>;
  resolveTicket: (id: string) => Promise<boolean>;
  markAlertRead: (id: string) => void;
  refreshAlerts: () => Promise<void>;
  sendMessage: (conversationId: string, text: string) => Promise<boolean>;
  markConversationRead: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => Promise<boolean>;
  refreshConversations: () => Promise<void>;
  addTransaction: (t: Transaction) => Promise<boolean>;
  updateTransactionStatus: (
    id: string,
    status: Transaction["status"],
  ) => Promise<void>;
  addToCart: (item: Omit<CartItem, "id">) => void;
  removeFromCart: (id: string) => void;
  updateCartQty: (id: string, qty: number) => void;
  clearCart: () => void;
  addReview: (r: Review) => Promise<boolean>;
  addInvoice: (input: InvoiceCreateInput) => Promise<boolean>;
  refreshInvoices: () => Promise<boolean>;
  addBonLivraison: (bl: BonLivraison) => Promise<BonLivraison | null>;
  updateBonLivraisonStatus: (
    id: string,
    status: BonLivraison["status"],
  ) => Promise<boolean>;
  confirmMeetingAttendance: (id: string) => Promise<boolean>;
  addMeeting: (m: Meeting) => void;
  updateMeeting: (m: Meeting) => void;
  updateDocument: (
    id: string,
    changes: Partial<
      Pick<Document, "title" | "content" | "category" | "status">
    >,
  ) => void;
  addDocument: (doc: Document) => void;
  refreshDocuments: () => Promise<void>;
  deleteDocument: (id: string) => void;
  markAllAlertsRead: () => void;
}

// ─── Row mapper (module-level, no closure deps) ──────────────────────────────

function mapConversationRow(
  r: unknown,
): import("./DataContext").ChatConversation {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    convType:
      (row.convType as
        | "direct"
        | "group"
        | "announcement"
        | "support"
        | "building"
        | "marketplace"
        | "incident"
        | "emergency") ?? "direct",
    isGroup: Boolean(row.isGroup),
    participant: String(row.participant ?? row.participantName ?? ""),
    participantId: row.participantId ? String(row.participantId) : null,
    role: String(row.role ?? ""),
    lastMessage: String(row.lastMessage ?? row.lastMessageContent ?? ""),
    time: String(row.time ?? row.lastMessageAt ?? ""),
    unread: Number(row.unread ?? row.unreadCount ?? 0),
    buildingId: row.buildingId ? String(row.buildingId) : null,
    productId: row.productId ? String(row.productId) : null,
    incidentId: row.incidentId ? String(row.incidentId) : null,
    participantIds: Array.isArray(row.participantIds)
      ? (row.participantIds as string[])
      : [],
    isArchived: Boolean(row.isArchived),
    isBlocked: Boolean(row.isBlocked),
  };
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Notifications are rendered by the server in the current language.
  const { lang } = useLanguage();
  const langRef = React.useRef(lang);
  langRef.current = lang;
  const [dataLoading, setDataLoading] = useState(false);
  const [dataLoadError, setDataLoadError] = useState(false);
  const [meetingsLoadError, setMeetingsLoadError] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsLoadError, setDocumentsLoadError] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [caisseEntries, setCaisseEntries] = useState<CaisseEntry[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [syndicates, setSyndicates] = useState<Syndicate[]>([]);
  const [legalAlerts, setLegalAlerts] = useState<LegalAlert[]>([]);
  const [legalAlertsLoading, setLegalAlertsLoading] = useState(false);
  const [legalAlertsLoadError, setLegalAlertsLoadError] = useState(false);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cotisations, setCotisations] = useState<Cotisation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [bonsLivraison, setBonsLivraison] = useState<BonLivraison[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoadError, setInvoicesLoadError] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<
    SubscriptionPlan[]
  >([]);
  const [syndicateSubscriptions, setSyndicateSubscriptions] = useState<
    SyndicateSubscription[]
  >([]);
  const [notificationPreferences, setNotificationPreferences] = useState<
    NotificationPreference[]
  >([]);
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] =
    useState(false);
  const [
    notificationPreferencesLoadError,
    setNotificationPreferencesLoadError,
  ] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersLoadError, setPartnersLoadError] = useState(false);
  const [payslips, setPayslips] = useState<PayslipRecord[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setDataLoading(true);
    setDataLoadError(false);
    setInvoicesLoading(true);
    setInvoicesLoadError(false);
    setMeetingsLoadError(false);
    setDocumentsLoading(true);
    setDocumentsLoadError(false);
    setPartnersLoadError(false);
    setLegalAlertsLoading(true);
    setLegalAlertsLoadError(false);
    setNotificationPreferencesLoading(true);
    setNotificationPreferencesLoadError(false);
    async function loadFromApi() {
      try {
        // Ask only for what the server lets this role read (same lists as the
        // API guards); the others got a 403 on every launch. The server keeps
        // its own checks: this only avoids pointless refused requests.
        const role = user?.role ?? "";
        const onlyFor = <T,>(roles: string[], call: () => Promise<T>) =>
          roles.includes(role) ? call() : Promise.resolve({ data: [] as unknown[] } as unknown as T);
        const MEMBER_DIRECTORY = ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"];
        const LEDGER_READERS = ["syndicate_admin", "treasurer", "president", "committee_member"];
        const FINANCE_STAFF = ["syndicate_admin", "treasurer"];
        const results = await Promise.allSettled([
          onlyFor(MEMBER_DIRECTORY, () => directoryApi.members.list()),
          governanceApi.elections.list(),
          // Tenants are not co-owners: the API refuses them the assemblies.
          role === "tenant"
            ? Promise.resolve({ data: [] as unknown[] } as unknown as Awaited<ReturnType<typeof governanceApi.meetings.list>>)
            : governanceApi.meetings.list(role === "super_admin" ? { supervision: true } : undefined),
          onlyFor(LEDGER_READERS, () => financesApi.finance.transactions()),
          onlyFor(FINANCE_STAFF, () => financesApi.finance.salaries()),
          onlyFor(FINANCE_STAFF, () => financesApi.finance.caisse()),
          onlyFor(FINANCE_STAFF, () => financesApi.finance.invoices()),
          onlyFor(FINANCE_STAFF, () => financesApi.finance.bons()),
          marketplaceApi.products(),
          marketplaceApi.orders(),
          marketplaceApi.reviews(),
          chatApi.chat.conversations(),
          organizationsApi.syndicates.list(),
          api.content.legalAlerts(),
          api.content.supportTickets(),
          api.content.cotisations(),
          notificationsApi.alerts(langRef.current),
          communityApi.publications.list(),
          notificationsApi.notificationPrefs(),
          // GET /subscriptions is super-admin only: other roles got a 403 on every launch.
          user?.role === "super_admin" ? api.content.subscriptions() : Promise.resolve({ data: [] as unknown[] }),
          api.content.subscriptionPlans(),
          api.content.partners(),
          // Own payslips (member) or the syndicate's (admin, treasurer); the
          // platform reads them per condominium, in supervision only.
          onlyFor(["member", "syndicate_admin", "treasurer"], () => api.content.payslips()),
          documentsApi.documents.list(),
        ]);

        if (cancelled) return;

        const rejectedCount = results.filter(
          (result) => result.status === "rejected",
        ).length;
        setDataLoadError(rejectedCount === results.length);

        const [
          membersRes,
          electionsRes,
          meetingsRes,
          transactionsRes,
          salariesRes,
          caisseRes,
          invoicesRes,
          bonsRes,
          productsRes,
          ordersRes,
          reviewsRes,
          conversationsRes,
          syndicatesRes,
          legalAlertsRes,
          ticketsRes,
          cotisationsRes,
          alertsRes,
          publicationsRes,
          notifPrefsRes,
          subsRes,
          plansRes,
          partnersRes,
          payslipsRes,
          documentsRes,
        ] = results;

        setMeetingsLoadError(meetingsRes.status === "rejected");

        if (membersRes.status === "fulfilled") {
          const rows = (membersRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setMembers(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  name: String(row.name ?? ""),
                  email: String(row.email ?? ""),
                  phone: String(row.phone ?? ""),
                  profession: String(row.profession ?? ""),
                  joinDate: String(row.joinDate ?? row.createdAt ?? ""),
                  status: (row.status as Member["status"]) ?? "active",
                  cotisationStatus:
                    (row.cotisationStatus as Member["cotisationStatus"]) ??
                    "pending",
                  syndicate: String(row.syndicate ?? row.syndicateName ?? ""),
                };
              }),
            );
          }
        }

        if (electionsRes.status === "fulfilled") {
          const rows = (electionsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setElections(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                const cands = Array.isArray(row.candidates)
                  ? (row.candidates as Record<string, unknown>[])
                  : [];
                return {
                  id: String(row.id),
                  syndicateId: row.syndicateId
                    ? String(row.syndicateId)
                    : undefined,
                  title: String(row.title ?? ""),
                  status: (row.status as Election["status"]) ?? "upcoming",
                  candidates: cands.length,
                  votes: cands.reduce((s, c) => s + Number(c.votes ?? 0), 0),
                  startDate: String(row.startDate ?? ""),
                  endDate: String(row.endDate ?? ""),
                  description: String(row.description ?? ""),
                };
              }),
            );
            const allCandidates: Candidate[] = [];
            for (const r of rows) {
              const row = r as Record<string, unknown>;
              if (Array.isArray(row.candidates)) {
                for (const c of row.candidates) {
                  const cand = c as Record<string, unknown>;
                  allCandidates.push({
                    id: String(cand.id),
                    electionId: String(cand.electionId),
                    name: String(cand.name ?? ""),
                    post: String(cand.post ?? ""),
                    votes: Number(cand.votes ?? 0),
                    bio: String(cand.bio ?? ""),
                    voted:
                      row.userVotedCandidateId != null &&
                      String(row.userVotedCandidateId) === String(cand.id),
                  });
                }
              }
            }
            if (allCandidates.length > 0) setCandidates(allCandidates);
          }
        }

        if (meetingsRes.status === "fulfilled") {
          const rows = (meetingsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setMeetings(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                let agenda: string[] | undefined;
                if (
                  Array.isArray(row.agendaLines) &&
                  (row.agendaLines as unknown[]).length > 0
                ) {
                  agenda = (row.agendaLines as unknown[]).map(String);
                } else if (
                  Array.isArray(row.agenda) &&
                  (row.agenda as unknown[]).length > 0
                ) {
                  agenda = (row.agenda as unknown[]).map(String);
                } else if (
                  typeof row.agenda === "string" &&
                  row.agenda.trim()
                ) {
                  agenda = row.agenda
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean);
                }
                return {
                  id: String(row.id),
                  title: String(row.title ?? ""),
                  date: String(row.date ?? ""),
                  time: String(row.time ?? "09:00"),
                  location: String(row.location ?? ""),
                  type: (row.type as Meeting["type"]) ?? "general",
                  status: (row.status as Meeting["status"]) ?? "scheduled",
                  attendees: Number(row.attendees ?? 0),
                  description: String(row.description ?? ""),
                  userConfirmed: Boolean(row.userConfirmed),
                  agenda,
                };
              }),
            );
          }
        }

        if (transactionsRes.status === "fulfilled") {
          const rows = (transactionsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setTransactions(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  type: (row.type as Transaction["type"]) ?? "cotisation",
                  amount: Number(row.amount ?? 0),
                  label: String(row.label ?? ""),
                  date: String(row.date ?? row.createdAt ?? ""),
                  status: (row.status as Transaction["status"]) ?? "pending",
                  member: row.memberName ? String(row.memberName) : undefined,
                };
              }),
            );
          }
        }

        if (productsRes.status === "fulfilled") {
          const rows = (productsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setProducts(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  name: String(row.name ?? ""),
                  description: String(row.description ?? ""),
                  price: Number(row.price ?? 0),
                  seller: String(row.seller ?? row.sellerName ?? ""),
                  category: String(row.category ?? ""),
                  status: (row.status as Product["status"]) ?? "approved",
                  stock: Number(row.stock ?? 0),
                };
              }),
            );
          }
        }

        if (legalAlertsRes.status === "fulfilled") {
          const rows = (legalAlertsRes.value as { data: unknown[] }).data;
          setLegalAlerts(
            (rows ?? []).map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return {
                id: String(row.id),
                title: String(row.title ?? ""),
                description: String(row.description ?? ""),
                level: (row.level as LegalAlert["level"]) ?? "info",
                category: (row.category as LegalAlert["category"]) ?? "statuts",
                date: String(row.date ?? row.createdAt ?? ""),
                status: (row.status as LegalAlert["status"]) ?? "open",
                action: row.action ? String(row.action) : undefined,
              };
            }),
          );
          setLegalAlertsLoadError(false);
        } else {
          setLegalAlertsLoadError(true);
        }

        if (ticketsRes.status === "fulfilled") {
          const rows = (ticketsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSupportTickets(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                const validCats = [
                  "paiement",
                  "maintenance",
                  "juridique",
                  "administratif",
                  "general",
                  "bug",
                  "feature",
                  "acces",
                  "formation",
                  "autre",
                  "technique",
                  "financier", // legacy
                ];
                return {
                  id: String(row.id),
                  title: String(row.title ?? ""),
                  description: String(row.description ?? ""),
                  submittedBy: String(
                    row.submittedByName ?? row.submittedBy ?? "",
                  ),
                  submittedById: row.submittedById
                    ? String(row.submittedById)
                    : undefined,
                  syndicate: String(row.syndicateName ?? row.syndicate ?? ""),
                  syndicateId: row.syndicateId
                    ? String(row.syndicateId)
                    : undefined,
                  priority:
                    (row.priority as SupportTicket["priority"]) ?? "medium",
                  status: (row.status as SupportTicket["status"]) ?? "open",
                  date: String(row.date ?? row.createdAt ?? ""),
                  scope: (row.scope === "platform"
                    ? "platform"
                    : "syndicate") as SupportTicket["scope"],
                  escalatedFrom: row.escalatedFrom
                    ? String(row.escalatedFrom)
                    : undefined,
                  category: (validCats.includes(row.category as string)
                    ? row.category
                    : "general") as SupportTicket["category"],
                  replies: Array.isArray(row.replies)
                    ? (row.replies as any[]).map((rp: any) => ({
                        id: String(rp.id ?? ""),
                        ticketId: String(rp.ticketId ?? ""),
                        authorId: String(rp.authorId ?? ""),
                        authorName: String(rp.authorName ?? ""),
                        text: String(rp.text ?? ""),
                        createdAt: String(rp.createdAt ?? ""),
                      }))
                    : [],
                };
              }),
            );
          }
        }

        if (cotisationsRes.status === "fulfilled") {
          const rows = (cotisationsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setCotisations(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  label: String(row.label ?? ""),
                  amount: Number(row.amount ?? 0),
                  dueDate: String(row.dueDate ?? ""),
                  paidDate: row.paidDate ? String(row.paidDate) : undefined,
                  status: (row.status as Cotisation["status"]) ?? "pending",
                  receipt: row.receipt ? String(row.receipt) : undefined,
                  period: String(row.period ?? ""),
                };
              }),
            );
          }
        }

        if (alertsRes.status === "fulfilled") {
          const rows = (alertsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setAlerts(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  title: String(row.title ?? ""),
                  message: String(row.message ?? ""),
                  type: (row.type as Alert["type"]) ?? "info",
                  date: String(row.date ?? row.createdAt ?? ""),
                  read: Boolean((row as any).readByUser ?? row.read),
                  target: (row.target as Alert["target"]) ?? "all",
                  link: typeof row.link === "string" ? row.link : null,
                };
              }),
            );
          }
        }

        if (publicationsRes.status === "fulfilled") {
          const rows = (publicationsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setPublications(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  title: String(row.title ?? ""),
                  content: String(row.content ?? ""),
                  date: String(row.date ?? row.createdAt ?? ""),
                  author: String(row.author ?? row.authorName ?? ""),
                  category: String(row.category ?? ""),
                  pinned: Boolean(row.pinned),
                  likes: Number(row.likes ?? 0),
                  comments: Number(row.comments ?? 0),
                };
              }),
            );
          }
        }

        if (syndicatesRes.status === "fulfilled") {
          const rows = (syndicatesRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSyndicates(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  name: String(row.name ?? ""),
                  sector: String(row.sector ?? ""),
                  members: Number(row.membersCount ?? row.members ?? 0),
                  admin: String(row.admin ?? row.adminName ?? ""),
                  adminId: row.adminId ? String(row.adminId) : undefined,
                  status: (row.status as Syndicate["status"]) ?? "active",
                  createdAt: String(row.createdAt ?? ""),
                  region: String(row.region ?? ""),
                };
              }),
            );
          }
        }

        if (notifPrefsRes.status === "fulfilled") {
          const rows = (notifPrefsRes.value as { data: unknown[] }).data;
          setNotificationPreferences((rows ?? []) as NotificationPreference[]);
        } else {
          setNotificationPreferencesLoadError(true);
        }
        setNotificationPreferencesLoading(false);

        if (subsRes.status === "fulfilled") {
          const rows = (subsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSyndicateSubscriptions(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  ...(row as unknown as SyndicateSubscription),
                  amount: Number(row.amount ?? 0),
                };
              }),
            );
          }
        }

        if (plansRes.status === "fulfilled") {
          const rows = (plansRes.value as { data: unknown[] }).data;
          if (rows?.length) setSubscriptionPlans(rows as SubscriptionPlan[]);
        }

        if (partnersRes.status === "fulfilled") {
          const rows = (partnersRes.value as { data: unknown[] }).data;
          if (rows?.length) setPartners(rows as Partner[]);
        } else {
          setPartnersLoadError(true);
        }

        if (payslipsRes.status === "fulfilled") {
          const rows = (payslipsRes.value as { data: unknown[] }).data;
          if (rows?.length) setPayslips(rows as PayslipRecord[]);
        }

        if (salariesRes.status === "fulfilled") {
          const rows = (salariesRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSalaries(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  employee: String(row.employee ?? row.employeeName ?? ""),
                  role: String(row.role ?? ""),
                  amount: Number(row.amount ?? 0),
                  month: String(row.month ?? ""),
                  status: (row.status as SalaryRecord["status"]) ?? "pending",
                  date: String(row.date ?? row.createdAt ?? ""),
                };
              }),
            );
          }
        }

        if (caisseRes.status === "fulfilled") {
          const rows = (caisseRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setCaisseEntries(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  label: String(row.label ?? ""),
                  amount: Number(row.amount ?? 0),
                  type: (row.type as CaisseEntry["type"]) ?? "encaissement",
                  date: String(row.date ?? row.createdAt ?? ""),
                  balance: Number(row.balance ?? 0),
                  category: String(row.category ?? ""),
                };
              }),
            );
          }
        }

        if (invoicesRes.status === "fulfilled") {
          const rows = (invoicesRes.value as { data: unknown[] }).data;
          setInvoices((rows ?? []).map(mapDbInvoice));
          setInvoicesLoadError(false);
        } else {
          setInvoicesLoadError(true);
        }
        setInvoicesLoading(false);

        if (bonsRes.status === "fulfilled") {
          const rows = (bonsRes.value as { data: unknown[] }).data;
          if (rows?.length) setBonsLivraison(rows as BonLivraison[]);
        }

        if (ordersRes.status === "fulfilled") {
          const rows = (ordersRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setOrders(
              rows.map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                  id: String(row.id),
                  product: String(row.product ?? row.productName ?? ""),
                  buyer: String(row.buyer ?? row.buyerName ?? ""),
                  seller: String(row.seller ?? row.sellerName ?? ""),
                  amount: Number(row.amount ?? 0),
                  status: (row.status as Order["status"]) ?? "pending",
                  date: String(row.date ?? row.createdAt ?? ""),
                  type: (row.type as Order["type"]) ?? "purchase",
                };
              }),
            );
          }
        }

        if (reviewsRes.status === "fulfilled") {
          const rows = (reviewsRes.value as { data: unknown[] }).data;
          if (rows?.length) setReviews(rows as Review[]);
        }

        if (conversationsRes.status === "fulfilled") {
          const rows = (conversationsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setConversations(rows.map(mapConversationRow));
          }
        }

        if (documentsRes.status === "fulfilled") {
          const rows = (documentsRes.value as { data: unknown[] }).data;
          setDocuments(
            (rows ?? []).map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return {
                id: String(row.id),
                title: String(row.title ?? ""),
                category: (row.category as Document["category"]) ?? "statuts",
                date: String(row.date ?? row.createdAt ?? ""),
                size: String(row.size ?? ""),
                status: (row.status as Document["status"]) ?? "published",
                content: row.content != null ? String(row.content) : undefined,
              };
            }),
          );
          setDocumentsLoadError(false);
        } else {
          setDocumentsLoadError(true);
        }
        setDocumentsLoading(false);
        if (notifPrefsRes.status === "fulfilled") {
          setNotificationPreferencesLoadError(false);
        }
        setNotificationPreferencesLoading(false);
        setDataLoading(false);
      } catch {
        if (!cancelled) {
          setInvoicesLoadError(true);
          setInvoicesLoading(false);
          setDocumentsLoadError(true);
          setDocumentsLoading(false);
          setDataLoadError(true);
          setDataLoading(false);
          setLegalAlertsLoadError(true);
          setNotificationPreferencesLoadError(true);
        }
        setLegalAlertsLoading(false);
        setNotificationPreferencesLoading(false);
        // API call failed (network/auth error): keep whatever was already
        // loaded (or the empty initial state) rather than throwing — this
        // effect has no UI-visible error surface, and other screens read
        // these arrays defensively (empty-state UI, not fake data).
      }
    }
    loadFromApi();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dataRefreshKey]);

  const refreshData = () => {
    setDataRefreshKey((current) => current + 1);
  };

  // Optimistic writes: when the API rejects a change (validation, permission,
  // expired subscription…), show the server's reason and re-sync from the
  // server instead of silently keeping a change that was never saved.
  const onWriteFailed = (err: unknown) => {
    const message =
      (err as { message?: string } | null)?.message ||
      "L'enregistrement a échoué. Les données ont été rechargées.";
    notificationBus.emit({ type: "error", message });
    refreshData();
  };

  const refreshLegalAlerts = async (): Promise<boolean> => {
    setLegalAlertsLoading(true);
    setLegalAlertsLoadError(false);
    try {
      const response = await api.content.legalAlerts();
      const rows = (response as { data?: unknown[] }).data ?? [];
      setLegalAlerts(
        rows.map((r: unknown) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id),
            title: String(row.title ?? ""),
            description: String(row.description ?? ""),
            level: (row.level as LegalAlert["level"]) ?? "info",
            category: (row.category as LegalAlert["category"]) ?? "statuts",
            date: String(row.date ?? row.createdAt ?? ""),
            status: (row.status as LegalAlert["status"]) ?? "open",
            action: row.action ? String(row.action) : undefined,
          };
        }),
      );
      setLegalAlertsLoadError(false);
      return true;
    } catch {
      setLegalAlertsLoadError(true);
      return false;
    } finally {
      setLegalAlertsLoading(false);
    }
  };

  const updateSubscription = (id: string, planId: string) => {
    const plan = subscriptionPlans.find((p) => p.id === planId);
    if (!plan) return Promise.resolve(false);
    setSyndicateSubscriptions((p) =>
      p.map((s) =>
        s.id === id
          ? {
              ...s,
              planId,
              planName: plan.name,
              amount: plan.price,
              maxMembers: plan.maxMembers,
            }
          : s,
      ),
    );
    return api.content.updateSubscription(id, planId).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };

  const refreshNotificationPreferences = async (): Promise<boolean> => {
    setNotificationPreferencesLoading(true);
    setNotificationPreferencesLoadError(false);
    try {
      const response = await notificationsApi.notificationPrefs();
      setNotificationPreferences(
        ((response as { data: unknown[] }).data ??
          []) as NotificationPreference[],
      );
      return true;
    } catch {
      setNotificationPreferencesLoadError(true);
      return false;
    } finally {
      setNotificationPreferencesLoading(false);
    }
  };

  const toggleNotificationPref = async (
    id: string,
    channel: "push" | "email" | "inApp",
    requestedValue?: boolean,
  ): Promise<boolean> => {
    const current = notificationPreferences.find((n) => n.id === id);
    const newValue = requestedValue ?? (current ? !current[channel] : true);
    const previous = notificationPreferences;
    setNotificationPreferences((p) =>
      p.map((n) => (n.id === id ? { ...n, [channel]: newValue } : n)),
    );
    try {
      await notificationsApi.toggleNotificationPref(id, channel, newValue);
      return true;
    } catch {
      setNotificationPreferences(previous);
      return false;
    }
  };

  const toggleNotificationChannel = async (
    channel: "push" | "email" | "inApp",
    value: boolean,
  ): Promise<boolean> => {
    const previous = notificationPreferences;
    const pending = notificationPreferences.map((preference) =>
      notificationsApi.toggleNotificationPref(preference.id, channel, value),
    );
    setNotificationPreferences((items) =>
      items.map((item) => ({ ...item, [channel]: value })),
    );
    const results = await Promise.allSettled(pending);
    if (results.some((result) => result.status === "rejected")) {
      setNotificationPreferences(previous);
      return false;
    }
    return true;
  };

  const addPartner = async (p: Partner): Promise<boolean> => {
    setPartners((prev) => [p, ...prev]);
    try {
      await api.content.addPartner(p);
      return true;
    } catch {
      setPartners((prev) => prev.filter((partner) => partner.id !== p.id));
      return false;
    }
  };
  const updatePartnerStatus = async (
    id: string,
    status: Partner["status"],
  ): Promise<boolean> => {
    const previous = partners.find((partner) => partner.id === id)?.status;
    setPartners((p) => p.map((pt) => (pt.id === id ? { ...pt, status } : pt)));
    try {
      await api.content.updatePartnerStatus(id, status);
      return true;
    } catch {
      if (previous) {
        setPartners((p) =>
          p.map((pt) => (pt.id === id ? { ...pt, status: previous } : pt)),
        );
      }
      return false;
    }
  };
  const generatePayslip = (employeeId: string, month: string) => {
    const existing = payslips.find((ps) => ps.employeeId === employeeId);
    if (!existing) return Promise.resolve(false);
    const newPs: PayslipRecord = {
      ...existing,
      id: `ps${Date.now()}`,
      month,
      status: "draft",
      payDate: undefined,
    };
    setPayslips((p) => [newPs, ...p]);
    return api.content.generatePayslip(employeeId, month).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };

  const confirmMeetingAttendance = (id: string) => {
    setMeetings((p) =>
      p.map((m) =>
        m.id === id
          ? { ...m, attendees: m.attendees + 1, userConfirmed: true }
          : m,
      ),
    );
    const meeting = meetings.find((item) => item.id === id);
    return governanceApi.meetings
      .confirmAttendance(
        id,
        user?.role === "super_admin" ? meeting?.syndicateId : undefined,
      )
      .then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };

  const addMeeting = (m: Meeting) => {
    setMeetings((p) => [m, ...p]);
  };

  const updateMeeting = (m: Meeting) => {
    setMeetings((p) => p.map((x) => (x.id === m.id ? m : x)));
  };

  const markAllAlertsRead = () => {
    setAlerts((p) => p.map((a) => ({ ...a, read: true })));
    notificationsApi.markAllAlertsRead().catch(() => {});
  };

  const refreshAlerts = async () => {
    try {
      const res = (await notificationsApi.alerts(langRef.current)) as any;
      const rows = (res.data ?? []) as Record<string, unknown>[];
      setAlerts(
        rows.map((row) => ({
          id: String(row.id),
          title: String(row.title ?? ""),
          message: String(row.message ?? ""),
          type: (row.type as Alert["type"]) ?? "info",
          date: String(row.date ?? row.createdAt ?? ""),
          read: Boolean((row as any).readByUser ?? row.read),
          target: (row.target as Alert["target"]) ?? "all",
          link: typeof row.link === "string" ? row.link : null,
        })),
      );
    } catch {
      // keep showing stale data
    }
  };

  // A new language: notifications are read again, in that language.
  const firstLang = React.useRef(true);
  useEffect(() => {
    if (firstLang.current) { firstLang.current = false; return; }
    if (user) void refreshAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      refreshAlerts();
    }, 30_000);
    return () => clearInterval(id);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll conversations every 5s for real-time unread count and last message updates
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      refreshConversations();
    }, 5_000);
    return () => clearInterval(id);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Adds a member that the caller has ALREADY persisted (POST /members) to the
  // local list. Posting again here created a duplicate request per addition.
  const addMember = (m: Member) => {
    setMembers((p) => [m, ...p]);
  };
  const updateMemberStatus = (id: string, status: Member["status"]) => {
    setMembers((p) => p.map((m) => (m.id === id ? { ...m, status } : m)));
    return directoryApi.members.updateStatus(id, status).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
    const action = status === "active" ? "approve_member" : "reject_member";
    api.content
      .auditLog({
        action,
        entity: "membre",
        entityId: id,
        details: `Nouveau statut: ${status}`,
      })
      .catch(() => {});
    if (status === "active")
      notificationBus.emit({
        type: "success",
        message:
          "Membre approuvé — il peut maintenant accéder à l'espace syndical",
      });
    else if (status === "inactive")
      notificationBus.emit({
        type: "info",
        message: "Demande d'adhésion refusée",
      });
  };
  const addProduct = (p: Product) => {
    setProducts((prev) => [p, ...prev]);
    return marketplaceApi.addProduct(p).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const updateProduct = (p: Product) => {
    setProducts((prev) => prev.map((pr) => (pr.id === p.id ? p : pr)));
    return marketplaceApi.updateProduct(p.id, p).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const updateDocument = (
    id: string,
    changes: Partial<
      Pick<Document, "title" | "content" | "category" | "status">
    >,
  ) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...changes } : d)),
    );
  };

  const addDocument = (doc: Document) => {
    setDocuments((prev) => [doc, ...prev]);
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const refreshDocuments = async () => {
    setDocumentsLoading(true);
    try {
      const res = await documentsApi.documents.list();
      const rows = (res as { data: unknown[] }).data ?? [];
      setDocuments(
        rows.map((r: unknown) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id),
            title: String(row.title ?? ""),
            category: (row.category as Document["category"]) ?? "statuts",
            date: String(row.date ?? row.createdAt ?? ""),
            size: String(row.size ?? "—"),
            status: (row.status as Document["status"]) ?? "draft",
            content: row.content != null ? String(row.content) : undefined,
          };
        }),
      );
      setDocumentsLoadError(false);
    } catch {
      setDocumentsLoadError(true);
      throw new Error("DOCUMENTS_REFRESH_FAILED");
    } finally {
      setDocumentsLoading(false);
    }
  };
  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((pr) => pr.id !== id));
    return marketplaceApi.deleteProduct(id).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const validateProduct = (id: string) => {
    setProducts((p) =>
      p.map((pr) => (pr.id === id ? { ...pr, status: "approved" } : pr)),
    );
    return marketplaceApi.updateProduct(id, { status: "approved" }).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
    notificationBus.emit({
      type: "success",
      message: "Produit validé et publié sur le marketplace",
    });
  };
  // Callers create the condominium through the API first (POST /syndicates):
  // this only adds the saved record to the local list. Posting it again here
  // created a second condominium.
  const addSyndicate = (s: Syndicate) => {
    setSyndicates((p) => (p.some((x) => x.id === s.id) ? p : [s, ...p]));
    return Promise.resolve(true);
  };
  // The list changes only once the server has accepted: a refusal must not look like a success.
  const updateSyndicateStatus = (id: string, status: Syndicate["status"], reason?: string) => {
    return organizationsApi.organizations.setStatus(id, status === "active" ? "active" : "suspended", reason).then(
      () => {
        setSyndicates((p) => p.map((s) => (s.id === id ? { ...s, status } : s)));
        return true;
      },
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const addSupportTicket = (t: SupportTicket) => {
    setSupportTickets((p) => [t, ...p]);
    return api.content.createTicket(t).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
    notificationBus.emit({
      type: "info",
      message: `Ticket support soumis : "${t.title}"`,
    });
  };
  const resolveLegalAlert = async (id: string): Promise<boolean> => {
    const previous = legalAlerts.find((alert) => alert.id === id);
    setLegalAlerts((p) =>
      p.map((a) => (a.id === id ? { ...a, status: "resolved" } : a)),
    );
    try {
      await api.content.resolveLegalAlert(id);
      return true;
    } catch {
      if (previous) {
        setLegalAlerts((p) => p.map((a) => (a.id === id ? previous : a)));
      }
      return false;
    }
  };
  const resolveTicket = (id: string) => {
    setSupportTickets((p) =>
      p.map((t) => (t.id === id ? { ...t, status: "resolved" } : t)),
    );
    return api.content.resolveTicket(id).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
    notificationBus.emit({
      type: "success",
      message: "Ticket support marqué comme résolu",
    });
  };
  const markAlertRead = (id: string) => {
    setAlerts((p) => p.map((a) => (a.id === id ? { ...a, read: true } : a)));
    notificationsApi.markAlertRead(id).catch(() => {});
  };
  const refreshConversations = async () => {
    try {
      const res = (await chatApi.chat.conversations()) as { data: unknown[] };
      if (res?.data?.length) setConversations(res.data.map(mapConversationRow));
    } catch {
      /* keep stale */
    }
  };

  const markConversationRead = (conversationId: string) => {
    setConversations((p) =>
      p.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    );
    chatApi.chat.markRead(conversationId).catch(() => {});
  };

  const deleteConversation = (conversationId: string) => {
    setConversations((p) => p.filter((c) => c.id !== conversationId));
    return chatApi.chat.delete(conversationId).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };

  const sendMessage = (conversationId: string, text: string) => {
    const now = new Date();
    const msg: ChatMessage = {
      id: `m${Date.now()}`,
      conversationId,
      sender: "Moi",
      text,
      time: now.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isMe: true,
      messageType: "text",
      createdAt: now.toISOString(),
    };
    setMessages((p) => [...p, msg]);
    setConversations((p) =>
      p.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: text, time: msg.time, unread: 0 }
          : c,
      ),
    );
    return chatApi.chat.sendMessage(conversationId, text).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const addTransaction = (t: Transaction) => {
    setTransactions((p) => [t, ...p]);
    return financesApi.finance.addTransaction(t).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const updateTransactionStatus = async (
    id: string,
    status: Transaction["status"],
  ) => {
    // Capture original status for rollback
    let originalStatus: Transaction["status"] | undefined;
    setTransactions((p) => {
      const original = p.find((tx) => tx.id === id);
      if (original) originalStatus = original.status;
      return p.map((tx) => (tx.id === id ? { ...tx, status } : tx));
    });
    try {
      await financesApi.finance.updateTransactionStatus(id, status);
    } catch (err: any) {
      // Rollback to original status
      if (originalStatus !== undefined) {
        const prev = originalStatus;
        setTransactions((p) =>
          p.map((tx) => (tx.id === id ? { ...tx, status: prev } : tx)),
        );
      }
      notificationBus.emit({
        type: "error",
        message: err?.message ?? "Échec mise à jour du statut",
      });
      throw err;
    }
  };
  const likePublication = (id: string) => {
    setPublications((p) =>
      p.map((pub) => (pub.id === id ? { ...pub, likes: pub.likes + 1 } : pub)),
    );
    return communityApi.publications.like(id).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const addPublication = (pub: Publication) => {
    setPublications((p) => [pub, ...p]);
    return communityApi.publications.create(pub).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  const addToCart = (item: Omit<CartItem, "id">) =>
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.productId);
      if (existing) {
        return prev.map((c) =>
          c.productId === item.productId
            ? { ...c, quantity: c.quantity + item.quantity }
            : c,
        );
      }
      return [...prev, { ...item, id: `cart-${Date.now()}` }];
    });
  const removeFromCart = (id: string) =>
    setCart((p) => p.filter((c) => c.id !== id));
  const updateCartQty = (id: string, qty: number) =>
    setCart((p) =>
      p
        .map((c) => (c.id === id ? { ...c, quantity: qty } : c))
        .filter((c) => c.quantity > 0),
    );
  const clearCart = () => setCart([]);

  const addReview = (r: Review) => {
    setReviews((p) => [r, ...p]);
    return marketplaceApi.addReview(r).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };
  // ─── Invoice helpers ──────────────────────────────────────────────────────
  function mapDbInvoice(r: unknown): Invoice {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      reference: String(row.reference ?? ""),
      type: (row.type as "devis" | "facture") ?? "facture",
      recipient: String(row.recipient ?? ""),
      syndicate: String(
        (row as any).syndicate ?? (row as any).syndicateId ?? "",
      ),
      date: String(row.date ?? ""),
      dueDate: String(row.dueDate ?? ""),
      amount: Number(row.amount ?? 0),
      status: (row.status as Invoice["status"]) ?? "draft",
      items: Array.isArray(row.items)
        ? (row.items as Record<string, unknown>[]).map((i) => ({
            label: String(i.label ?? ""),
            quantity: Number(i.quantity ?? 1),
            unitPrice: Number(i.unitPrice ?? 0),
          }))
        : [],
      proofUrl: row.proofUrl ? String(row.proofUrl) : undefined,
    };
  }

  const refreshInvoices = async () => {
    setInvoicesLoading(true);
    setInvoicesLoadError(false);
    try {
      const res = (await financesApi.finance.invoices()) as { data: unknown[] };
      const rows = res?.data ?? [];
      setInvoices(rows.map(mapDbInvoice));
      setInvoicesLoadError(false);
      return true;
    } catch {
      setInvoicesLoadError(true);
      return false;
    } finally {
      setInvoicesLoading(false);
    }
  };

  const addInvoice = async (input: InvoiceCreateInput): Promise<boolean> => {
    try {
      const response = (await financesApi.finance.addInvoice(input)) as {
        data: unknown;
      };
      const created = mapDbInvoice(response.data);
      setInvoices((p) => [
        created,
        ...p.filter((invoice) => invoice.id !== created.id),
      ]);
      return true;
    } catch {
      return false;
    }
  };
  // Saved first, then listed with the server's id and number (BL-<year>-<n>):
  // a temporary id would make the next status change fail.
  const addBonLivraison = (bl: BonLivraison) =>
    financesApi.finance.addBon(bl).then(
      (res) => {
        const saved = (res as { data?: Partial<BonLivraison> & { id?: string } })?.data;
        const row = { ...bl, ...(saved ?? {}), items: bl.items, total: Number(saved?.total ?? bl.total) } as BonLivraison;
        setBonsLivraison((p) => [row, ...p]);
        return row;
      },
      (e) => {
        onWriteFailed(e);
        return null;
      },
    );
  const updateBonLivraisonStatus = (
    id: string,
    status: BonLivraison["status"],
  ) => {
    setBonsLivraison((p) =>
      p.map((bl) => (bl.id === id ? { ...bl, status } : bl)),
    );
    return financesApi.finance.updateBon(id, { status }).then(
      () => true,
      (e) => {
        onWriteFailed(e);
        return false;
      },
    );
  };

  return (
    <DataContext.Provider
      value={{
        dataLoading,
        dataLoadError,
        refreshData,
        meetingsLoadError,
        members,
        elections,
        candidates,
        meetings,
        documents,
        documentsLoading,
        documentsLoadError,
        partnersLoadError,
        legalAlertsLoading,
        legalAlertsLoadError,
        refreshLegalAlerts,
        products,
        transactions,
        salaries,
        caisseEntries,
        conversations,
        messages,
        syndicates,
        legalAlerts,
        supportTickets,
        orders,
        cotisations,
        alerts,
        publications,
        cart,
        bonsLivraison,
        invoices,
        invoicesLoading,
        invoicesLoadError,
        reviews,
        subscriptionPlans,
        syndicateSubscriptions,
        notificationPreferences,
        notificationPreferencesLoading,
        notificationPreferencesLoadError,
        refreshNotificationPreferences,
        partners,
        payslips,
        addMember,
        updateMemberStatus,
        addProduct,
        updateProduct,
        deleteProduct,
        validateProduct,
        addSyndicate,
        updateSyndicateStatus,
        resolveLegalAlert,
        addSupportTicket,
        resolveTicket,
        markAlertRead,
        markAllAlertsRead,
        refreshAlerts,
        sendMessage,
        addTransaction,
        updateTransactionStatus,
        likePublication,
        addPublication,
        addToCart,
        removeFromCart,
        updateCartQty,
        clearCart,
        addReview,
        addInvoice,
        refreshInvoices,
        addBonLivraison,
        updateBonLivraisonStatus,
        updateSubscription,
        toggleNotificationPref,
        toggleNotificationChannel,
        addPartner,
        updatePartnerStatus,
        generatePayslip,
        confirmMeetingAttendance,
        addMeeting,
        updateMeeting,
        updateDocument,
        addDocument,
        deleteDocument,
        refreshDocuments,
        markConversationRead,
        deleteConversation,
        refreshConversations,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
