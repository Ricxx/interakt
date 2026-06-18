import { useState } from "react";
import { useMe } from "../../lib/auth";
import { type WellnessAgg, type WellnessTrendPoint, personalGuidance, randomQuote, recordLocalCheckin, useWellnessCheckin, useWellnessPortal } from "../../lib/wellness";
import { SupportResources } from "./resources";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";

const FACES = [
  { v: 1, e: "😀", label: "Great" },
  { v: 2, e: "🙂", label: "Good" },
  { v: 3, e: "😐", label: "OK" },
  { v: 4, e: "😟", label: "Stressed" },
  { v: 5, e: "😣", label: "Struggling" },
];
// Higher avg = more stress → warmer colour.
const tone = (avg: number) => (avg >= 4 ? "text-red-600" : avg >= 3 ? "text-amber-600" : "text-emerald-600");

export function WellnessPage() {
  const { data: me } = useMe();
  const checkin = useWellnessCheckin();
  const portal = useWellnessPortal(me?.role === "TENANT_ADMIN");
  const [stress, setStress] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [quote] = useState(randomQuote);
  const [guidance, setGuidance] = useState(personalGuidance);

  function submit() {
    if (stress == null) return;
    checkin.mutate({ stress, note: note.trim() || undefined }, {
      onSuccess: () => { recordLocalCheckin(stress); setGuidance(personalGuidance()); setDone(true); },
    });
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Wellness" subtitle="A quick, anonymous check-in whenever you need it." />

      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 text-center">
        <div className="-mb-3 select-none font-serif text-5xl leading-none text-primary/30">“</div>
        <p className="mx-auto max-w-md text-lg font-medium leading-snug text-fg">{quote}</p>
        <div className="mt-2 text-xs uppercase tracking-widest text-primary/60">a moment for you</div>
      </div>

      {guidance.rough && (
        <Card className="mb-4 border-amber-300 bg-amber-50/40">
          <h2 className="text-sm font-semibold text-amber-800">A note, just for you 💛</h2>
          <p className="mt-1 text-sm text-fg">You've flagged feeling stressed a few times in the last couple of weeks. That's a sign to ease off — it's okay to take a day off and reset.</p>
          <ul className="mt-2 list-inside list-disc text-sm text-muted">
            <li>Consider booking a day off — rest is not falling behind.</li>
            <li>Step away for a short break, a walk, or some water right now.</li>
            <li>It's okay to talk to your manager or HR about your workload.</li>
            <li>One thing at a time — you don't have to carry it all today.</li>
          </ul>
          <p className="mt-2 text-xs text-muted">This is private to your device — no one else sees it.</p>
        </Card>
      )}

      <Card className="mb-6">
        {done ? (
          <div className="text-sm">
            <p>💙 Thanks for checking in — it's completely anonymous.</p>
            <button onClick={() => { setDone(false); setStress(null); setNote(""); }} className="mt-2 text-sm text-primary hover:underline">Check in again</button>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-sm font-semibold text-muted">How are you doing?</h2>
            <p className="mb-3 text-xs text-muted">No name is stored — only your answer and your department, and results only show in groups of {portal.data?.k ?? 5}+.</p>
            <div className="flex flex-wrap gap-2">
              {FACES.map((f) => (
                <button key={f.v} onClick={() => setStress(f.v)} className={`flex flex-col items-center rounded-lg border px-3 py-2 ${stress === f.v ? "border-primary bg-primary/10" : "border-border hover:bg-border/40"}`}>
                  <span className="text-2xl">{f.e}</span>
                  <span className="text-xs text-muted">{f.label}</span>
                </button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything you want to add? (optional, anonymous)" rows={2} className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <Button className="mt-3" disabled={stress == null || checkin.isPending} onClick={submit}>Submit anonymously</Button>
          </>
        )}
      </Card>

      {me?.role === "TENANT_ADMIN" && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-muted">Stress overview</h2>
          <p className="mb-3 text-xs text-muted">Last {portal.data?.windowDays ?? 60} days · aggregate only, hidden below {portal.data?.k ?? 5} responses.</p>
          {!portal.data ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              <Level label="Whole organisation" agg={portal.data.overall} />
              <div className="mt-3 space-y-1">
                {portal.data.departments.length === 0 && <p className="text-sm text-muted">No department has enough check-ins yet.</p>}
                {portal.data.departments.map((d, i) => <Level key={i} label={d.name} agg={d} />)}
              </div>
              <Trend points={portal.data.trend} />
            </>
          )}
        </Card>
      )}

      <SupportResources />
    </div>
  );
}

// W2 — weekly stress trend. Each bar is a week; height grows with stress (taller = more stress).
// Weeks below k aren't drawn (hatched gap) so a tiny week can't be read.
function Trend({ points }: { points: WellnessTrendPoint[] }) {
  if (points.every((p) => p.avg == null)) return null;
  const label = (p: WellnessTrendPoint) => (p.weeksAgo === 0 ? "now" : `${p.weeksAgo}w`);
  return (
    <div className="mt-5 border-t border-border pt-3">
      <div className="mb-2 text-xs font-semibold text-muted">Trend (weekly average, 1 calm → 5 stressed)</div>
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {points.map((p, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end" title={p.avg != null ? `${label(p)} ago · ${p.avg.toFixed(1)}/5 · ${p.count}` : `${label(p)} ago · too few`}>
            {p.avg != null ? (
              <div className={`w-full rounded-t ${p.avg >= 4 ? "bg-red-400" : p.avg >= 3 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ height: `${(p.avg / 5) * 64}px` }} />
            ) : (
              <div className="w-full rounded-t border border-dashed border-border" style={{ height: 6 }} />
            )}
            <span className="mt-1 text-[10px] text-muted">{label(p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Level({ label, agg }: { label: string; agg: WellnessAgg }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-2 text-sm first:border-t-0">
      <span>{label}</span>
      {agg.locked || agg.avg == null ? (
        <span className="text-xs text-muted">🔒 not enough check-ins ({agg.count})</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className={`font-semibold ${tone(agg.avg)}`}>{agg.avg.toFixed(1)}/5</span>
          <span className="text-xs text-muted">· {agg.count} check-ins</span>
        </span>
      )}
    </div>
  );
}
