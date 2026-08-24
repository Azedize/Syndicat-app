import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useData } from "./DataContext";
import { useAuth } from "./AuthContext";

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  categoryLabel: string;
  icon: string;
  color: string;
  route: string;
  params?: Record<string, string>;
}

export interface SearchGroup {
  category: string;
  label: string;
  icon: string;
  color: string;
  results: SearchResult[];
}

type ScoredResult = SearchResult & { _score: number };

export const SEARCH_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  membre: { label: "Membres", icon: "users", color: "#2563EB" },
  syndicat: { label: "Syndicats", icon: "shield", color: "#5b21b6" },
  publication: { label: "Publications", icon: "rss", color: "#f97316" },
  document: { label: "Documents", icon: "file-text", color: "#1F5EFF" },
  reunion: { label: "Réunions", icon: "calendar", color: "#3b82f6" },
  election: { label: "Élections", icon: "check-square", color: "#f59e0b" },
  alerte: { label: "Alertes", icon: "bell", color: "#ef4444" },
  message: { label: "Messages", icon: "message-circle", color: "#ec4899" },
  produit: { label: "Produits", icon: "shopping-bag", color: "#10b981" },
  ticket: { label: "Support", icon: "headphones", color: "#8b5cf6" },
  transaction: { label: "Finance", icon: "dollar-sign", color: "#059669" },
  partenaire: { label: "Partenaires", icon: "briefcase", color: "#0891b2" },
  cotisation: { label: "Cotisations", icon: "credit-card", color: "#10b981" },
  commande: { label: "Commandes", icon: "package", color: "#1F5EFF" },
  navigation: { label: "Navigation", icon: "grid", color: "#6b7280" },
};

const HISTORY_KEY = "@syndycat_search_history";
const MAX_HISTORY = 12;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 75;
  const tokens = q.split(/\s+/);
  let matched = 0;
  for (const tok of tokens) {
    if (tok.length >= 2 && t.includes(tok)) matched++;
  }
  if (matched === tokens.length) return 60;
  if (matched > 0) return 30 + (matched / tokens.length) * 20;
  return 0;
}

function scoreResult(query: string, fields: string[]): number {
  return Math.max(...fields.map((f) => fuzzyScore(query, f)));
}

