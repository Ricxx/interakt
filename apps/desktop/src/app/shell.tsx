import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useMe, useLogout } from "../lib/auth";
import { useMeInvites } from "../lib/sessions";
import { useRequests } from "../lib/requests";
import { useLists } from "../lib/lists";
import { useTasksUnread } from "../lib/tasks";
import { useRecognitionNotify, useSound, useTheme } from "../lib/prefs";
import { useRecognitionUnread } from "../lib/recognition";
import { useNotificationsUnread } from "../lib/notifications";
import { useBroadcastPending } from "../lib/broadcasts";
import { useUrgentCount } from "../lib/suggestions";
import { useReportCount } from "../lib/moderation";
import { useStatsAccess } from "../lib/stats";
import { useBugCount } from "../lib/feedback";
import { trackView } from "../lib/stats";
import { FooterBar } from "../features/footer/footer";
import { useAppLock } from "../features/applock/applock";
import { useUsageAccess } from "../lib/usage";
import { useTenantSettings, applyBrandColor, useTerms } from "../lib/tenant";
import { useOpenProfile } from "../features/profile/overlay";
import { Avatar } from "../ui/avatar";
import { cn } from "../lib/cn";

// The single app frame: sidebar + content area. Every feature page renders inside
// <Outlet/>. Links are grouped into labelled sections so the nav reads as a few
// tidy headings rather than one long flat list.
type Item = { to: string; label: string; end?: boolean; module?: string; badge?: "sessions" | "requests" | "lists" | "tasks" | "recognition" | "notifications" | "broadcasts" | "urgent" | "reports" | "bugs" };
type Section = { heading?: string; adminOnly?: boolean; items: Item[] };

// Grouped into themed, collapsible sections so the (now long) nav stays tidy.
const SECTIONS: Section[] = [
  { items: [{ to: "/", label: "Dashboard", end: true }, { to: "/notifications", label: "Notifications", badge: "notifications" }, { to: "/announcements", label: "Announcements", module: "announcements", badge: "broadcasts" }] },
  {
    heading: "Activities",
    items: [
      { to: "/sessions", label: "Sessions", badge: "sessions" },
      { to: "/quizzes", label: "Quizzes", module: "quizzes" },
      { to: "/tournaments", label: "Tournaments", module: "tournaments" },
      { to: "/scoreboards", label: "Scoreboards", module: "scoreboards" },
      { to: "/recognition", label: "Recognition", module: "recognition", badge: "recognition" },
      { to: "/highlights", label: "Highlights", module: "highlights" },
      { to: "/achievements", label: "Achievements", module: "achievements" },
      { to: "/shop", label: "Shop", module: "shop" },
    ],
  },
  {
    heading: "Resources",
    items: [
      { to: "/boards", label: "Boards", module: "boards" },
      { to: "/repository", label: "Repository", module: "repository" },
      { to: "/lists", label: "Lists", module: "lists", badge: "lists" },
      { to: "/surveys", label: "Surveys", module: "surveys" },
    ],
  },
  {
    heading: "Workplace",
    items: [
      { to: "/tasks", label: "To-do", module: "tasks", badge: "tasks" },
      { to: "/events", label: "Events", module: "events" },
      { to: "/calendar", label: "Calendar", module: "calendar" },
      { to: "/wellness", label: "Wellness", module: "wellness" },
      { to: "/directory", label: "Directory", module: "directory" },
      { to: "/suggestions", label: "Suggestions", module: "suggestions", badge: "urgent" },
      { to: "/actions", label: "You said → We did", module: "actions" },
      { to: "/requests", label: "Requests", badge: "requests" },
    ],
  },
  {
    heading: "People",
    adminOnly: true,
    items: [
      { to: "/members", label: "Members" },
      { to: "/groups", label: "Groups" },
      { to: "/permissions", label: "Permissions" },
    ],
  },
  { adminOnly: true, items: [{ to: "/settings", label: "Settings" }] },
];

const ROLE_LABEL: Record<string, string> = {
  TENANT_ADMIN: "Administrator",
  NODE_ADMIN: "Node admin",
  FACILITATOR: "Facilitator",
  MEMBER: "Member",
};

