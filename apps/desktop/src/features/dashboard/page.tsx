import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../../lib/auth";
import { useMeInvites } from "../../lib/sessions";
import { useRequests } from "../../lib/requests";
import { useEvents } from "../../lib/events";
import { useProfile } from "../../lib/profile";
import { useTenantSettings, useTerms } from "../../lib/tenant";
import { personalGuidance } from "../../lib/wellness";
import { usePoints, useCheckin, useLottery } from "../../lib/points";
import { badgeOf } from "../../lib/recognition";
import { Button } from "../../ui/button";
import { KIND_META, fmtWhen } from "../events/page";
import { useOpenProfile } from "../profile/overlay";
import { TaskFeed } from "../tasks/feed";
import { Avatar } from "../../ui/avatar";
import { Card } from "../../ui/card";

function CheckinCard() {
  const navigate = useNavigate();
  const { data: p } = usePoints();
  const checkin = useCheckin();
  const lottery = useLottery();
  const term = useTerms();
  if (!p) return null;
  const prize = checkin.data?.prize;
  const won = lottery.data?.won;
  return (
    <div className="mb-6">
      {/* Top card: streak + points + the daily check-in. */}
      <Card className="flex flex-wrap items-center gap-4 rounded-b-none">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <div><div className="text-xl font-semibold text-fg">{p.streak}-day streak</div><div className="text-xs text-muted">{p.balance} {term("pointsPlural")}</div></div>
        </div>
        {prize && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">🎁 You won: {prize.label}</span>}
        <div className="ml-auto">
          {p.checkedInToday ? (
            <span className="text-sm text-emerald-600">✓ Checked in today</span>
          ) : (
            <Button disabled={checkin.isPending} onClick={() => checkin.mutate()}>Daily check-in</Button>
          )}
        </div>
      </Card>
      {/* Mini attached card: the daily draw + a calendar link. */}
      <div className="flex flex-wrap items-center gap-3 rounded-b-lg border border-t-0 border-border bg-primary/5 px-5 py-2.5 text-sm">
        <span className="font-medium text-fg">🎲 Daily draw</span>
        {won != null ? (
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">You won +{won} {term("pointsPlural")}!</span>
        ) : p.lotteryToday ? (
          <span className="text-xs text-muted">Come back tomorrow for another spin.</span>
        ) : (
          <>
            <span className="text-xs text-muted">One free spin a day.</span>
            <Button variant="subtle" disabled={lottery.isPending} onClick={() => lottery.mutate()}>Spin</Button>
          </>
        )}
        <button onClick={() => navigate("/calendar")} className="ml-auto text-xs text-primary hover:underline">View calendar →</button>
      </div>
    </div>
  );
}

const TRY_OUT = [
  { to: "/sessions", icon: "🎤", label: "Run a session" },
  { to: "/recognition", icon: "🎉", label: "Give a big-up" },
  { to: "/events", icon: "📅", label: "Plan an event" },
  { to: "/wellness", icon: "💙", label: "Wellness" },
  { to: "/surveys", icon: "📋", label: "Build a survey" },
  { to: "/quizzes", icon: "🎯", label: "Make a quiz" },
  { to: "/lists", icon: "🗂️", label: "Start a list" },
  { to: "/boards", icon: "📌", label: "Post to a board" },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: invites } = useMeInvites();
  const { data: requests } = useRequests();
  const { data: eventsData } = useEvents();
  const { data: profile } = useProfile(me?.id ?? null);
  const { data: settings } = useTenantSettings();
  const openProfile = useOpenProfile();
  const [guidance] = useState(personalGuidance);

  const sessions = invites?.invites ?? [];
  const awaitingMe = (requests?.queue ?? []).filter((r) => r.status === "PENDING" && !r.iApproved);
  const upcoming = (eventsData?.events ?? []).filter((e) => e.startAt && new Date(e.startAt).getTime() >= Date.now() - 86400_000).sort((a, b) => (a.startAt! < b.startAt! ? -1 : 1)).slice(0, 4);
  const received = profile?.received ?? [];
  const firstName = (me?.displayName ?? "there").split(" ")[0];
  const showPics = settings?.profilePicsEnabled !== false;

  // Only surface tiles that actually need attention — no scary "0 X" tiles.
  const tiles = [
    { label: "Invitations & live", n: sessions.length, to: "/sessions" },
    { label: "Awaiting your approval", n: awaitingMe.length, to: "/requests" },
    { label: "Upcoming events", n: upcoming.length, to: "/events" },
  ].filter((t) => t.n > 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={me?.displayName ?? "?"} url={showPics ? me?.avatarUrl : null} size={56} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-fg">Welcome, {firstName}{me?.flair ? ` ${me.flair}` : ""}</h1>
          <button onClick={() => me && openProfile(me.id)} className="text-sm text-muted hover:text-fg" title="Edit your profile">
            {me?.statusText ? <span className="italic">“{me.statusText}”</span> : <span className="text-primary">+ Set a status</span>}
          </button>
        </div>
      </div>

      {settings?.welcomeMessage && (
        <Card className="mb-6 border-primary/30 bg-primary/5"><p className="text-sm text-fg">{settings.welcomeMessage}</p></Card>
      )}

      {guidance.rough && (
        <Card className="mb-6 border-amber-300 bg-amber-50/40">
          <p className="text-sm text-fg">You've flagged feeling stressed a few times lately — it's okay to ease off. <button onClick={() => navigate("/wellness")} className="font-medium text-primary hover:underline">Open Wellness</button> for support.</p>
        </Card>
      )}

      <CheckinCard />


      {tiles.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <button key={t.label} onClick={() => navigate(t.to)} className="rounded-xl border border-border bg-surface p-4 text-left hover:bg-border/30">
              <div className="text-2xl font-semibold text-fg">{t.n}</div>
              <div className="text-xs text-muted">{t.label}</div>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Coming up</h2>
            <button onClick={() => navigate("/events")} className="text-xs text-primary hover:underline">All events</button>
          </div>
          {sessions.length === 0 && upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.slice(0, 3).map((i) => (
                <li key={i.id} className="flex cursor-pointer items-center gap-2 text-sm hover:opacity-80" onClick={() => navigate(`/sessions/${i.id}`)}>
                  <span>🎤</span><span className="min-w-0 flex-1 truncate text-fg">{i.title}</span>
                  <span className="shrink-0 text-xs text-muted">{i.state === "SCHEDULED" ? (i.scheduledAt ? fmtWhen(i.scheduledAt, settings?.timezone) : "scheduled") : "live now"}</span>
                </li>
              ))}
              {upcoming.map((e) => (
                <li key={e.id} className="flex cursor-pointer items-center gap-2 text-sm hover:opacity-80" onClick={() => navigate(`/events/${e.id}`)}>
                  <span>{KIND_META[e.kind].icon}</span><span className="min-w-0 flex-1 truncate text-fg">{e.title}</span>
                  <span className="shrink-0 text-xs text-muted">{e.startAt ? fmtWhen(e.startAt, settings?.timezone) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">Big-ups &amp; awards you've received</h2>
            <button onClick={() => navigate("/recognition")} className="text-xs text-primary hover:underline">All</button>
          </div>
          {received.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet — your big-ups will show here.</p>
          ) : (
            <ul className="space-y-2">
              {received.slice(0, 4).map((r) => {
                const b = badgeOf(r.badge);
                return (
                  <li key={r.id} className="flex items-start gap-2 text-sm">
                    <span className="text-lg">{r.kind === "AWARD" ? "🏆" : b.emoji}</span>
                    <div className="min-w-0 flex-1"><span className="text-xs text-muted">from {r.fromName}</span><p className="truncate text-fg">{r.message}</p></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Recent task activity</h2>
        <TaskFeed limit={3} seeAll />
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Try out</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TRY_OUT.map((t) => (
            <button key={t.to} onClick={() => navigate(t.to)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-border/30">
              <span className="text-lg">{t.icon}</span><span className="min-w-0 truncate text-fg">{t.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
