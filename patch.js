const fs = require('fs');

let content = fs.readFileSync('artifacts/mobile/app/(tabs)/index.tsx', 'utf8');

// Insert early return for Super Admin
const target = `const isAdmin = isSuperAdmin || isSyndicateAdmin;`;
if (content.includes(target) && !content.includes('if (isSuperAdmin) { return <SuperAdminDashboard />; }')) {
  content = content.replace(target, target + '\n\n  if (isSuperAdmin) { return <SuperAdminDashboard />; }');
}

// Append new code
if (!content.includes('function SuperAdminDashboard')) {
  content += `

// ─── SUPER ADMIN DASHBOARD (Enterprise SaaS) ──────────────────────────────

function formatNum(n: number) {
  if (n == null) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, "") + "k";
  return n.toString();
}

function formatMoney(n: number) {
  if (n == null) return "0 MAD";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, "") + "k MAD";
  return n.toFixed(0) + " MAD";
}

function formatRelativeTime(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return \`il y a \${Math.max(1, m)}m\`;
  const h = Math.floor(m / 60);
  if (h < 24) return \`il y a \${h}h\`;
  const d = Math.floor(h / 24);
  return \`il y a \${d}j\`;
}

function Skeleton({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true })
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View style={{ backgroundColor: colors.muted, borderRadius: r, width: w as any, height: h, opacity: anim }} />
  );
}

function KPIBox({ label, value, accent, colors }: any) {
  return (
    <View style={[SA_styles.kpiBox, { backgroundColor: accent + "10", borderLeftColor: accent }]}>
      <Text style={[SA_styles.kpiValue, { color: colors.foreground }]}>{formatNum(value)}</Text>
      <Text style={[SA_styles.kpiLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function RevBox({ label, value, color, colors }: any) {
  return (
    <View style={SA_styles.revBox}>
      <Text style={[SA_styles.revValue, { color }]}>{formatMoney(value)}</Text>
      <Text style={[SA_styles.revLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function OverviewTab({ loading, platformStats, syndicateStats, financeSummary, auditLogs, colors }: any) {
  const healthyCount = syndicateStats.filter((s: any) => s.status === "healthy").length;
  const warningCount = syndicateStats.filter((s: any) => s.status === "warning").length;
  const criticalCount = syndicateStats.filter((s: any) => s.status === "critical").length;
  const totalSyndicates = healthyCount + warningCount + criticalCount || 1;

  const healthyPct = (healthyCount / totalSyndicates) * 100;
  const warningPct = (warningCount / totalSyndicates) * 100;
  const criticalPct = (criticalCount / totalSyndicates) * 100;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={SA_styles.scrollContent} showsVerticalScrollIndicator={false}>
      
      {/* SECTION A: KPI Strip */}
      <View style={SA_styles.section}>
        <View style={SA_styles.kpiGrid}>
          {loading ? (
            <>
               <Skeleton w="48%" h={80} r={8} />
               <Skeleton w="48%" h={80} r={8} />
               <Skeleton w="48%" h={80} r={8} />
               <Skeleton w="48%" h={80} r={8} />
            </>
          ) : (
            <>
              <KPIBox label="Total Syndicats" value={platformStats?.totalSyndicates || 0} accent="#7c3aed" colors={colors} />
              <KPIBox label="Syndicats Actifs" value={platformStats?.activeSyndicates || 0} accent="#10b981" colors={colors} />
              <KPIBox label="Total Membres" value={platformStats?.totalMembers || 0} accent="#3b82f6" colors={colors} />
              <KPIBox label="Tickets Ouverts" value={platformStats?.openTickets || 0} accent="#ef4444" colors={colors} />
            </>
          )}
        </View>
      </View>

      {/* SECTION B: Platform Health */}
      <View style={SA_styles.section}>
        <Text style={[SA_styles.sectionTitle, { color: colors.mutedForeground }]}>SANTÉ DE LA PLATEFORME</Text>
        {loading ? (
          <Skeleton w="100%" h={24} r={12} />
        ) : (
          <TouchableOpacity style={SA_styles.healthContainer} onPress={() => router.push("/tableau-national" as any)} activeOpacity={0.8}>
             <View style={SA_styles.healthBar}>
               {healthyPct > 0 && <View style={[SA_styles.healthSegment, { width: \`\${healthyPct}%\`, backgroundColor: "#10b981" }]}><Text style={SA_styles.healthSegmentText}>{healthyPct > 10 ? \`\${Math.round(healthyPct)}%\` : ""}</Text></View>}
               {warningPct > 0 && <View style={[SA_styles.healthSegment, { width: \`\${warningPct}%\`, backgroundColor: "#f59e0b" }]}><Text style={SA_styles.healthSegmentText}>{warningPct > 10 ? \`\${Math.round(warningPct)}%\` : ""}</Text></View>}
               {criticalPct > 0 && <View style={[SA_styles.healthSegment, { width: \`\${criticalPct}%\`, backgroundColor: "#ef4444" }]}><Text style={SA_styles.healthSegmentText}>{criticalPct > 10 ? \`\${Math.round(criticalPct)}%\` : ""}</Text></View>}
             </View>
             <View style={SA_styles.healthLegend}>
               <Text style={[SA_styles.legendText, { color: "#10b981" }]}>{healthyCount} Sains</Text>
               <Text style={[SA_styles.legendText, { color: colors.mutedForeground }]}>·</Text>
               <Text style={[SA_styles.legendText, { color: "#f59e0b" }]}>{warningCount} Attention</Text>
               <Text style={[SA_styles.legendText, { color: colors.mutedForeground }]}>·</Text>
               <Text style={[SA_styles.legendText, { color: "#ef4444" }]}>{criticalCount} Critiques</Text>
             </View>
          </TouchableOpacity>
        )}
      </View>

      {/* SECTION C: Revenue Strip */}
      <View style={SA_styles.section}>
        <Text style={[SA_styles.sectionTitle, { color: colors.mutedForeground }]}>FINANCES</Text>
        <View style={SA_styles.revenueStrip}>
          {loading ? (
            <>
              <Skeleton w="30%" h={40} />
              <Skeleton w="30%" h={40} />
              <Skeleton w="30%" h={40} />
            </>
          ) : (
            <>
              <RevBox label="Revenus" value={financeSummary?.totalRevenue || 0} color="#10b981" colors={colors} />
              <RevBox label="Dépenses" value={financeSummary?.totalExpenses || 0} color="#ef4444" colors={colors} />
              <RevBox label="Solde Net" value={(financeSummary?.totalRevenue || 0) - (financeSummary?.totalExpenses || 0)} color={colors.primary} colors={colors} />
            </>
          )}
        </View>
      </View>

      {/* SECTION D: Syndicats List */}
      <View style={SA_styles.section}>
         <Text style={[SA_styles.sectionTitle, { color: colors.mutedForeground }]}>TOP 5 SYNDICATS</Text>
         <View style={SA_styles.listContainer}>
           {loading ? (
             [1,2,3,4,5].map(i => (
               <View key={i} style={[SA_styles.listRow, { borderBottomColor: colors.border }]}>
                 <Skeleton w={32} h={32} r={16} />
                 <View style={{ flex: 1, marginLeft: 12, gap: 4 }}>
                   <Skeleton w={120} h={14} />
                   <Skeleton w={80} h={12} />
                 </View>
               </View>
             ))
           ) : (
             <>
               {[...syndicateStats].sort((a: any, b: any) => b.members - a.members).slice(0,5).map((syn: any) => (
                 <View key={syn.id} style={[SA_styles.listRow, { borderBottomColor: colors.border }]}>
                   <View style={[SA_styles.synInitials, { backgroundColor: colors.muted }]}>
                     <Text style={[SA_styles.synInitialsText, { color: colors.foreground }]}>{syn.name.substring(0,2).toUpperCase()}</Text>
                   </View>
                   <View style={SA_styles.synInfo}>
                     <Text style={[SA_styles.synName, { color: colors.foreground }]} numberOfLines={1}>{syn.name}</Text>
                     <Text style={[SA_styles.synSub, { color: colors.mutedForeground }]}>{syn.sector} · {syn.region}</Text>
                   </View>
                   <View style={SA_styles.synRight}>
                     <Text style={[SA_styles.synMembers, { color: colors.foreground }]}>{syn.members} mb</Text>
                     <View style={[SA_styles.healthDot, { backgroundColor: syn.status === "healthy" ? "#10b981" : syn.status === "warning" ? "#f59e0b" : "#ef4444" }]} />
                   </View>
                 </View>
               ))}
               <TouchableOpacity style={SA_styles.footerLink} onPress={() => router.push("/members" as any)}>
                 <Text style={[SA_styles.footerLinkText, { color: colors.primary }]}>Voir tous →</Text>
               </TouchableOpacity>
             </>
           )}
         </View>
      </View>

      {/* SECTION E: Activity Timeline */}
      <View style={SA_styles.section}>
         <Text style={[SA_styles.sectionTitle, { color: colors.mutedForeground }]}>JOURNAL D'ACTIVITÉ</Text>
         <View style={SA_styles.timelineContainer}>
           {loading ? (
             [1,2,3,4].map(i => (
               <View key={i} style={SA_styles.timelineRow}>
                 <Skeleton w={32} h={32} r={16} />
                 <View style={{ flex: 1, gap: 4 }}>
                   <Skeleton w={140} h={14} />
                   <Skeleton w={100} h={12} />
                 </View>
               </View>
             ))
           ) : (
             <>
               {auditLogs.slice(0, 8).map((log: any, i: number) => {
                 let iconName = "activity";
                 const e = log.entity ? log.entity.toLowerCase() : "";
                 if (e.includes("member") || e.includes("user")) iconName = "users";
                 else if (e.includes("syndicate")) iconName = "briefcase";
                 else if (e.includes("auth")) iconName = "shield";
                 else if (e.includes("budget") || e.includes("transaction")) iconName = "dollar-sign";
                 else if (e.includes("document")) iconName = "file-text";
                 else if (e.includes("travaux")) iconName = "tool";
                 else if (e.includes("election")) iconName = "check-square";

                 return (
                   <View key={log.id || i} style={SA_styles.timelineRow}>
                     <View style={[SA_styles.timelineIcon, { backgroundColor: colors.muted }]}>
                       <Feather name={iconName as any} size={14} color={colors.foreground} />
                     </View>
                     <View style={SA_styles.timelineInfo}>
                       <Text style={[SA_styles.timelineAction, { color: colors.foreground }]} numberOfLines={1}>{log.action}</Text>
                       <Text style={[SA_styles.timelineSub, { color: colors.mutedForeground }]}>{log.entity} · {formatRelativeTime(log.createdAt)}</Text>
                     </View>
                   </View>
                 );
               })}
               <TouchableOpacity style={SA_styles.footerLink} onPress={() => router.push("/journal-audit" as any)}>
                 <Text style={[SA_styles.footerLinkText, { color: colors.primary }]}>Voir tout →</Text>
               </TouchableOpacity>
             </>
           )}
         </View>
      </View>
    </ScrollView>
  );
}

function SupportTab({ tickets, colors }: any) {
  const sorted = [...tickets].sort((a, b) => {
    if (a.priority === "high" && b.priority !== "high") return -1;
    if (a.priority !== "high" && b.priority === "high") return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={SA_styles.scrollContent} showsVerticalScrollIndicator={false}>
      {sorted.length === 0 ? (
         <View style={{ alignItems: "center", paddingTop: 40 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Aucun ticket ouvert</Text>
         </View>
      ) : (
         sorted.map(t => (
           <View key={t.id} style={[SA_styles.ticketRow, { backgroundColor: colors.card, borderLeftColor: t.priority === "high" ? "#ef4444" : "transparent" }]}>
             <View style={{ flex: 1 }}>
               <Text style={[SA_styles.ticketTitle, { color: colors.foreground }]} numberOfLines={1}>{t.title}</Text>
               <Text style={[SA_styles.ticketSub, { color: colors.mutedForeground }]}>{t.syndicate} · {new Date(t.date).toLocaleDateString("fr-FR")}</Text>
             </View>
             <View style={[SA_styles.badge, { backgroundColor: t.status === "open" ? "#f59e0b20" : colors.muted }]}>
               <Text style={[SA_styles.badgeText, { color: t.status === "open" ? "#f59e0b" : colors.mutedForeground }]}>{t.status}</Text>
             </View>
           </View>
         ))
      )}
      <TouchableOpacity style={[SA_styles.supportBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/support" as any)}>
         <Text style={SA_styles.supportBtnText}>Aller au support →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export function SuperAdminDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { supportTickets } = useData();
  const { isWide } = useBreakpoints();

  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<any>(null);
  const [syndicateStats, setSyndicateStats] = useState<any[]>([]);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<"overview" | "support">("overview");

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        const [pStats, synStats, finSum, aLogs] = await Promise.all([
          api.statistics.platform(),
          api.statistics.syndicates(),
          api.statistics.financeSummary(),
          api.audit.getLogs(),
        ]);
        
        if (cancelled) return;
        
        setPlatformStats(pStats.data);
        setSyndicateStats(synStats.data || []);
        setFinanceSummary(finSum.data);
        setAuditLogs(aLogs.data || []);
      } catch (err) {
        console.error("Failed to load super admin data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const topPadding = isWide ? 0 : Math.max(insets.top, 20);
  const openTicketsCount = supportTickets.filter(t => t.status === "open").length;

  return (
    <View style={[SA_styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[SA_styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: topPadding }]}>
        <View style={SA_styles.headerLeft}>
          <Text style={[SA_styles.headerLogo, { color: colors.primary }]}>MIZAN</Text>
          <Text style={[SA_styles.headerSubtitle, { color: colors.mutedForeground }]}>Platform Admin</Text>
        </View>
        <View style={SA_styles.headerRight}>
          <TouchableOpacity style={SA_styles.headerBtn} onPress={() => router.push("/notifications" as any)}>
            <Feather name="bell" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={[SA_styles.avatar, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[SA_styles.avatarText, { color: colors.primary }]}>
              {user?.name?.substring(0,2).toUpperCase() || "SA"}
            </Text>
          </View>
        </View>
      </View>

      {/* TABS */}
      <View style={[SA_styles.tabStrip, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[SA_styles.tabPill, activeTab === "overview" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("overview")}
          activeOpacity={0.8}
        >
          <Text style={[SA_styles.tabText, activeTab === "overview" ? { color: "#fff" } : { color: colors.mutedForeground }]}>
            Vue d'ensemble
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[SA_styles.tabPill, activeTab === "support" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("support")}
          activeOpacity={0.8}
        >
          <Text style={[SA_styles.tabText, activeTab === "support" ? { color: "#fff" } : { color: colors.mutedForeground }]}>
            Tickets Support
          </Text>
          {openTicketsCount > 0 && (
            <View style={SA_styles.tabBadge}>
              <Text style={SA_styles.tabBadgeText}>{openTicketsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      {activeTab === "overview" ? (
         <OverviewTab loading={loading} platformStats={platformStats} syndicateStats={syndicateStats} financeSummary={financeSummary} auditLogs={auditLogs} colors={colors} />
      ) : (
         <SupportTab tickets={supportTickets} colors={colors} />
      )}
    </View>
  );
}

const SA_styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { gap: 2 },
  headerLogo: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 10, fontFamily: "Inter_500Medium" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerBtn: { padding: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  tabStrip: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8, gap: 10, borderBottomWidth: 0 },
  tabPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabBadge: { backgroundColor: "#ef4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_700Bold" },

  scrollContent: { padding: 16, gap: 28, paddingBottom: 40 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  kpiBox: { width: "48%", padding: 14, borderRadius: 10, borderLeftWidth: 4, paddingVertical: 18 },
  kpiValue: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -1, marginBottom: 4 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },

  healthContainer: { gap: 10 },
  healthBar: { height: 24, flexDirection: "row", borderRadius: 12, overflow: "hidden" },
  healthSegment: { height: "100%", alignItems: "center", justifyContent: "center" },
  healthSegmentText: { fontSize: 10, color: "#fff", fontFamily: "Inter_600SemiBold" },
  healthLegend: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  legendText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  revenueStrip: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  revBox: { width: "32%", alignItems: "flex-start", gap: 4 },
  revValue: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  revLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },

  listContainer: { gap: 0 },
  listRow: { flexDirection: "row", alignItems: "center", height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  synInitials: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  synInitialsText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  synInfo: { flex: 1, marginLeft: 12, gap: 2 },
  synName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  synSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  synRight: { alignItems: "flex-end", gap: 4, flexDirection: "row" },
  synMembers: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  healthDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  
  timelineContainer: { gap: 16, paddingLeft: 4, marginTop: 4 },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  timelineIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  timelineInfo: { flex: 1, gap: 2 },
  timelineAction: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  timelineSub: { fontSize: 11, fontFamily: "Inter_400Regular" },

  footerLink: { marginTop: 16, alignSelf: "flex-start", paddingVertical: 4 },
  footerLinkText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  ticketRow: { flexDirection: "row", alignItems: "center", padding: 16, marginBottom: 12, borderRadius: 12, borderLeftWidth: 3 },
  ticketTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  ticketSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  supportBtn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 16 },
  supportBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
`;
}

fs.writeFileSync('artifacts/mobile/app/(tabs)/index.tsx', content);
