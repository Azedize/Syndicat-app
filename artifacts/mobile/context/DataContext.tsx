import React, { createContext, useContext, useEffect, useState } from "react";
import * as api from "../services/api";
import { notificationBus } from "@/hooks/useNotificationBus";
import { useAuth } from "./AuthContext";

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
  title: string;
  date: string;
  time: string;
  location: string;
  type: "board" | "general" | "committee" | "emergency" | "ag_ordinaire" | "ag_extraordinaire" | "ag_constitutive" | "ag_elective";
  status: "scheduled" | "completed" | "cancelled" | "in_progress";
  attendees: number;
  description: string;
  agenda?: string[];
  userConfirmed?: boolean;
}

export interface Document {
  id: string;
  title: string;
  category: "reglements" | "statuts" | "pv" | "juridique" | "finances" | "attestation";
  date: string;
  size: string;
  status: "published" | "draft" | "pending" | "generated" | "pending_review" | "validated" | "signed" | "archived";
  content?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  seller: string;
  category: string;
  status: "approved" | "pending_review" | "rejected" | "modification_requested" | "sold_out";
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
  convType: "direct" | "group" | "announcement" | "support" | "building" | "marketplace" | "incident" | "emergency";
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

export interface SupportTicket {
  id: string;
  title: string;
  description: string;
  submittedBy: string;
  syndicate: string;
  priority: "high" | "medium" | "low";
  status: "open" | "in_progress" | "resolved" | "closed";
  date: string;
  category: "technique" | "financier" | "juridique" | "general";
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
  type: "assurance" | "banque" | "formation" | "sante" | "juridique" | "commercial" | "autre";
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
  members: Member[];
  elections: Election[];
  candidates: Candidate[];
  meetings: Meeting[];
  documents: Document[];
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
  reviews: Review[];
  subscriptionPlans: SubscriptionPlan[];
  syndicateSubscriptions: SyndicateSubscription[];
  notificationPreferences: NotificationPreference[];
  partners: Partner[];
  payslips: PayslipRecord[];
  updateSubscription: (id: string, planId: string) => void;
  toggleNotificationPref: (id: string, channel: "push" | "email" | "inApp") => void;
  addPartner: (p: Partner) => void;
  updatePartnerStatus: (id: string, status: Partner["status"]) => void;
  generatePayslip: (employeeId: string, month: string) => void;
  likePublication: (id: string) => void;
  addPublication: (p: Publication) => void;
  addMember: (m: Member) => void;
  updateMemberStatus: (id: string, status: Member["status"]) => void;
  addProduct: (p: Product) => void;
  updateProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  validateProduct: (id: string) => void;
  addSyndicate: (s: Syndicate) => void;
  updateSyndicateStatus: (id: string, status: Syndicate["status"]) => void;
  resolveLegalAlert: (id: string) => void;
  addSupportTicket: (t: SupportTicket) => void;
  resolveTicket: (id: string) => void;
  payOrder: (id: string) => void;
  payCotisation: (id: string) => void;
  markAlertRead: (id: string) => void;
  refreshAlerts: () => Promise<void>;
  voteForCandidate: (candidateId: string, electionId: string) => Promise<void>;
  sendMessage: (conversationId: string, text: string) => void;
  markConversationRead: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  refreshConversations: () => Promise<void>;
  addTransaction: (t: Transaction) => void;
  updateTransactionStatus: (id: string, status: Transaction["status"]) => Promise<void>;
  createElection: (e: Election) => void;
  addToCart: (item: Omit<CartItem, "id">) => void;
  removeFromCart: (id: string) => void;
  updateCartQty: (id: string, qty: number) => void;
  clearCart: () => void;
  addReview: (r: Review) => void;
  addInvoice: (inv: Invoice) => Promise<boolean>;
  refreshInvoices: () => Promise<void>;
  addBonLivraison: (bl: BonLivraison) => void;
  updateBonLivraisonStatus: (id: string, status: BonLivraison["status"]) => void;
  confirmMeetingAttendance: (id: string) => void;
  addMeeting: (m: Meeting) => void;
  updateMeeting: (m: Meeting) => void;
  updateDocument: (id: string, changes: Partial<Pick<Document, "title" | "content" | "category" | "status">>) => void;
  addDocument: (doc: Document) => void;
  refreshDocuments: () => Promise<void>;
  deleteDocument: (id: string) => void;
  markAllAlertsRead: () => void;
}



// ─── Row mapper (module-level, no closure deps) ──────────────────────────────

function mapConversationRow(r: unknown): import("./DataContext").ChatConversation {
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
    participantIds: Array.isArray(row.participantIds) ? (row.participantIds as string[]) : [],
    isArchived: Boolean(row.isArchived),
    isBlocked: Boolean(row.isBlocked),
  };
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
  const [caisseEntries, setCaisseEntries] = useState<CaisseEntry[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [syndicates, setSyndicates] = useState<Syndicate[]>([]);
  const [legalAlerts, setLegalAlerts] = useState<LegalAlert[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cotisations, setCotisations] = useState<Cotisation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [bonsLivraison, setBonsLivraison] = useState<BonLivraison[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [syndicateSubscriptions, setSyndicateSubscriptions] = useState<SyndicateSubscription[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreference[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [payslips, setPayslips] = useState<PayslipRecord[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadFromApi() {
      try {
        const results = await Promise.allSettled([
          api.members.list(),
          api.elections.list(),
          api.meetings.list(),
          api.finance.transactions(),
          api.finance.salaries(),
          api.finance.caisse(),
          api.finance.invoices(),
          api.finance.bons(),
          api.marketplace.products(),
          api.marketplace.orders(),
          api.marketplace.reviews(),
          api.chat.conversations(),
          api.syndicates.list(),
          api.content.legalAlerts(),
          api.content.supportTickets(),
          api.content.cotisations(),
          api.content.alerts(),
          api.publications.list(),
          api.content.notificationPrefs(),
          api.content.subscriptions(),
          api.content.subscriptionPlans(),
          api.content.partners(),
          api.content.payslips(),
          api.documents.list(),
        ]);

        if (cancelled) return;

        const [
          membersRes, electionsRes, meetingsRes,
          transactionsRes, salariesRes, caisseRes, invoicesRes, bonsRes,
          productsRes, ordersRes, reviewsRes,
          conversationsRes, syndicatesRes,
          legalAlertsRes, ticketsRes, cotisationsRes, alertsRes,
          publicationsRes, notifPrefsRes, subsRes, plansRes, partnersRes, payslipsRes,
          documentsRes,
        ] = results;

        if (membersRes.status === "fulfilled") {
          const rows = (membersRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setMembers(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return {
                id: String(row.id),
                name: String(row.name ?? ""),
                email: String(row.email ?? ""),
                phone: String(row.phone ?? ""),
                profession: String(row.profession ?? ""),
                joinDate: String(row.joinDate ?? row.createdAt ?? ""),
                status: (row.status as Member["status"]) ?? "active",
                cotisationStatus: (row.cotisationStatus as Member["cotisationStatus"]) ?? "pending",
                syndicate: String(row.syndicate ?? row.syndicateName ?? ""),
              };
            }));
          }
        }

        if (electionsRes.status === "fulfilled") {
          const rows = (electionsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setElections(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              const cands = Array.isArray(row.candidates) ? row.candidates as Record<string, unknown>[] : [];
              return {
                id: String(row.id),
                title: String(row.title ?? ""),
                status: (row.status as Election["status"]) ?? "upcoming",
                candidates: cands.length,
                votes: cands.reduce((s, c) => s + Number(c.votes ?? 0), 0),
                startDate: String(row.startDate ?? ""),
                endDate: String(row.endDate ?? ""),
                description: String(row.description ?? ""),
              };
            }));
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
                    voted: row.userVotedCandidateId != null && String(row.userVotedCandidateId) === String(cand.id),
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
            setMeetings(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              let agenda: string[] | undefined;
              if (Array.isArray(row.agendaLines) && (row.agendaLines as unknown[]).length > 0) {
                agenda = (row.agendaLines as unknown[]).map(String);
              } else if (Array.isArray(row.agenda) && (row.agenda as unknown[]).length > 0) {
                agenda = (row.agenda as unknown[]).map(String);
              } else if (typeof row.agenda === "string" && row.agenda.trim()) {
                agenda = row.agenda.split("\n").map((s) => s.trim()).filter(Boolean);
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
            }));
          }
        }

        if (transactionsRes.status === "fulfilled") {
          const rows = (transactionsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setTransactions(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (productsRes.status === "fulfilled") {
          const rows = (productsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setProducts(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (legalAlertsRes.status === "fulfilled") {
          const rows = (legalAlertsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setLegalAlerts(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (ticketsRes.status === "fulfilled") {
          const rows = (ticketsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSupportTickets(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return {
                id: String(row.id),
                title: String(row.title ?? ""),
                description: String(row.description ?? ""),
                submittedBy: String(row.submittedBy ?? row.submittedByName ?? ""),
                syndicate: String(row.syndicate ?? row.syndicateName ?? ""),
                priority: (row.priority as SupportTicket["priority"]) ?? "medium",
                status: (row.status as SupportTicket["status"]) ?? "open",
                date: String(row.date ?? row.createdAt ?? ""),
                category: (row.category as SupportTicket["category"]) ?? "general",
              };
            }));
          }
        }

        if (cotisationsRes.status === "fulfilled") {
          const rows = (cotisationsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setCotisations(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (alertsRes.status === "fulfilled") {
          const rows = (alertsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setAlerts(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return {
                id: String(row.id),
                title: String(row.title ?? ""),
                message: String(row.message ?? ""),
                type: (row.type as Alert["type"]) ?? "info",
                date: String(row.date ?? row.createdAt ?? ""),
                read: Boolean((row as any).readByUser ?? row.read),
                target: (row.target as Alert["target"]) ?? "all",
              };
            }));
          }
        }

        if (publicationsRes.status === "fulfilled") {
          const rows = (publicationsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setPublications(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (syndicatesRes.status === "fulfilled") {
          const rows = (syndicatesRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSyndicates(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return {
                id: String(row.id),
                name: String(row.name ?? ""),
                sector: String(row.sector ?? ""),
                members: Number(row.membersCount ?? row.members ?? 0),
                admin: String(row.admin ?? row.adminName ?? ""),
                status: (row.status as Syndicate["status"]) ?? "active",
                createdAt: String(row.createdAt ?? ""),
                region: String(row.region ?? ""),
              };
            }));
          }
        }

        if (notifPrefsRes.status === "fulfilled") {
          const rows = (notifPrefsRes.value as { data: unknown[] }).data;
          if (rows?.length) setNotificationPreferences(rows as NotificationPreference[]);
        }

        if (subsRes.status === "fulfilled") {
          const rows = (subsRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSyndicateSubscriptions(rows.map((r: unknown) => {
              const row = r as Record<string, unknown>;
              return { ...(row as unknown as SyndicateSubscription), amount: Number(row.amount ?? 0) };
            }));
          }
        }

        if (plansRes.status === "fulfilled") {
          const rows = (plansRes.value as { data: unknown[] }).data;
          if (rows?.length) setSubscriptionPlans(rows as SubscriptionPlan[]);
        }

        if (partnersRes.status === "fulfilled") {
          const rows = (partnersRes.value as { data: unknown[] }).data;
          if (rows?.length) setPartners(rows as Partner[]);
        }

        if (payslipsRes.status === "fulfilled") {
          const rows = (payslipsRes.value as { data: unknown[] }).data;
          if (rows?.length) setPayslips(rows as PayslipRecord[]);
        }

        if (salariesRes.status === "fulfilled") {
          const rows = (salariesRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setSalaries(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (caisseRes.status === "fulfilled") {
          const rows = (caisseRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setCaisseEntries(rows.map((r: unknown) => {
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
            }));
          }
        }

        if (invoicesRes.status === "fulfilled") {
          const rows = (invoicesRes.value as { data: unknown[] }).data;
          if (rows?.length) setInvoices(rows.map(mapDbInvoice));
        }

        if (bonsRes.status === "fulfilled") {
          const rows = (bonsRes.value as { data: unknown[] }).data;
          if (rows?.length) setBonsLivraison(rows as BonLivraison[]);
        }

        if (ordersRes.status === "fulfilled") {
          const rows = (ordersRes.value as { data: unknown[] }).data;
          if (rows?.length) {
            setOrders(rows.map((r: unknown) => {
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
            }));
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
          if (rows?.length) {
            setDocuments(rows.map((r: unknown) => {
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
            }));
          }
        }
      } catch {
        // API call failed (network/auth error): keep whatever was already
        // loaded (or the empty initial state) rather than throwing — this
        // effect has no UI-visible error surface, and other screens read
        // these arrays defensively (empty-state UI, not fake data).
      }
    }
    loadFromApi();
    return () => { cancelled = true; };
  }, [user?.id]);

  const updateSubscription = (id: string, planId: string) => {
    const plan = subscriptionPlans.find((p) => p.id === planId);
    if (!plan) return;
    setSyndicateSubscriptions((p) =>
      p.map((s) => s.id === id ? { ...s, planId, planName: plan.name, amount: plan.price, maxMembers: plan.maxMembers } : s)
    );
    api.content.updateSubscription(id, planId).catch(() => {});
  };

  const toggleNotificationPref = (id: string, channel: "push" | "email" | "inApp") => {
    const current = notificationPreferences.find((n) => n.id === id);
    const newValue = current ? !current[channel] : true;
    setNotificationPreferences((p) =>
      p.map((n) => (n.id === id ? { ...n, [channel]: !n[channel] } : n))
    );
    api.content.toggleNotificationPref(id, channel, newValue).catch(() => {});
  };

  const addPartner = (p: Partner) => {
    setPartners((prev) => [p, ...prev]);
    api.content.addPartner(p).catch(() => {});
  };
  const updatePartnerStatus = (id: string, status: Partner["status"]) => {
    setPartners((p) => p.map((pt) => (pt.id === id ? { ...pt, status } : pt)));
    api.content.updatePartnerStatus(id, status).catch(() => {});
  };
  const generatePayslip = (employeeId: string, month: string) => {
    const existing = payslips.find((ps) => ps.employeeId === employeeId);
    if (!existing) return;
    const newPs: PayslipRecord = {
      ...existing,
      id: `ps${Date.now()}`,
      month,
      status: "draft",
      payDate: undefined,
    };
    setPayslips((p) => [newPs, ...p]);
    api.content.generatePayslip(employeeId, month).catch(() => {});
  };

  const confirmMeetingAttendance = (id: string) => {
    setMeetings((p) => p.map((m) => m.id === id ? { ...m, attendees: m.attendees + 1, userConfirmed: true } : m));
    api.meetings.confirmAttendance(id).catch(() => {});
  };

  const addMeeting = (m: Meeting) => {
    setMeetings((p) => [m, ...p]);
  };

  const updateMeeting = (m: Meeting) => {
    setMeetings((p) => p.map((x) => x.id === m.id ? m : x));
  };

  const markAllAlertsRead = () => {
    setAlerts((p) => p.map((a) => ({ ...a, read: true })));
    api.content.markAllAlertsRead().catch(() => {});
  };

  const refreshAlerts = async () => {
    try {
      const res = await api.content.alerts() as any;
      const rows = (res.data ?? []) as Record<string, unknown>[];
      setAlerts(rows.map((row) => ({
        id: String(row.id),
        title: String(row.title ?? ""),
        message: String(row.message ?? ""),
        type: (row.type as Alert["type"]) ?? "info",
        date: String(row.date ?? row.createdAt ?? ""),
        read: Boolean((row as any).readByUser ?? row.read),
        target: (row.target as Alert["target"]) ?? "all",
      })));
    } catch {
      // keep showing stale data
    }
  };

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { refreshAlerts(); }, 30_000);
    return () => clearInterval(id);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll conversations every 5s for real-time unread count and last message updates
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { refreshConversations(); }, 5_000);
    return () => clearInterval(id);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMember = (m: Member) => {
    setMembers((p) => [m, ...p]);
    api.members.create(m).catch(() => {
      notificationBus.emit({ type: "warning", message: `Membre ajouté localement — sera synchronisé au prochain démarrage` });
    });
    notificationBus.emit({ type: "success", message: `Demande d'adhésion enregistrée : ${m.name}` });
  };
  const updateMemberStatus = (id: string, status: Member["status"]) => {
    setMembers((p) => p.map((m) => (m.id === id ? { ...m, status } : m)));
    api.members.updateStatus(id, status).catch(() => {});
    const action = status === "active" ? "approve_member" : "reject_member";
    api.content.auditLog({ action, entity: "membre", entityId: id, details: `Nouveau statut: ${status}` }).catch(() => {});
    if (status === "active") notificationBus.emit({ type: "success", message: "Membre approuvé — il peut maintenant accéder à l'espace syndical" });
    else if (status === "inactive") notificationBus.emit({ type: "info", message: "Demande d'adhésion refusée" });
  };
  const addProduct = (p: Product) => {
    setProducts((prev) => [p, ...prev]);
    api.marketplace.addProduct(p).catch(() => {});
  };
  const updateProduct = (p: Product) => {
    setProducts((prev) => prev.map((pr) => (pr.id === p.id ? p : pr)));
    api.marketplace.updateProduct(p.id, p).catch(() => {});
  };
  const updateDocument = (id: string, changes: Partial<Pick<Document, "title" | "content" | "category" | "status">>) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  };

  const addDocument = (doc: Document) => {
    setDocuments((prev) => [doc, ...prev]);
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const refreshDocuments = async () => {
    try {
      const res = await api.documents.list();
      const rows = (res as { data: unknown[] }).data ?? [];
      setDocuments(rows.map((r: unknown) => {
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
      }));
    } catch {
      // Silently keep existing list on refresh failure
    }
  };
  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((pr) => pr.id !== id));
    api.marketplace.deleteProduct(id).catch(() => {});
  };
  const validateProduct = (id: string) => {
    setProducts((p) => p.map((pr) => (pr.id === id ? { ...pr, status: "approved" } : pr)));
    api.marketplace.updateProduct(id, { status: "approved" }).catch(() => {});
    notificationBus.emit({ type: "success", message: "Produit validé et publié sur le marketplace" });
  };
  const addSyndicate = (s: Syndicate) => {
    setSyndicates((p) => [s, ...p]);
    api.syndicates.create(s).catch(() => {});
  };
  const updateSyndicateStatus = (id: string, status: Syndicate["status"]) => {
    setSyndicates((p) => p.map((s) => (s.id === id ? { ...s, status } : s)));
    api.syndicates.update(id, { status }).catch(() => {});
  };
  const addSupportTicket = (t: SupportTicket) => {
    setSupportTickets((p) => [t, ...p]);
    api.content.createTicket(t).catch(() => {});
    notificationBus.emit({ type: "info", message: `Ticket support soumis : "${t.title}"` });
  };
  const resolveLegalAlert = (id: string) => {
    setLegalAlerts((p) => p.map((a) => (a.id === id ? { ...a, status: "resolved" } : a)));
    api.content.resolveLegalAlert(id).catch(() => {});
  };
  const resolveTicket = (id: string) => {
    setSupportTickets((p) => p.map((t) => (t.id === id ? { ...t, status: "resolved" } : t)));
    api.content.resolveTicket(id).catch(() => {});
    notificationBus.emit({ type: "success", message: "Ticket support marqué comme résolu" });
  };
  const payOrder = (id: string) => {
    const receipt = `CMD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, status: "delivered" as const } : o
      )
    );
    api.content.auditLog({ action: "pay_order", entity: "commande", entityId: id, details: `Reçu: ${receipt}` }).catch(() => {});
    notificationBus.emit({ type: "success", message: `Commande payée — reçu ${receipt} généré` });
  };
  const payCotisation = (id: string) => {
    const receipt = `REC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setCotisations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: "paid" as const, paidDate: new Date().toISOString().slice(0, 10), receipt }
          : c
      )
    );
    api.content.payCotisation(id).catch(() => {
      notificationBus.emit({ type: "warning", message: "Paiement enregistré — synchronisation en attente" });
    });
    api.content.auditLog({ action: "pay_cotisation", entity: "cotisation", entityId: id, details: `Reçu: ${receipt}` }).catch(() => {});
    notificationBus.emit({ type: "success", message: `Cotisation payée — reçu ${receipt} généré` });
  };
  const markAlertRead = (id: string) => {
    setAlerts((p) => p.map((a) => (a.id === id ? { ...a, read: true } : a)));
    api.content.markAlertRead(id).catch(() => {});
  };
  const voteForCandidate = async (candidateId: string, electionId: string): Promise<void> => {
    try {
      await api.elections.vote(electionId, candidateId);
      setCandidates((p) =>
        p.map((c) => (c.id === candidateId ? { ...c, votes: c.votes + 1, voted: true } : c))
      );
      notificationBus.emit({ type: "success", message: "Vote enregistré avec succès — merci pour votre participation" });
      api.content.auditLog({ action: "vote", entity: "élection", entityId: electionId, details: `Candidat ${candidateId}` }).catch(() => {});
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Erreur lors du vote — veuillez réessayer";
      notificationBus.emit({ type: "error", message: msg });
      throw err;
    }
  };
  const refreshConversations = async () => {
    try {
      const res = await api.chat.conversations() as { data: unknown[] };
      if (res?.data?.length) setConversations(res.data.map(mapConversationRow));
    } catch { /* keep stale */ }
  };

  const markConversationRead = (conversationId: string) => {
    setConversations((p) => p.map((c) => c.id === conversationId ? { ...c, unread: 0 } : c));
    api.chat.markRead(conversationId).catch(() => {});
  };

  const deleteConversation = (conversationId: string) => {
    setConversations((p) => p.filter((c) => c.id !== conversationId));
    api.chat.delete(conversationId).catch(() => {});
  };

  const sendMessage = (conversationId: string, text: string) => {
    const now = new Date();
    const msg: ChatMessage = {
      id: `m${Date.now()}`,
      conversationId,
      sender: "Moi",
      text,
      time: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      isMe: true,
      messageType: "text",
      createdAt: now.toISOString(),
    };
    setMessages((p) => [...p, msg]);
    setConversations((p) => p.map((c) =>
      c.id === conversationId ? { ...c, lastMessage: text, time: msg.time, unread: 0 } : c
    ));
    api.chat.sendMessage(conversationId, text).catch(() => {});
  };
  const addTransaction = (t: Transaction) => {
    setTransactions((p) => [t, ...p]);
    api.finance.addTransaction(t).catch(() => {});
  };
  const updateTransactionStatus = async (id: string, status: Transaction["status"]) => {
    // Capture original status for rollback
    let originalStatus: Transaction["status"] | undefined;
    setTransactions((p) => {
      const original = p.find((tx) => tx.id === id);
      if (original) originalStatus = original.status;
      return p.map((tx) => (tx.id === id ? { ...tx, status } : tx));
    });
    try {
      await api.finance.updateTransactionStatus(id, status);
    } catch (err: any) {
      // Rollback to original status
      if (originalStatus !== undefined) {
        const prev = originalStatus;
        setTransactions((p) =>
          p.map((tx) => (tx.id === id ? { ...tx, status: prev } : tx))
        );
      }
      notificationBus.emit({ type: "error", message: err?.message ?? "Échec mise à jour du statut" });
      throw err;
    }
  };
  const likePublication = (id: string) => {
    setPublications((p) => p.map((pub) => (pub.id === id ? { ...pub, likes: pub.likes + 1 } : pub)));
    api.publications.like(id).catch(() => {});
  };
  const addPublication = (pub: Publication) => {
    setPublications((p) => [pub, ...p]);
    api.publications.create(pub).catch(() => {});
  };
  const createElection = (e: Election) => {
    setElections((p) => [e, ...p]);
    api.elections.create(e).catch(() => {
      notificationBus.emit({ type: "warning", message: "Élection créée localement — synchronisation en attente" });
    });
    api.content.auditLog({ action: "create_election", entity: "élection", entityId: e.id, details: e.title }).catch(() => {});
    notificationBus.emit({ type: "info", message: `Élection créée : "${e.title}" — les membres peuvent voter` });
  };

  const addToCart = (item: Omit<CartItem, "id">) =>
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.productId);
      if (existing) {
        return prev.map((c) => c.productId === item.productId ? { ...c, quantity: c.quantity + item.quantity } : c);
      }
      return [...prev, { ...item, id: `cart-${Date.now()}` }];
    });
  const removeFromCart = (id: string) => setCart((p) => p.filter((c) => c.id !== id));
  const updateCartQty = (id: string, qty: number) =>
    setCart((p) => p.map((c) => (c.id === id ? { ...c, quantity: qty } : c)).filter((c) => c.quantity > 0));
  const clearCart = () => setCart([]);

  const addReview = (r: Review) => {
    setReviews((p) => [r, ...p]);
    api.marketplace.addReview(r).catch(() => {});
  };
  // ─── Invoice helpers ──────────────────────────────────────────────────────
  function mapDbInvoice(r: unknown): Invoice {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      reference: String(row.reference ?? ""),
      type: (row.type as "devis" | "facture") ?? "facture",
      recipient: String(row.recipient ?? ""),
      syndicate: String((row as any).syndicate ?? (row as any).syndicateId ?? ""),
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
    try {
      const res = await api.finance.invoices() as { data: unknown[] };
      const rows = res?.data ?? [];
      setInvoices(rows.map(mapDbInvoice));
    } catch { /* keep stale */ }
  };

  const addInvoice = async (inv: Invoice): Promise<boolean> => {
    const optimisticId = inv.id;
    setInvoices((p) => [inv, ...p]); // optimistic insert
    try {
      await api.finance.addInvoice(inv);
      // Refresh from DB to replace fake ID with real UUID and pick up server-computed fields
      await refreshInvoices();
      notificationBus.emit({ type: "success", message: `${inv.type === "facture" ? "Facture" : "Devis"} ${inv.reference} créé avec succès` });
      return true;
    } catch (err: any) {
      // Rollback optimistic insert on failure
      setInvoices((p) => p.filter((i) => i.id !== optimisticId));
      const msg = err?.message ?? "Erreur réseau — vérifiez votre connexion";
      notificationBus.emit({ type: "error", message: `Échec création : ${msg}` });
      return false;
    }
  };
  const addBonLivraison = (bl: BonLivraison) => {
    setBonsLivraison((p) => [bl, ...p]);
    api.finance.addBon(bl).catch(() => {});
  };
  const updateBonLivraisonStatus = (id: string, status: BonLivraison["status"]) => {
    setBonsLivraison((p) => p.map((bl) => (bl.id === id ? { ...bl, status } : bl)));
    api.finance.updateBon(id, { status }).catch(() => {});
  };

  return (
    <DataContext.Provider
      value={{
        members, elections, candidates, meetings, documents, products,
        transactions, salaries, caisseEntries, conversations, messages,
        syndicates, legalAlerts, supportTickets, orders, cotisations, alerts,
        publications, cart, bonsLivraison, invoices, reviews,
        subscriptionPlans, syndicateSubscriptions, notificationPreferences,
        partners, payslips,
        addMember, updateMemberStatus, addProduct, updateProduct, deleteProduct, validateProduct,
        addSyndicate, updateSyndicateStatus, resolveLegalAlert, addSupportTicket, resolveTicket, payOrder, payCotisation,
        markAlertRead, markAllAlertsRead, refreshAlerts, voteForCandidate, sendMessage, addTransaction, updateTransactionStatus,
        likePublication, addPublication, createElection,
        addToCart, removeFromCart, updateCartQty, clearCart,
        addReview, addInvoice, refreshInvoices, addBonLivraison, updateBonLivraisonStatus,
        updateSubscription, toggleNotificationPref,
        addPartner, updatePartnerStatus, generatePayslip,
        confirmMeetingAttendance,
        addMeeting, updateMeeting, updateDocument, addDocument, deleteDocument, refreshDocuments,
        markConversationRead, deleteConversation, refreshConversations,
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
