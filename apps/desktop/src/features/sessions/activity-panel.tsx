import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { type AgendaItem, type CurrentActivity, useActivityAction, useDiscardDraft, useEditDraft, useLaunchDraft, usePick, useStartActivity } from "../../lib/sessions";
import { NominationView } from "./nomination";
import { BrainstormView } from "./brainstorm";
import { RpsView } from "./rps";
import { BoardGameView } from "./boardgame";
import { TasksView } from "./tasks";
import { TaskReviewView } from "./task-review";
import { TriviaView } from "./trivia";
// Lazy — keeps ECharts out of the main bundle until a poll is actually shown.
const PollView = lazy(() => import("./poll").then((m) => ({ default: m.PollView })));
import { WordCloudView } from "./wordcloud";
import { QnaView } from "./qna";
import { DotVoteView } from "./dot-vote";
import { FistOfFiveView } from "./fist-of-five";
import { PokerView } from "./poker";
import { DrawStrawsView } from "./draw-straws";
import { TeamSelectView } from "./team-select";
import { SurveyActivityView } from "./survey-activity";
import { QuizActivityView } from "./quiz-activity";
import { useSurveys } from "../../lib/surveys";
import { useQuizzes } from "../../lib/quizzes";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";

type Joined = { userId: string; name: string };

// Catalog of activity types — name, mini icon, description (drives the "+ Add activity" picker).
export const CATALOG = [
  { type: "RANDOMIZER", name: "Randomizer", icon: "🎲", desc: "Pick people at random from the room." },
  { type: "NOMINATION", name: "Nomination", icon: "🗳️", desc: "Everyone votes for who goes next." },
  { type: "BRAINSTORM", name: "Brainstorm", icon: "💡", desc: "Collect ideas on a subject — like, comment, sort." },
  { type: "RPS", name: "Rock Paper Scissors", icon: "✊", desc: "Settle it — two players, best of N." },
  { type: "TIC_TAC_TOE", name: "Tic-Tac-Toe", icon: "⭕", desc: "Two players — classic 3×3." },
  { type: "CONNECT_FOUR", name: "Connect Four", icon: "🔴", desc: "Two players — drop discs, connect four." },
  { type: "CHECKERS", name: "Checkers", icon: "🏁", desc: "Two players — capture all the pieces." },
  { type: "TASK_REVIEW", name: "Task Review", icon: "✅", desc: "Spotlight a task for the room; add/track subtasks live." },
  { type: "TRIVIA", name: "Team Trivia", icon: "🧠", desc: "Everyone submits a fact/question; guess about a teammate." },
  { type: "QNA", name: "Q&A Queue", icon: "💬", desc: "Audience asks questions, upvotes them; host marks answered." },
  { type: "POLL", name: "Live Poll", icon: "📊", desc: "Poll the room with live charts; anonymity + CSV export." },
  { type: "DOT_VOTE", name: "Dot Voting", icon: "🔵", desc: "Prioritize: everyone spends a budget of dots across options." },
  { type: "FIST", name: "Fist of Five", icon: "✋", desc: "Quick 1–5 confidence check; live average + spread." },
  { type: "POKER", name: "Planning Poker", icon: "🃏", desc: "Estimate together — pick cards hidden, reveal at once." },
  { type: "WORDCLOUD", name: "Word Cloud", icon: "☁️", desc: "Everyone submits words; they grow by how often they're said." },
  { type: "DRAW_STRAWS", name: "Draw Straws", icon: "🥢", desc: "Everyone draws a straw; shortest is picked. Ranked live." },
  { type: "TEAM_SELECT", name: "Team Selector", icon: "👥", desc: "Split the room into teams — random, then nudge as needed." },
  { type: "SURVEY", name: "Survey", icon: "📋", desc: "Run one of your surveys live; responses feed its results." },
  { type: "QUIZ", name: "Quiz", icon: "🎯", desc: "Kahoot-style — timed, scored, with a live leaderboard." },
];