const NAVIGATION_ITEMS = [
  { id: "nav-dashboard", title: "Dashboard", subtitle: "Accueil principal", route: "/(tabs)/", icon: "home", color: "#2563EB" },
  { id: "nav-members", title: "Membres / Syndicats", subtitle: "Gestion des membres", route: "/members", icon: "users", color: "#2563EB" },
  { id: "nav-finance", title: "Finance", subtitle: "Comptabilité et transactions", route: "/finance", icon: "dollar-sign", color: "#10b981" },
  { id: "nav-marketplace", title: "Marketplace", subtitle: "Boutique en ligne", route: "/marketplace", icon: "shopping-bag", color: "#f97316" },
  { id: "nav-elections", title: "Élections", subtitle: "Votes et candidats", route: "/elections", icon: "check-square", color: "#f59e0b" },
  { id: "nav-meetings", title: "Réunions", subtitle: "Agenda des réunions", route: "/meetings", icon: "calendar", color: "#3b82f6" },
  { id: "nav-governance", title: "Gouvernance", subtitle: "Organigramme et commissions", route: "/governance", icon: "git-merge", color: "#10b981" },
  { id: "nav-legal", title: "Module Juridique", subtitle: "Alertes et risques légaux", route: "/legal", icon: "shield", color: "#8b5cf6" },
  { id: "nav-documents", title: "Documents", subtitle: "Base documentaire", route: "/documents", icon: "file-text", color: "#1F5EFF" },
  { id: "nav-publications", title: "Publications", subtitle: "Articles et actualités", route: "/publications", icon: "rss", color: "#f97316" },
  { id: "nav-alerts", title: "Alertes", subtitle: "Notifications et alertes", route: "/alerts", icon: "bell", color: "#ef4444" },
  { id: "nav-chat", title: "Chat Hub", subtitle: "Messages et conversations", route: "/chat", icon: "message-circle", color: "#ec4899" },
  { id: "nav-cotisations", title: "Mes Cotisations", subtitle: "Paiements des cotisations", route: "/cotisations", icon: "credit-card", color: "#10b981" },
  { id: "nav-support", title: "Tickets Support", subtitle: "Aide et assistance", route: "/support", icon: "headphones", color: "#ef4444" },
  { id: "nav-profile", title: "Mon Profil", subtitle: "Informations personnelles", route: "/profile", icon: "user", color: "#1F5EFF" },
  { id: "nav-settings", title: "Paramètres", subtitle: "Configuration et préférences", route: "/settings", icon: "settings", color: "#6b7280" },
  { id: "nav-reports", title: "Rapports", subtitle: "Statistiques et exports", route: "/reports", icon: "bar-chart-2", color: "#2563EB" },
  { id: "nav-calendar", title: "Calendrier", subtitle: "Planning et événements", route: "/calendar", icon: "calendar", color: "#1F5EFF" },
  { id: "nav-formations", title: "Formations", subtitle: "Catalogue de formations", route: "/formations", icon: "book-open", color: "#3b82f6" },
  { id: "nav-partenaires", title: "Partenaires", subtitle: "Partenaires et avantages", route: "/partenaires", icon: "briefcase", color: "#3b82f6" },
  { id: "nav-orders", title: "Mes Commandes", subtitle: "Achats et ventes", route: "/orders", icon: "package", color: "#1F5EFF" },
  { id: "nav-myshop", title: "Ma Boutique", subtitle: "Gestion de mes produits", route: "/my-shop", icon: "shopping-bag", color: "#10b981" },
  { id: "nav-reviews", title: "Avis & Évaluations", subtitle: "Notes et commentaires", route: "/reviews", icon: "star", color: "#f97316" },
  { id: "nav-statistiques", title: "Statistiques Globales", subtitle: "Tableaux de bord avancés", route: "/statistiques", icon: "trending-up", color: "#10b981" },
  { id: "nav-sondages", title: "Sondages", subtitle: "Enquêtes et votes", route: "/sondages", icon: "bar-chart-2", color: "#2563EB" },
  { id: "nav-actions", title: "Actions Syndicales", subtitle: "Grèves et mobilisations", route: "/actions", icon: "zap", color: "#ef4444" },
  { id: "nav-annuaire", title: "Annuaire Membres", subtitle: "Répertoire des membres", route: "/annuaire", icon: "book", color: "#10b981" },
  { id: "nav-invoices", title: "Devis & Factures", subtitle: "Facturation et devis", route: "/invoices", icon: "file-text", color: "#3b82f6" },
  { id: "nav-fiches", title: "Fiches de Paie", subtitle: "Bulletins de salaire", route: "/fiches-paie", icon: "file-text", color: "#1F5EFF" },
  { id: "nav-abonnements", title: "Abonnements", subtitle: "Plans et facturation", route: "/abonnements", icon: "star", color: "#f59e0b" },
  { id: "nav-cart", title: "Mon Panier", subtitle: "Articles en attente", route: "/cart", icon: "shopping-cart", color: "#f59e0b" },
  { id: "nav-notifications", title: "Notifications", subtitle: "Préférences de notifications", route: "/notifications", icon: "bell", color: "#ec4899" },
];