export function Shell() {
  const { data: me } = useMe();
  const logout = useLogout();
  const openProfile = useOpenProfile();
  const isAdmin = me?.role === "TENANT_ADMIN";

  // Badge counts: sessions you've been invited to but haven't joined, and approval
  // requests that are still waiting on your vote.
  const { data: invites } = useMeInvites();
  const { data: requests } = useRequests();
  const { data: lists } = useLists();
  const { data: tasksUnread } = useTasksUnread();
  const theme = useTheme();
  const sound = useSound();
  const recogNotify = useRecognitionNotify();
  const { data: recogUnread } = useRecognitionUnread(recogNotify.on);
  const { data: notifUnread } = useNotificationsUnread();
  const { data: broadcastPending } = useBroadcastPending();
  const { data: urgentCount } = useUrgentCount();
  const { data: reportCount } = useReportCount();
  const { data: bugCount } = useBugCount();
  const { data: statsAccess } = useStatsAccess();
  const term = useTerms();
  const lock = useAppLock();
  // Per-org vocabulary for the most prominent nav labels.
  const navLabel = (item: Item) => item.to === "/sessions" ? term("sessionPlural", true) : item.to === "/recognition" ? term("recognition", true) : item.label;

  // Track which area (and specific item, when the route carries an id) the user is viewing — powers
  // the statistics reach numbers. Fires once per distinct path so a list↔detail counts as two views.
  const location = useLocation();
  const lastPath = useRef("");
  useEffect(() => {
    if (location.pathname === lastPath.current) return;
    lastPath.current = location.pathname;
    const [, surface, second] = location.pathname.split("/");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(second ?? "");
    trackView(surface || "dashboard", isUuid ? second : undefined);
  }, [location.pathname]);
  const { data: tenantSettings } = useTenantSettings();
  const showPics = tenantSettings?.profilePicsEnabled !== false;
  // Paint the workspace's accent across the app once settings load (and whenever it changes).
  useEffect(() => { if (tenantSettings?.brandColor) applyBrandColor(tenantSettings.brandColor); }, [tenantSettings?.brandColor]);
  const counts = {
    sessions: (invites?.invites ?? []).filter((i) => i.myState === "INVITED").length,
    requests: (requests?.queue ?? []).filter((r) => r.status === "PENDING" && !r.iApproved).length,
    lists: (lists?.lists ?? []).filter((l) => l.unread).length,
    tasks: tasksUnread?.count ?? 0,
    recognition: recogNotify.on ? recogUnread?.count ?? 0 : 0,
    notifications: notifUnread?.count ?? 0,
    broadcasts: broadcastPending?.count ?? 0,
    urgent: urgentCount?.count ?? 0,
    reports: reportCount?.count ?? 0,
    bugs: bugCount?.count ?? 0,
  };

  // Usage log is shown only to people who can actually view it (admins + managers with the
  // capability) and only when the workspace has it turned on — so it never advertises itself.
  const usageAccess = useUsageAccess();
  // Hide feature areas the workspace has switched off (declutter), then drop any section left empty.
  const disabled = new Set(tenantSettings?.disabledModules ?? []);
  const sections = SECTIONS
    .filter((s) => !s.adminOnly || isAdmin)
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.module || !disabled.has(it.module)) }))
    .filter((s) => s.items.length > 0);
  const oversight: Item[] = [];
  if (statsAccess?.canView) oversight.push({ to: "/statistics", label: "Statistics" });
  if (reportCount?.canModerate) oversight.push({ to: "/moderation", label: "Moderation", badge: "reports" });
  if (bugCount?.canView) oversight.push({ to: "/feedback", label: "Feedback", badge: "bugs" });
  if (usageAccess.data?.canView && usageAccess.data?.enabled) oversight.push({ to: "/usage", label: "Usage" });
  if (oversight.length) sections.push({ heading: "Oversight", items: oversight });

  const [collapsed, setCollapsed] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem("ces-nav-collapsed") ?? "[]")); } catch { return new Set(); } });
  const toggleSection = (h: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(h)) n.delete(h); else n.add(h); localStorage.setItem("ces-nav-collapsed", JSON.stringify([...n])); return n; });
  const sectionBadge = (s: Section) => s.items.reduce((sum, it) => sum + (it.badge ? counts[it.badge] : 0), 0);

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-4 text-lg font-semibold">
          {tenantSettings?.brandLogoUrl ? (
            <img src={tenantSettings.brandLogoUrl} alt={tenantSettings?.name || "CES"} className="max-h-8 max-w-[180px] object-contain" />
          ) : (
            <>
              {tenantSettings?.brandEmoji && <span>{tenantSettings.brandEmoji}</span>}
              <span className="truncate">{tenantSettings?.name || "CES"}</span>
            </>
          )}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {sections.map((section, i) => {
            const isCollapsed = !!section.heading && collapsed.has(section.heading);
            const hiddenBadge = isCollapsed ? sectionBadge(section) : 0;
            return (
              <div key={section.heading ?? `s${i}`} className="space-y-1">
                {section.heading && (
                  <button onClick={() => toggleSection(section.heading!)} className="flex w-full items-center gap-1 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted/70 hover:text-muted">
                    <span className={cn("transition-transform", isCollapsed ? "" : "rotate-90")}>›</span>
                    <span>{section.heading}</span>
                    {hiddenBadge > 0 && <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-fg">{hiddenBadge}</span>}
                  </button>
                )}
                {!isCollapsed && (
                  // Items of an expandable section are slightly indented (with a faint guide line) so
                  // they read clearly as the children of that heading.
                  <div className={cn("space-y-1", section.heading && "ml-3 border-l border-border/70 pl-2")}>
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium",
                            isActive ? "bg-primary/10 text-primary" : "text-muted hover:bg-border/60",
                          )
                        }
                      >
                        <span>{navLabel(item)}</span>
                        {item.badge && counts[item.badge] > 0 && (
                          <span className={cn("ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold", item.badge === "urgent" ? "bg-rose-600 text-white" : "bg-primary text-primary-fg")}>
                            {counts[item.badge]}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          {/* The whole name row is its own clickable block — opening your profile — so the
              action buttons below never squeeze the name. */}
          <button
            onClick={() => me && openProfile(me.id)}
            className="flex w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-border/60"
            title="View your profile"
          >
            <Avatar name={me?.displayName ?? "?"} url={showPics ? me?.avatarUrl : null} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-fg">{me?.flair ? `${me.flair} ` : ""}{me?.displayName}</div>
              <div className="truncate text-xs text-muted">{ROLE_LABEL[me?.role ?? ""] ?? me?.role}</div>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button title={sound.on ? "Sounds on" : "Sounds off"} aria-label="Toggle sounds" onClick={sound.toggle} className="rounded-md p-2 text-muted hover:bg-border/60 hover:text-fg">
              {sound.on ? "🔊" : "🔇"}
            </button>
            <button title={recogNotify.on ? "Recognition alerts on" : "Recognition alerts off"} aria-label="Toggle recognition alerts" onClick={recogNotify.toggle} className="rounded-md p-2 text-muted hover:bg-border/60 hover:text-fg">
              {recogNotify.on ? "🔔" : "🔕"}
            </button>
            <button title={theme.dark ? "Switch to light" : "Switch to dark"} aria-label="Toggle theme" onClick={theme.toggle} className="rounded-md p-2 text-muted hover:bg-border/60 hover:text-fg">
              {theme.dark ? "☀️" : "🌙"}
            </button>
            <button title="App lock (PIN)" aria-label="App lock" onClick={() => (lock.pinSet ? lock.lock() : lock.openManager())} onContextMenu={(e) => { e.preventDefault(); lock.openManager(); }} className="rounded-md p-2 text-muted hover:bg-border/60 hover:text-fg">🔒</button>
            <button title="Sign out" aria-label="Sign out" onClick={() => logout.mutate()} className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-2 text-xs text-muted hover:bg-border/60 hover:text-fg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
          <FooterBar />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
