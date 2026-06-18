import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEndSession, useGoLive, useJoinSession, useLeaveSession, useReclaim, useSession, useUpdateSettings } from "../../lib/sessions";
import { ActivityPanel, CATALOG as ACTIVITY_TYPES } from "./activity-panel";
import { ParticipantsTab } from "./participants-tab";
import { SessionLog, CompletedActivities } from "./session-log";
import { Agenda } from "./agenda";
import { Artifacts } from "./artifacts";
import { Chat } from "./chat";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { PageHeader } from "../../ui/page-header";
import { ErrorBoundary } from "../../ui/error-boundary";
import { cn } from "../../lib/cn";

type Tab = "activities" | "agenda" | "resources" | "participants" | "chat" | "log" | "settings";

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-sm text-muted hover:text-fg"
      title="Click to copy"
    >
      Code <span className="rounded bg-border/60 px-2 py-0.5 font-mono font-semibold tracking-wider text-fg">{code}</span>
      <span className="ml-1 text-xs">{copied ? "copied!" : "📋"}</span>
    </button>
  );
}

export function SessionDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useSession(id);
  const join = useJoinSession();
  const leave = useLeaveSession();
  const end = useEndSession();
  const settings = useUpdateSettings(id);
  const goLive = useGoLive();
  const reclaim = useReclaim(id);
  const [tab, setTab] = useState<Tab | null>(null);

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!data) {
    return (
      <div className="max-w-2xl space-y-3">
        <p className="text-sm text-muted">Session not found — it may have ended or the link is wrong.</p>
        <Button onClick={() => navigate("/sessions")}>Back to sessions</Button>
      </div>
    );
  }

  const { session, isHost, isCreator, canControl, canRunActivities, myState, participants, currentActivity, pastActivities, inviteBatches } = data;
  const ended = session.state === "ENDED";
  const scheduled = session.state === "SCHEDULED";
  const schedLabel = session.scheduledAt ? new Date(session.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const joinedPeople = participants.filter((p) => p.state === "JOINED").map((p) => ({ userId: p.userId, name: p.name }));
  // RPS players may include the host, who isn't a participant row.
  const rpsPlayers = [{ userId: session.hostId, name: session.hostName }, ...joinedPeople.filter((p) => p.userId !== session.hostId)];
  const inRoom = isHost || canControl || myState === "JOINED";

  const header = (
    <div className="mb-2 flex items-start justify-between">
      <PageHeader title={session.title} subtitle={`Hosted by ${session.hostName} · ${session.state}${scheduled && schedLabel ? ` for ${schedLabel}` : ` · ${session.audience}`}`} />
      <div className="flex items-center gap-2">
        {canControl && session.joinCode && !ended && <CopyCode code={session.joinCode} />}
        {scheduled && isHost && <Button onClick={() => goLive.mutate(id)}>Start session</Button>}
        {!ended && isCreator && !isHost && <Button onClick={() => reclaim.mutate()}>Reclaim host</Button>}
        {!ended && isHost && <Button variant="danger" onClick={() => end.mutate(id)}>End session</Button>}
        {!ended && !isHost && myState === "JOINED" && <Button variant="danger" onClick={() => leave.mutate(id, { onSuccess: () => navigate("/sessions") })}>Leave</Button>}
      </div>
    </div>
  );

  // Ended, or not yet in the room → no tabs.
  if (ended) {
    return <div className="max-w-2xl">{header}<SessionLog past={pastActivities} batches={inviteBatches} events={data.events} /></div>;
  }
  if (!inRoom) {
    return (
      <div className="max-w-2xl">
        {header}
        <Card>
          {scheduled ? (
            <p className="text-sm text-muted">This session is scheduled{schedLabel ? ` for ${schedLabel}` : ""} and hasn't started yet.</p>
          ) : myState === "PENDING" ? (
            <p className="text-sm text-muted">Waiting for the host to admit you…</p>
          ) : myState === "REMOVED" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">You're no longer in this session.</p>
              <Button onClick={() => navigate("/sessions")}>Join or host a new session</Button>
            </div>
          ) : myState ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm">{myState === "INVITED" ? "You've been invited." : "Re-join this session?"}</p>
              <Button onClick={() => join.mutate(id)}>{myState === "INVITED" ? "Join" : "Re-join"}</Button>
            </div>
          ) : (
            <p className="text-sm text-muted">You're not part of this session.</p>
          )}
        </Card>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "activities", label: "Activities" },
    { key: "agenda", label: data.agenda.length ? `Agenda (${data.agenda.length})` : "Agenda" },
    { key: "resources", label: "Resources" },
    { key: "participants", label: `Participants (${joinedPeople.length})` },
    { key: "chat", label: "Chat", badge: data.unreadChat },
    { key: "log", label: "Session log" },
    ...(isHost ? [{ key: "settings" as Tab, label: "Settings" }] : []),
  ];
  // After starting, hosts land on Participants (to invite/configure); members on Activities.
  const activeTab: Tab = tab ?? (canControl ? "participants" : "activities");

  return (
    <div className="max-w-2xl">
      {header}
      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              activeTab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.badge ? <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <ErrorBoundary key={activeTab} label={`the ${activeTab} tab`}>
      {activeTab === "activities" && (
        scheduled ? (
          <Card><p className="text-sm text-muted">Start the session to run activities. Meanwhile you can invite people and set it up.</p></Card>
        ) : (
          <div className="space-y-4">
            <ActivityPanel key={currentActivity?.id ?? "none"} sessionId={id} canControl={canRunActivities} activity={currentActivity} joined={joinedPeople} rpsPlayers={rpsPlayers} participantStart={session.participantStart} participantTypes={session.participantTypes} drafts={data.drafts} agenda={data.agenda} />
            <CompletedActivities past={pastActivities} />
          </div>
        )
      )}
      {activeTab === "agenda" && <Agenda sessionId={id} canControl={canRunActivities} items={data.agenda} />}
      {activeTab === "resources" && <Artifacts sessionId={id} />}
      {activeTab === "participants" && (
        <ParticipantsTab sessionId={id} hostName={session.hostName} isHost={isHost} canControl={canControl} participants={participants} inviteBatches={inviteBatches} />
      )}
      {activeTab === "chat" && <Chat sessionId={id} />}
      {activeTab === "log" && <SessionLog past={pastActivities} batches={inviteBatches} events={data.events} />}
      {activeTab === "settings" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-muted">Join policy</h2>
          <div className="space-y-2">
            {(["OPEN", "APPROVAL"] as const).map((p) => (
              <label key={p} className="flex items-start gap-2 text-sm">
                <input type="radio" name="joinPolicy" checked={session.joinPolicy === p} onChange={() => settings.mutate({ joinPolicy: p })} className="mt-1" />
                <span>
                  <span className="font-medium">{p === "OPEN" ? "Open" : "Approval required"}</span>
                  <span className="block text-xs text-muted">
                    {p === "OPEN" ? "Anyone with the code joins instantly." : "People with the code wait in a lobby; you admit or deny them."}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">Participant activities</h2>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={session.participantStart}
              onChange={(e) => settings.mutate({ participantStart: e.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Let participants start activities</span>
              <span className="block text-xs text-muted">When off, only you and co-hosts can start activities.</span>
            </span>
          </label>
          {session.participantStart && (
            <div className="mt-2 space-y-1 pl-6">
              <div className="text-xs text-muted">Activities participants may start:</div>
              {ACTIVITY_TYPES.map((t) => {
                const on = session.participantTypes.includes(t.type);
                return (
                  <label key={t.type} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        settings.mutate({
                          participantTypes: on ? session.participantTypes.filter((x) => x !== t.type) : [...session.participantTypes, t.type],
                        })
                      }
                    />
                    {t.icon} {t.name}
                  </label>
                );
              })}
            </div>
          )}
        </Card>
      )}
      </ErrorBoundary>
    </div>
  );
}