// Dispatcher: shows the current activity (by type), with "+ Add activity" last.
// Controllers see every activity; participants see only the types the host allows.
type Draft = { id: string; type: string; title: string; agendaItemId: string | null; launchAt: string | null };

export function ActivityPanel({ sessionId, canControl, activity, joined, rpsPlayers, participantStart, participantTypes, drafts, agenda }: { sessionId: string; canControl: boolean; activity: CurrentActivity | null; joined: Joined[]; rpsPlayers: Joined[]; participantStart: boolean; participantTypes: string[]; drafts: Draft[]; agenda: AgendaItem[] }) {
  const allowedTypes = canControl ? null : participantStart ? participantTypes : [];
  const canAdd = canControl || (allowedTypes !== null && allowedTypes.length > 0);
  const planned = canControl && drafts.length > 0 ? <PlannedActivities sessionId={sessionId} drafts={drafts} agenda={agenda} /> : null;
  if (!activity) {
    if (!canAdd) return <Card><p className="text-sm text-muted">Waiting for the host to start an activity…</p></Card>;
    return <>{planned}<AddActivity sessionId={sessionId} joined={joined} rpsPlayers={rpsPlayers} allowedTypes={allowedTypes} agenda={agenda} /></>;
  }
  return (
    <>
      {activity.type === "NOMINATION" ? (
        <NominationView sessionId={sessionId} canControl={canControl} activity={activity} joined={joined} />
      ) : activity.type === "BRAINSTORM" ? (
        <BrainstormView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "RPS" ? (
        <RpsView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "TIC_TAC_TOE" || activity.type === "CONNECT_FOUR" || activity.type === "CHECKERS" ? (
        <BoardGameView sessionId={sessionId} activity={activity} />
      ) : activity.type === "TASKS" ? (
        <TasksView sessionId={sessionId} canControl={canControl} activity={activity} joined={joined} />
      ) : activity.type === "TASK_REVIEW" ? (
        <TaskReviewView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "TRIVIA" ? (
        <TriviaView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "POLL" ? (
        <Suspense fallback={<Card><p className="text-sm text-muted">Loading chart…</p></Card>}><PollView sessionId={sessionId} canControl={canControl} activity={activity} /></Suspense>
      ) : activity.type === "WORDCLOUD" ? (
        <WordCloudView sessionId={sessionId} activity={activity} />
      ) : activity.type === "QNA" ? (
        <QnaView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "DOT_VOTE" ? (
        <DotVoteView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "FIST" ? (
        <FistOfFiveView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "POKER" ? (
        <PokerView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "DRAW_STRAWS" ? (
        <DrawStrawsView sessionId={sessionId} activity={activity} />
      ) : activity.type === "TEAM_SELECT" ? (
        <TeamSelectView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "SURVEY" ? (
        <SurveyActivityView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : activity.type === "QUIZ" ? (
        <QuizActivityView sessionId={sessionId} canControl={canControl} activity={activity} />
      ) : (
        <RandomizerView sessionId={sessionId} canControl={canControl} activity={activity} joined={joined} rpsPlayers={rpsPlayers} />
      )}
      {planned}
      {canAdd && <AddActivity sessionId={sessionId} joined={joined} rpsPlayers={rpsPlayers} allowedTypes={allowedTypes} agenda={agenda} />}
    </>
  );
}

const ICON = Object.fromEntries(CATALOG.map((c) => [c.type, c.icon]));
const BOARD_GAMES = ["TIC_TAC_TOE", "CONNECT_FOUR", "CHECKERS"]; // 1v1 like RPS: pick two players, no drafts

// "HH:MM" today → ISO. If the time has already passed today, it's effectively "launch now".
function timeToIso(hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
const isoToTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "");

// Pre-planned drafts/templates. Launch now, or schedule a launch time (fires when reached).
function PlannedActivities({ sessionId, drafts, agenda }: { sessionId: string; drafts: Draft[]; agenda: AgendaItem[] }) {
  const launch = useLaunchDraft(sessionId);
  const discard = useDiscardDraft(sessionId);
  const edit = useEditDraft(sessionId);

  // Auto-launch a scheduled draft when its time arrives (any controller's open client fires it once).
  const fired = useRef<Set<string>>(new Set());
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    for (const d of drafts) {
      if (d.launchAt && !fired.current.has(d.id) && Date.now() >= new Date(d.launchAt).getTime()) {
        fired.current.add(d.id);
        launch.mutate(d.id);
      }
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="mt-4">
      <h2 className="mb-2 text-sm font-semibold text-muted">Draft / Templates ({drafts.length})</h2>
      <ul className="space-y-2">
        {drafts.map((d) => {
          const secs = d.launchAt ? Math.max(0, Math.ceil((new Date(d.launchAt).getTime() - Date.now()) / 1000)) : null;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <span>{ICON[d.type] ?? "•"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
              {agenda.length > 0 && (
                <select value={d.agendaItemId ?? ""} onChange={(e) => edit.mutate({ activityId: d.id, agendaItemId: e.target.value || null })} className="max-w-36 rounded border border-border bg-surface px-1 py-0.5 text-xs" title="Agenda item">
                  <option value="">No agenda item</option>
                  {agenda.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1 text-xs text-muted" title="Launch at (today)">
                ⏰
                <input type="time" value={isoToTime(d.launchAt)} onChange={(e) => edit.mutate({ activityId: d.id, launchAt: e.target.value ? timeToIso(e.target.value) : null })} className="rounded border border-border bg-surface px-1 py-0.5" />
              </label>
              {secs !== null && secs > 0 && <span className="text-xs text-amber-600">in {secs > 90 ? `${Math.round(secs / 60)}m` : `${secs}s`}</span>}
              <button onClick={() => launch.mutate(d.id)} disabled={launch.isPending} className="text-xs font-medium text-primary hover:underline">Launch now</button>
              <button onClick={() => discard.mutate(d.id)} disabled={discard.isPending} className="text-xs text-muted hover:text-red-600">Discard</button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AddActivity({ sessionId, joined, rpsPlayers, allowedTypes, agenda }: { sessionId: string; joined: Joined[]; rpsPlayers: Joined[]; allowedTypes: string[] | null; agenda: AgendaItem[] }) {
  const start = useStartActivity(sessionId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [removeAfter, setRemoveAfter] = useState(true);
  const [includeHost, setIncludeHost] = useState(false);
  const [named, setNamed] = useState(false); // off = anonymous (default)
  const [timer, setTimer] = useState(""); // "" = no timer
  const [desc, setDesc] = useState(""); // brainstorm description
  // rps
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [bestOf, setBestOf] = useState(3);
  const [agrKind, setAgrKind] = useState("LOSER");
  const [agrText, setAgrText] = useState("");
  const [triviaTimer, setTriviaTimer] = useState("60"); // trivia submission window (seconds)
  // poll
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAnon, setPollAnon] = useState("ANON_ROOM");
  const [pollVis, setPollVis] = useState("LIVE");
  const [pollChart, setPollChart] = useState("BAR");
  const [pollClose, setPollClose] = useState(""); // seconds, "" = no auto-close
  const [pollQuestion, setPollQuestion] = useState("");
  const [teamCount, setTeamCount] = useState(2);
  const [qnaAnon, setQnaAnon] = useState(false);
  const [dotOptions, setDotOptions] = useState<string[]>(["", ""]);
  const [dotBudget, setDotBudget] = useState(5);
  const [surveyId, setSurveyId] = useState("");
  const { data: surveyData } = useSurveys();
  const mySurveys = surveyData?.surveys ?? [];
  const [quizId, setQuizId] = useState("");
  const { data: quizData } = useQuizzes();
  const myQuizzes = quizData?.quizzes ?? [];
  const [draftAgenda, setDraftAgenda] = useState(""); // agenda item a draft is planned under

  function add(type: string, defaultName: string, draft = false) {
    const t = (type === "POLL" ? pollQuestion.trim() || title.trim() : title.trim()) || defaultName;
    const config =
      type === "RANDOMIZER"
        ? { removeAfterPick: removeAfter, includeHost }
        : type === "NOMINATION"
          ? { anonymous: !named, timerSeconds: timer ? Number(timer) : undefined }
          : type === "RPS"
            ? { bestOf, agreementKind: agrKind, agreementText: agrText.trim() || undefined, player1Id: p1, player2Id: p2 }
            : BOARD_GAMES.includes(type)
            ? { agreementKind: agrKind, agreementText: agrText.trim() || undefined, player1Id: p1, player2Id: p2 }
            : type === "TRIVIA"
              ? { timerSeconds: triviaTimer ? Number(triviaTimer) : undefined }
              : type === "POLL"
                ? { pollOptions: pollOptions.map((o) => o.trim()).filter(Boolean), anonymity: pollAnon, resultsVisibility: pollVis, chartType: pollChart, closeSeconds: pollClose ? Number(pollClose) : undefined }
                : type === "QNA"
                  ? { anonymous: qnaAnon }
                : type === "DOT_VOTE"
                  ? { dotOptions: dotOptions.map((o) => o.trim()).filter(Boolean), dotBudget }
                : type === "TEAM_SELECT"
                  ? { teamCount }
                  : type === "SURVEY"
                    ? { surveyId }
                    : type === "QUIZ"
                      ? { quizId }
                      : type === "WORDCLOUD" || type === "DRAW_STRAWS" || type === "FIST" || type === "POKER"
                        ? {} // word cloud prompt = title; draw straws / fist / poker need no config
                        : { description: desc.trim() || undefined }; // BRAINSTORM
    start.mutate({ type, title: t, config, draft, agendaItemId: draft && draftAgenda ? draftAgenda : undefined }, { onSuccess: () => { setOpen(false); setTitle(""); setDesc(""); setP1(""); setP2(""); setAgrText(""); setPollQuestion(""); setDraftAgenda(""); } });
  }

  if (!open) {
    return (
      <Card className="mt-4">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm font-medium text-primary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-base leading-none">+</span>
          Add activity
        </button>
      </Card>
    );
  }

  const pollIncomplete = !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2;
  const dotIncomplete = dotOptions.filter((o) => o.trim()).length < 2;

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Add activity</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">cancel</button>
      </div>
      <Input className="mb-2" placeholder="Activity title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      {allowedTypes === null && agenda.length > 0 && (
        <label className="mb-3 flex items-center gap-2 text-xs text-muted">
          Plan under
          <select value={draftAgenda} onChange={(e) => setDraftAgenda(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
            <option value="">— agenda item (for drafts)</option>
            {agenda.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
      )}
      <div className="space-y-2">
        {CATALOG.filter((c) => allowedTypes === null || allowedTypes.includes(c.type)).map((c) => (
          <div key={c.type} className="flex items-start gap-3 rounded-lg border border-border p-3">
            <span className="text-2xl">{c.icon}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted">{c.desc}</div>
              {c.type === "RANDOMIZER" && (
                <div className="mt-1 flex flex-col gap-1 text-xs text-muted">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={removeAfter} onChange={(e) => setRemoveAfter(e.target.checked)} />
                    remove after pick
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={includeHost} onChange={(e) => setIncludeHost(e.target.checked)} />
                    include host in the draw
                  </label>
                </div>
              )}
              {c.type === "NOMINATION" && (
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} />
                    named votes (show who voted)
                  </label>
                  <label className="flex items-center gap-1">
                    timer
                    <select value={timer} onChange={(e) => setTimer(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
                      <option value="">none</option>
                      <option value="30">30s</option>
                      <option value="60">60s</option>
                      <option value="120">120s</option>
                    </select>
                  </label>
                </div>
              )}
              {c.type === "TRIVIA" && (
                <label className="mt-1 flex items-center gap-1 text-xs text-muted">
                  submission timer
                  <select value={triviaTimer} onChange={(e) => setTriviaTimer(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
                    <option value="">none</option>
                    <option value="30">30s</option>
                    <option value="60">60s</option>
                    <option value="120">2m</option>
                    <option value="300">5m</option>
                  </select>
                </label>
              )}
              {c.type === "POLL" && (
                <div className="mt-1 space-y-1 text-xs text-muted">
                  <Input placeholder="Poll question" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
                  {pollOptions.map((o, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Input placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setPollOptions(pollOptions.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1" />
                      {pollOptions.length > 2 && <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">×</button>}
                    </div>
                  ))}
                  {pollOptions.length < 10 && <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-primary hover:underline">+ add option</button>}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <select value={pollAnon} onChange={(e) => setPollAnon(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5" title="Who can see individual votes">
                      <option value="NAMED">Named</option>
                      <option value="ANON_ROOM">Anon to room (host sees)</option>
                      <option value="ANON_ALL">Fully anonymous</option>
                    </select>
                    <select value={pollVis} onChange={(e) => setPollVis(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5" title="When participants see results">
                      <option value="LIVE">Show live</option>
                      <option value="AFTER_VOTE">After they vote</option>
                      <option value="HIDDEN">Hide until close</option>
                    </select>
                    <select value={pollChart} onChange={(e) => setPollChart(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
                      <option value="BAR">Bar</option>
                      <option value="DONUT">Donut</option>
                    </select>
                    <select value={pollClose} onChange={(e) => setPollClose(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5" title="Auto-close">
                      <option value="">No auto-close</option>
                      <option value="30">30s</option>
                      <option value="60">60s</option>
                      <option value="120">2m</option>
                      <option value="300">5m</option>
                    </select>
                  </div>
                </div>
              )}
              {c.type === "BRAINSTORM" && (
                <div className="mt-1 text-xs text-muted">
                  <div>{title.trim() ? "The title above is the subject." : "The title above is the subject (optional — you can set it after)."}</div>
                  <Input className="mt-1" placeholder="Describe what we're brainstorming about…" value={desc} onChange={(e) => setDesc(e.target.value)} />
                </div>
              )}
              {c.type === "WORDCLOUD" && (
                <div className="mt-1 text-xs text-muted">The title above is the prompt (e.g. “One word for this quarter”).</div>
              )}
              {c.type === "FIST" && (
                <div className="mt-1 text-xs text-muted">The title is the question (e.g. “How confident are we in this plan?”). 1 = not at all, 5 = fully.</div>
              )}
              {c.type === "POKER" && (
                <div className="mt-1 text-xs text-muted">The title is what you're estimating (e.g. “Story: search filters”). Cards: 1, 2, 3, 5, 8, 13, 21, ?.</div>
              )}
              {c.type === "QNA" && (
                <label className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" checked={qnaAnon} onChange={(e) => setQnaAnon(e.target.checked)} />
                  anonymous (hide who asked)
                </label>
              )}
              {c.type === "DOT_VOTE" && (
                <div className="mt-1 space-y-1 text-xs text-muted">
                  {dotOptions.map((o, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Input placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setDotOptions(dotOptions.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1" />
                      {dotOptions.length > 2 && <button onClick={() => setDotOptions(dotOptions.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">×</button>}
                    </div>
                  ))}
                  {dotOptions.length < 12 && <button onClick={() => setDotOptions([...dotOptions, ""])} className="text-primary hover:underline">+ add option</button>}
                  <label className="flex items-center gap-1 pt-1">
                    dots each person gets
                    <select value={dotBudget} onChange={(e) => setDotBudget(Number(e.target.value))} className="rounded border border-border bg-surface px-1 py-0.5">
                      {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {c.type === "TEAM_SELECT" && (
                <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                  Number of teams
                  <select value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))} className="rounded border border-border bg-surface px-1 py-0.5">
                    {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              {c.type === "SURVEY" && (
                <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                  Survey
                  <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
                    <option value="">Choose a survey…</option>
                    {mySurveys.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.questions}q)</option>)}
                  </select>
                  {mySurveys.length === 0 && <span>— build one under Surveys first</span>}
                </label>
              )}
              {c.type === "QUIZ" && (
                <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                  Quiz
                  <select value={quizId} onChange={(e) => setQuizId(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
                    <option value="">Choose a quiz…</option>
                    {myQuizzes.map((qz) => <option key={qz.id} value={qz.id}>{qz.title} ({qz.questions}q)</option>)}
                  </select>
                  {myQuizzes.length === 0 && <span>— build one under Quizzes first</span>}
                </label>
              )}
              {c.type === "RPS" && (
                <div className="mt-1 space-y-1 text-xs text-muted">
                  <div className="flex gap-1">
                    <select value={p1} onChange={(e) => setP1(e.target.value)} className="flex-1 rounded border border-border bg-surface px-1 py-0.5">
                      <option value="">Player 1…</option>
                      {rpsPlayers.map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
                    </select>
                    <select value={p2} onChange={(e) => setP2(e.target.value)} className="flex-1 rounded border border-border bg-surface px-1 py-0.5">
                      <option value="">Player 2…</option>
                      {rpsPlayers.filter((j) => j.userId !== p1).map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
                    </select>
                    <select value={bestOf} onChange={(e) => setBestOf(Number(e.target.value))} className="rounded border border-border bg-surface px-1 py-0.5">
                      {[1, 3, 5, 10].map((n) => <option key={n} value={n}>best of {n}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <select value={agrKind} onChange={(e) => setAgrKind(e.target.value)} className="rounded border border-border bg-surface px-1 py-0.5">
                      <option value="LOSER">Loser has to</option>
                      <option value="WINNER">Winner gets</option>
                    </select>
                    <Input className="flex-1" placeholder="the stakes (optional)" value={agrText} onChange={(e) => setAgrText(e.target.value)} />
                  </div>
                </div>
              )}
              {BOARD_GAMES.includes(c.type) && (
                <div className="mt-1 flex gap-1 text-xs text-muted">
                  <select value={p1} onChange={(e) => setP1(e.target.value)} className="flex-1 rounded border border-border bg-surface px-1 py-0.5">
                    <option value="">Player 1…</option>
                    {rpsPlayers.map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
                  </select>
                  <select value={p2} onChange={(e) => setP2(e.target.value)} className="flex-1 rounded border border-border bg-surface px-1 py-0.5">
                    <option value="">Player 2…</option>
                    {rpsPlayers.filter((j) => j.userId !== p1).map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button onClick={() => add(c.type, c.name)} disabled={start.isPending || ((c.type === "RPS" || BOARD_GAMES.includes(c.type)) && (!p1 || !p2)) || (c.type === "POLL" && pollIncomplete) || (c.type === "DOT_VOTE" && dotIncomplete) || (c.type === "SURVEY" && !surveyId) || (c.type === "QUIZ" && !quizId)}>Start</Button>
              {/* RPS + board games can't be pre-planned (they need players live in the room). */}
              {allowedTypes === null && c.type !== "RPS" && !BOARD_GAMES.includes(c.type) && (
                <button onClick={() => add(c.type, c.name, true)} disabled={start.isPending || (c.type === "POLL" && pollIncomplete) || (c.type === "DOT_VOTE" && dotIncomplete) || (c.type === "SURVEY" && !surveyId) || (c.type === "QUIZ" && !quizId)} className="text-xs text-muted hover:text-fg disabled:opacity-40">Save as draft</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RandomizerView({ sessionId, canControl, activity, joined, rpsPlayers }: { sessionId: string; canControl: boolean; activity: CurrentActivity; joined: Joined[]; rpsPlayers: Joined[] }) {
  const pick = usePick(sessionId);
  const reset = useActivityAction(sessionId, "reset");
  const end = useActivityAction(sessionId, "end");
  const [choice, setChoice] = useState("");

  // The draw pool includes the host only if they opted in (rpsPlayers = host + joined).
  const pool = activity.config?.includeHost ? rpsPlayers : joined;
  const picks = activity.picks;
  const pickCount = picks.length;
  const last = picks[pickCount - 1];

  // Shuffle the displayed name for a fresh *random* pick (not manual choices).
  const prev = useRef(0);
  const [shuffleName, setShuffleName] = useState<string | null>(null);
  useEffect(() => {
    if (pickCount <= prev.current) {
      prev.current = pickCount;
      return;
    }
    const isNew = pickCount === prev.current + 1;
    prev.current = pickCount;
    if (last && !last.manual && isNew && pool.length > 1) {
      let ticks = 0;
      const names = pool.map((j) => j.name);
      const iv = setInterval(() => {
        setShuffleName(names[Math.floor(Math.random() * names.length)]);
        if (++ticks > 14) {
          clearInterval(iv);
          setShuffleName(null);
        }
      }, 80);
      return () => clearInterval(iv);
    }
  }, [pickCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeMode = activity.config?.removeAfterPick !== false;
  const pickedSet = new Set(picks.map((p) => p.userId));
  const remaining = removeMode ? Math.max(0, pool.length - pickCount) : pool.length;
  const eligible = removeMode ? pool.filter((j) => !pickedSet.has(j.userId)) : pool;
  const shuffling = shuffleName !== null;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">{activity.title}</h2>
        {canControl && <Button variant="subtle" onClick={() => end.mutate(activity.id)}>End activity</Button>}
      </div>

      <div className={cn(
        "mb-4 flex min-h-24 items-center justify-center rounded-lg p-6 text-center transition-colors",
        last && !shuffling ? "border-2 border-primary/50 bg-primary/5" : "bg-bg",
      )}>
        {shuffling ? (
          <div className="text-3xl font-bold text-muted">{shuffleName}</div>
        ) : last ? (
          <div key={pickCount} style={{ animation: "ces-pop 0.4s ease-out" }}>
            <div className="text-3xl font-bold">{last.name}</div>
            {last.manual && <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">chosen by host</div>}
          </div>
        ) : (
          <div className="text-sm text-muted">No one picked yet{canControl ? " — hit Pick." : "."}</div>
        )}
      </div>

      {canControl && (
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <Button onClick={() => pick.mutate({ activityId: activity.id })} disabled={pick.isPending || shuffling || remaining <= 0}>
              {remaining <= 0 ? "All picked" : "Pick someone"}
            </Button>
            <Button variant="ghost" onClick={() => reset.mutate(activity.id)} disabled={shuffling}>Reset</Button>
          </div>
          <div className="flex gap-2">
            <select value={choice} onChange={(e) => setChoice(e.target.value)} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <option value="">Choose someone specific…</option>
              {eligible.map((j) => <option key={j.userId} value={j.userId}>{j.name}</option>)}
            </select>
            <Button variant="ghost" disabled={!choice || pick.isPending} onClick={() => pick.mutate({ activityId: activity.id, userId: choice }, { onSuccess: () => setChoice("") })}>
              Choose
            </Button>
          </div>
        </div>
      )}

      <div className="mb-2 text-xs font-semibold text-muted">
        Picked ({pickCount}){removeMode && ` · ${remaining} remaining`}
      </div>
      <ol className="space-y-1 text-sm">
        {picks.map((p, i) => (
          <li key={p.userId + i} className="flex gap-2">
            <span className="text-muted">{i + 1}.</span>
            <span>{p.name}</span>
            {p.manual && <span className="text-xs text-muted">(chosen)</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
