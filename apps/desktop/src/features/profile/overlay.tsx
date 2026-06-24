import { createContext, useContext, useState, type ReactNode } from "react";
import { NAME_COLORS, useMyAugments, useProfile, useUpdateMyProfile } from "../../lib/profile";
import { useGiftPoints, usePoints, useAdminStreak, useAdminProtectDay } from "../../lib/points";
import { useTenantSettings } from "../../lib/tenant";
import { badgeOf } from "../../lib/recognition";
import { timeAgo } from "../../lib/tasks";
import { uploadImage } from "../../lib/upload";
import { Avatar } from "../../ui/avatar";
import { Button } from "../../ui/button";

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

// Subject-access export: pull your linked data and save it as a JSON file (the "right of access").
async function downloadMyData() {
  const res = await fetch("/api/me/export", { credentials: "include" });
  if (!res.ok) return;
  const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "my-ces-data.json"; a.click();
  URL.revokeObjectURL(url);
}

function ProfileOverlay({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: p, isLoading, isError, refetch } = useProfile(id);
  const { data: settings } = useTenantSettings();
  const [editing, setEditing] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        {isError ? (
          <div className="space-y-3 p-6 text-sm">
            <p className="text-fg">Couldn't load this profile.</p>
            <div className="flex gap-2">
              <button onClick={() => refetch()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg">Try again</button>
              <button onClick={onClose} className="text-xs text-muted hover:underline">Close</button>
            </div>
          </div>
        ) : isLoading || !p ? (
          <div className="p-6 text-sm text-muted">Loading…</div>
        ) : (
          <>
            <div className="flex items-start gap-4 bg-gradient-to-br from-primary/15 to-transparent p-5">
              <Avatar name={p.name} url={p.avatarUrl} size={56} ring={p.nameColor ? NAME_COLORS[p.nameColor] : null} />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-fg" style={{ color: p.nameColor ? NAME_COLORS[p.nameColor] : undefined }}>{p.flair ? `${p.flair} ` : ""}{p.name}</div>
                {p.title && <div className="text-xs font-medium" style={{ color: p.nameColor ? NAME_COLORS[p.nameColor] : undefined }}>{p.title}</div>}
                <div className="text-sm text-muted">{[p.jobTitle, p.dept].filter(Boolean).join(" · ") || ROLE_LABEL[p.role] || p.role}</div>
                {p.statusText && <div className="mt-0.5 text-sm italic text-fg">“{p.statusText}”</div>}
                <div className="mt-2 flex gap-3 text-xs text-muted">
                  <span><span className="font-semibold text-fg">{p.totalReceived}</span> big-ups</span>
                  <span><span className="font-semibold text-fg">{p.totalStars}</span> ⭐ stars</span>
                  {p.streak > 0 && <span><span className="font-semibold text-fg">🔥 {p.streak}</span>-day streak</span>}
                  {p.isMe && <button onClick={() => setEditing((e) => !e)} className="text-primary hover:underline">Edit profile</button>}
                  {p.isMe && <button onClick={downloadMyData} className="text-muted hover:text-fg hover:underline">Download my data</button>}
                </div>
              </div>
              <button onClick={onClose} className="shrink-0 text-muted hover:text-fg" aria-label="Close">✕</button>
            </div>
            {editing && p.isMe && <EditProfile statusText={p.statusText} hobbies={p.hobbies} highSchool={p.highSchool} avatarUrl={p.avatarUrl} flair={p.flair} title={p.title} nameColor={p.nameColor} picsEnabled={settings?.profilePicsEnabled !== false} onDone={() => setEditing(false)} />}
            <div className="p-5">
              {(p.hobbies || p.highSchool) && (
                <div className="mb-4 space-y-1 text-sm">
                  {p.hobbies && <div><span className="text-muted">Hobbies &amp; interests: </span><span className="text-fg">{p.hobbies}</span></div>}
                  {p.highSchool && <div><span className="text-muted">High school: </span><span className="text-fg">{p.highSchool}</span></div>}
                </div>
              )}
              {!p.isMe && <GiftPoints toUserId={p.id} toName={p.name} />}
              {!p.isMe && <StreakFix userId={p.id} name={p.name} />}
              {p.achievements.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">Achievements</h3>
                  <div className="flex flex-wrap gap-1.5">{p.achievements.map((a, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{a.icon ?? "🏅"} {a.name}</span>)}</div>
                </div>
              )}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">Big-ups &amp; awards received</h3>
              {p.received.length === 0 ? (
                <p className="text-sm text-muted">No big-ups yet.</p>
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
              <p className="mt-4 text-center text-xs text-muted/60">Achievements coming soon.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Admin-only streak fix-up. The data fetch 403s for anyone without reward.manage, so the whole
// control simply doesn't render for non-managers — no separate role check needed.
function StreakFix({ userId, name }: { userId: string; name: string }) {
  const { data, isError } = useAdminStreak(userId, true);
  const protect = useAdminProtectDay(userId);
  const [day, setDay] = useState("");
  if (isError || !data) return null;
  const firstName = name.split(" ")[0];
  return (
    <div className="mb-4 rounded-lg border border-border p-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted/70">Streak fix-up</h3>
      <p className="mb-2 text-sm text-fg">🔥 {data.streak}-day streak{data.checkedInToday ? " · checked in today" : ""}</p>
      <p className="mb-2 text-xs text-muted">Was {firstName} genuinely away on a day they missed? Protect it so their streak holds.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-sm" />
        <Button variant="subtle" disabled={!day || protect.isPending} onClick={() => protect.mutate({ day, on: true }, { onSuccess: () => setDay("") })}>Protect day</Button>
      </div>
      {data.leaveDays.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.leaveDays.map((d) => (
            <button key={d} onClick={() => protect.mutate({ day: d, on: false })} className="inline-flex items-center gap-1 rounded-full bg-border px-2 py-0.5 text-xs text-muted hover:text-rose-600" title="Remove protection">{d} ✕</button>
          ))}
        </div>
      )}
    </div>
  );
}

function GiftPoints({ toUserId, toName }: { toUserId: string; toName: string }) {
  const { data: pts } = usePoints();
  const gift = useGiftPoints();
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(0);
  const bal = pts?.balance ?? 0;
  if (sent) return <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50/50 p-2 text-xs text-emerald-700">🎁 Sent {sent} pts to {toName}!</div>;
  return (
    <div className="mb-4 rounded-lg border border-border p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-semibold text-muted">🎁 Send {toName} some points</span><span className="text-muted">you have {bal}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min={1} max={bal} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="note (optional)" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
        <button onClick={() => gift.mutate({ toUserId, amount, note: note.trim() || undefined }, { onSuccess: () => setSent(amount) })} disabled={amount < 1 || amount > bal || gift.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40">Send</button>
      </div>
      {bal === 0 && <p className="mt-1 text-[11px] text-muted">Earn points (check-ins, lottery, achievements) to send some.</p>}
    </div>
  );
}

function Slot({ label, items, value, onPick, render }: { label: string; items: string[]; value: string; onPick: (v: string) => void; render: (v: string) => ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label} (from the shop)</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onPick("")} className={`rounded-lg border px-2 py-1 text-sm ${value === "" ? "border-primary bg-primary/10" : "border-border"}`}>none</button>
        {items.map((it) => <button key={it} onClick={() => onPick(it)} className={`rounded-lg border px-2 py-1 text-sm ${value === it ? "border-primary bg-primary/10" : "border-border"}`}>{render(it)}</button>)}
      </div>
    </div>
  );
}

function EditProfile({ statusText, hobbies, highSchool, avatarUrl, flair, title, nameColor, picsEnabled, onDone }: { statusText: string | null; hobbies: string | null; highSchool: string | null; avatarUrl: string | null; flair: string | null; title: string | null; nameColor: string | null; picsEnabled: boolean; onDone: () => void }) {
  const update = useUpdateMyProfile();
  const { data: aug } = useMyAugments();
  const [status, setStatus] = useState(statusText ?? "");
  const [hob, setHob] = useState(hobbies ?? "");
  const [school, setSchool] = useState(highSchool ?? "");
  const [avatar, setAvatar] = useState(avatarUrl ?? "");
  const [flairEq, setFlairEq] = useState(flair ?? "");
  const [titleEq, setTitleEq] = useState(title ?? "");
  const [colorEq, setColorEq] = useState(nameColor ?? "");
  const [uploading, setUploading] = useState(false);
  function save() {
    update.mutate({ statusText: status.trim() || null, hobbies: hob.trim() || null, highSchool: school.trim() || null, flair: flairEq || null, title: titleEq || null, nameColor: colorEq || null, ...(picsEnabled ? { avatarUrl: avatar.trim() || null } : {}) }, { onSuccess: onDone });
  }
  return (
    <div className="space-y-2 border-b border-border bg-border/20 p-4">
      <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={80} placeholder="Your status (e.g. Progress, not perfection)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <input value={hob} onChange={(e) => setHob(e.target.value)} maxLength={280} placeholder="Hobbies & interests (e.g. hiking, chess, baking)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} placeholder="High school" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      {picsEnabled ? (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="Profile picture URL, or upload →" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-border/40">
              {uploading ? "…" : "Upload"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { setAvatar((await uploadImage(f)).url); } finally { setUploading(false); } }} />
            </label>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Profile pictures are turned off for this workspace.</p>
      )}
      {aug && (() => {
        const has = aug.owned.FLAIR.length + aug.owned.TITLE.length + aug.owned.COLOR.length > 0;
        return (
          <div className="space-y-2 rounded-lg border border-border bg-surface/60 p-2.5">
            <div className="text-xs font-semibold text-muted">🎁 Your trinkets</div>
            {has ? (
              <>
                {aug.owned.FLAIR.length > 0 && <Slot label="Flair" items={aug.owned.FLAIR} value={flairEq} onPick={setFlairEq} render={(v) => <span className="text-lg">{v}</span>} />}
                {aug.owned.TITLE.length > 0 && <Slot label="Title" items={aug.owned.TITLE} value={titleEq} onPick={setTitleEq} render={(v) => v} />}
                {aug.owned.COLOR.length > 0 && <Slot label="Name colour" items={aug.owned.COLOR} value={colorEq} onPick={setColorEq} render={(v) => <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: NAME_COLORS[v] }} />{v}</span>} />}
              </>
            ) : (
              <p className="text-xs text-muted">Nothing unlocked yet — earn points and grab flair &amp; titles in the <span className="font-medium text-fg">Shop</span>.</p>
            )}
            <p className="text-[11px] text-muted/70">More trinkets — including name colours — are coming soon.</p>
          </div>
        );
      })()}
      <div className="flex gap-2">
        <button onClick={save} disabled={update.isPending} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90">Save</button>
        <button onClick={onDone} className="text-sm text-muted hover:underline">Cancel</button>
      </div>
    </div>
  );
}
