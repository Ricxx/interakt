import { createContext, useContext, useState, type ReactNode } from "react";
import { useProfile } from "../../lib/profile";
import { badgeOf } from "../../lib/recognition";
import { timeAgo } from "../../lib/tasks";

// A profile overlay reachable from anywhere: any name can call openProfile(userId). This is the
// home for future profile customization (awards, trinkets, achievements from a marketplace).
const Ctx = createContext<(userId: string) => void>(() => {});
export const useOpenProfile = () => useContext(Ctx);

const ROLE_LABEL: Record<string, string> = { TENANT_ADMIN: "Administrator", NODE_ADMIN: "Node admin", FACILITATOR: "Facilitator", MEMBER: "Member" };

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return (
    <Ctx.Provider value={setId}>
      {children}
      {id && <ProfileOverlay id={id} onClose={() => setId(null)} />}
    </Ctx.Provider>
  );
}

function ProfileOverlay({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: p, isLoading } = useProfile(id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        {isLoading || !p ? (
          <div className="p-6 text-sm text-muted">Loading…</div>
        ) : (
          <>
            <div className="flex items-start gap-4 bg-gradient-to-br from-primary/15 to-transparent p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xl font-semibold text-primary">{p.name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-fg">{p.name}</div>
                <div className="text-sm text-muted">{[p.jobTitle, p.dept].filter(Boolean).join(" · ") || ROLE_LABEL[p.role] || p.role}</div>
                <div className="mt-2 flex gap-3 text-xs text-muted">
                  <span><span className="font-semibold text-fg">{p.totalReceived}</span> recognitions</span>
                  <span><span className="font-semibold text-fg">{p.totalStars}</span> ⭐ stars</span>
                </div>
              </div>
              <button onClick={onClose} className="shrink-0 text-muted hover:text-fg" aria-label="Close">✕</button>
            </div>
            <div className="p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">Recognition received</h3>
              {p.received.length === 0 ? (
                <p className="text-sm text-muted">No recognition yet.</p>
              ) : (
                <div className="space-y-2">
                  {p.received.map((r) => {
                    const b = badgeOf(r.badge);
                    return (
                      <div key={r.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
                        <span className="text-lg">{r.kind === "AWARD" ? "🏆" : b.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted">from {r.fromName} · {r.scope} · {timeAgo(r.createdAt)}{r.likes > 0 ? ` · ${r.likes} ⭐` : ""}</div>
                          <p className="text-sm text-fg">{r.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-center text-xs text-muted/60">Profile customization & achievements coming soon.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