interface SearchContextType {
  query: string;
  setQuery: (q: string) => void;
  results: SearchGroup[];
  history: string[];
  addHistory: (q: string) => void;
  removeHistory: (q: string) => void;
  clearHistory: () => void;
  isSearching: boolean;
  totalCount: number;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const data = useData();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((val) => {
      if (val) setHistory(JSON.parse(val));
    });
  }, []);

  const saveHistory = useCallback((h: string[]) => {
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    setHistory(h);
  }, []);

  const addHistory = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || trimmed.length < 2) return;
      setHistory((prev) => {
        const filtered = prev.filter((h) => h !== trimmed);
        const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const removeHistory = useCallback((q: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== q);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => saveHistory([]), [saveHistory]);

  const buildResults = useCallback(
    (q: string): SearchGroup[] => {
      if (!q.trim() || q.trim().length < 1) return [];
      const role = user?.role ?? "member";
      const isAdmin = role === "super_admin" || role === "syndicate_admin";
      const isSuperAdmin = role === "super_admin";
      const groups: SearchGroup[] = [];

      const addGroup = (category: string, items: ScoredResult[]) => {
        const sorted = items
          .filter((r) => r._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5)
          .map(({ _score, ...rest }) => rest as SearchResult);
        if (sorted.length > 0) {
          const cat = SEARCH_CATEGORIES[category];
          groups.push({ category, label: cat.label, icon: cat.icon, color: cat.color, results: sorted });
        }
      };

      // Membres
      const memberResults: ScoredResult[] = data.members.map((m) => ({
        id: m.id,
        title: m.name,
        subtitle: `${m.profession} · ${m.syndicate} · ${m.status === "active" ? "Actif" : m.status === "inactive" ? "Inactif" : "En attente"}`,
        category: "membre",
        categoryLabel: "Membres",
        icon: "user",
        color: SEARCH_CATEGORIES.membre.color,
        route: "/member-detail",
        params: { id: m.id },
        _score: scoreResult(q, [m.name, m.profession, m.email, m.syndicate]),
      }));
      addGroup("membre", memberResults);

      // Syndicats (super admin only)
      if (isSuperAdmin) {
        const synResults: ScoredResult[] = data.syndicates.map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: `${s.sector} · ${s.members} membres · ${s.region}`,
          category: "syndicat",
          categoryLabel: "Syndicats",
          icon: "shield",
          color: SEARCH_CATEGORIES.syndicat.color,
          route: "/members",
          _score: scoreResult(q, [s.name, s.sector, s.region, s.admin]),
        }));
        addGroup("syndicat", synResults);
      }

      // Publications
      const pubResults: ScoredResult[] = data.publications.map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: `${p.author} · ${p.category} · ${p.likes} likes`,
        category: "publication",
        categoryLabel: "Publications",
        icon: "rss",
        color: SEARCH_CATEGORIES.publication.color,
        route: "/publications",
        _score: scoreResult(q, [p.title, p.content, p.author, p.category]),
      }));
      addGroup("publication", pubResults);

      // Documents
      const docResults: ScoredResult[] = data.documents.map((d) => ({
        id: d.id,
        title: d.title,
        subtitle: `${d.category} · ${d.size} · ${d.status === "published" ? "Publié" : "Brouillon"}`,
        category: "document",
        categoryLabel: "Documents",
        icon: "file-text",
        color: SEARCH_CATEGORIES.document.color,
        route: "/documents",
        _score: scoreResult(q, [d.title, d.category]),
      }));
      addGroup("document", docResults);

      // Réunions
      const meetingResults: ScoredResult[] = data.meetings.map((m) => ({
        id: m.id,
        title: m.title,
        subtitle: `${m.date} · ${m.location} · ${m.attendees} participants`,
        category: "reunion",
        categoryLabel: "Réunions",
        icon: "calendar",
        color: SEARCH_CATEGORIES.reunion.color,
        route: "/meetings",
        _score: scoreResult(q, [m.title, m.location, m.description, m.type]),
      }));
      addGroup("reunion", meetingResults);

      // Élections
      const elecResults: ScoredResult[] = data.elections.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: `${e.status === "open" ? "En cours" : e.status === "upcoming" ? "À venir" : "Terminée"} · ${e.candidates} candidats`,
        category: "election",
        categoryLabel: "Élections",
        icon: "check-square",
        color: SEARCH_CATEGORIES.election.color,
        route: "/elections",
        _score: scoreResult(q, [e.title, e.description]),
      }));
      addGroup("election", elecResults);

      // Alertes
      const alertResults: ScoredResult[] = data.alerts.map((a) => ({
        id: a.id,
        title: a.title,
        subtitle: `${a.type === "error" ? "Erreur" : a.type === "warning" ? "Avertissement" : a.type === "success" ? "Succès" : "Info"} · ${a.date}`,
        category: "alerte",
        categoryLabel: "Alertes",
        icon: "bell",
        color: SEARCH_CATEGORIES.alerte.color,
        route: "/alerts",
        _score: scoreResult(q, [a.title, a.message]),
      }));
      addGroup("alerte", alertResults);

      // Messages / Conversations
      const msgResults: ScoredResult[] = data.conversations.map((c) => ({
        id: c.id,
        title: c.participant,
        subtitle: c.lastMessage,
        category: "message",
        categoryLabel: "Messages",
        icon: "message-circle",
        color: SEARCH_CATEGORIES.message.color,
        route: "/chat",
        _score: scoreResult(q, [c.participant, c.lastMessage, c.role]),
      }));
      addGroup("message", msgResults);

      // Produits
      const prodResults: ScoredResult[] = data.products.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: `${p.price} MAD · ${p.seller} · ${p.category}`,
        category: "produit",
        categoryLabel: "Produits",
        icon: "shopping-bag",
        color: SEARCH_CATEGORIES.produit.color,
        route: "/marketplace",
        _score: scoreResult(q, [p.name, p.description, p.seller, p.category]),
      }));
      addGroup("produit", prodResults);

      // Support (admin)
      if (isAdmin) {
        const ticketResults: ScoredResult[] = data.supportTickets.map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: `${t.submittedBy} · ${t.priority === "high" ? "Urgent" : t.priority === "medium" ? "Moyen" : "Faible"} · ${t.status}`,
          category: "ticket",
          categoryLabel: "Support",
          icon: "headphones",
          color: SEARCH_CATEGORIES.ticket.color,
          route: "/support",
          _score: scoreResult(q, [t.title, t.description, t.submittedBy, t.syndicate]),
        }));
        addGroup("ticket", ticketResults);
      }

      // Transactions (admin)
      if (isAdmin) {
        const txResults: ScoredResult[] = data.transactions.map((t) => ({
          id: t.id,
          title: t.label,
          subtitle: `${t.amount} MAD · ${t.date} · ${t.status === "paid" ? "Payé" : t.status === "pending" ? "En attente" : "En retard"}`,
          category: "transaction",
          categoryLabel: "Finance",
          icon: "dollar-sign",
          color: SEARCH_CATEGORIES.transaction.color,
          route: "/finance",
          _score: scoreResult(q, [t.label, t.type, t.member ?? ""]),
        }));
        addGroup("transaction", txResults);
      }

      // Partenaires
      const partnerResults: ScoredResult[] = data.partners.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: `${p.type} · ${p.sector} · ${p.status === "active" ? "Actif" : "Inactif"}`,
        category: "partenaire",
        categoryLabel: "Partenaires",
        icon: "briefcase",
        color: SEARCH_CATEGORIES.partenaire.color,
        route: "/partenaires",
        _score: scoreResult(q, [p.name, p.type, p.sector, p.benefit]),
      }));
      addGroup("partenaire", partnerResults);

      // Cotisations
      const cotisationResults: ScoredResult[] = data.cotisations.map((c) => ({
        id: c.id,
        title: c.label,
        subtitle: `${c.amount} MAD · ${c.period} · ${c.status === "paid" ? "Payé" : c.status === "pending" ? "En attente" : "En retard"}`,
        category: "cotisation",
        categoryLabel: "Cotisations",
        icon: "credit-card",
        color: SEARCH_CATEGORIES.cotisation.color,
        route: "/cotisations",
        _score: scoreResult(q, [c.label, c.period]),
      }));
      addGroup("cotisation", cotisationResults);

      // Commandes
      const orderResults: ScoredResult[] = data.orders.map((o) => ({
        id: o.id,
        title: o.product,
        subtitle: `${o.buyer} → ${o.seller} · ${o.amount} MAD · ${o.status}`,
        category: "commande",
        categoryLabel: "Commandes",
        icon: "package",
        color: SEARCH_CATEGORIES.commande.color,
        route: "/orders",
        _score: scoreResult(q, [o.product, o.buyer, o.seller]),
      }));
      addGroup("commande", orderResults);

      // Navigation
      const navResults: ScoredResult[] = NAVIGATION_ITEMS.map((n) => ({
        id: n.id,
        title: n.title,
        subtitle: n.subtitle,
        category: "navigation",
        categoryLabel: "Navigation",
        icon: n.icon,
        color: SEARCH_CATEGORIES.navigation.color,
        route: n.route,
        _score: scoreResult(q, [n.title, n.subtitle]),
      }));
      addGroup("navigation", navResults);

      // Sort groups by result count (already scored internally)
      groups.sort((a, b) => b.results.length - a.results.length);

      return groups;
    },
    [data, user]
  );

  const [results, setResults] = useState<SearchGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      const r = buildResults(query);
      setResults(r);
      setIsSearching(false);
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, buildResults]);

  const totalCount = results.reduce((s, g) => s + g.results.length, 0);

  return (
    <SearchContext.Provider
      value={{ query, setQuery, results, history, addHistory, removeHistory, clearHistory, isSearching, totalCount }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within SearchProvider");
  return ctx;
}
