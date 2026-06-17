import { NavLink, Outlet } from "react-router-dom";
import { useMe, useLogout } from "../lib/auth";
import { useMeInvites } from "../lib/sessions";
import { useRequests } from "../lib/requests";
import { useLists } from "../lib/lists";
import { cn } from "../lib/cn";

// The single app frame: sidebar + content area. Every feature page renders inside
// <Outlet/>. Links are grouped into labelled sections so the nav reads as a few
// tidy headings rather than one long flat list.
type Item = { to: string; label: string; end?: boolean; badge?: "sessions" | "requests" | "lists" };
type Section = { heading?: string; adminOnly?: boolean; items: Item[] };

const SECTIONS: Section[] = [
  { items: [{ to: "/", label: "Dashboard", end: true }] },
  {
    heading: "Engage",
    items: [
      { to: "/sessions", label: "Sessions", badge: "sessions" },
      { to: "/boards", label: "Boards" },
      { to: "/repository", label: "Repository" },
      { to: "/lists", label: "Lists", badge: "lists" },
      { to: "/tasks", label: "To-do" },
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
  const isAdmin = me?.role === "TENANT_ADMIN";

  // Badge counts: sessions you've been invited to but haven't joined, and approval
  // requests that are still waiting on your vote.
  const { data: invites } = useMeInvites();
  const { data: requests } = useRequests();
  const { data: lists } = useLists();
  const counts = {
    sessions: (invites?.invites ?? []).filter((i) => i.myState === "INVITED").length,
    requests: (requests?.queue ?? []).filter((r) => r.status === "PENDING" && !r.iApproved).length,
    lists: (lists?.lists ?? []).filter((l) => l.unread).length,
  };

  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-surface">
        <div className="px-5 py-4 text-lg font-semibold">CES</div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {sections.map((section, i) => (
            <div key={section.heading ?? `s${i}`} className="space-y-1">
              {section.heading && (
                <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">{section.heading}</div>
              )}
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
                  <span>{item.label}</span>
                  {item.badge && counts[item.badge] > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-fg">
                      {counts[item.badge]}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(me?.displayName ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-fg">{me?.displayName}</div>
              <div className="truncate text-xs text-muted">{ROLE_LABEL[me?.role ?? ""] ?? me?.role}</div>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              onClick={() => logout.mutate()}
              className="shrink-0 rounded-md p-2 text-muted hover:bg-border/60 hover:text-fg"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
