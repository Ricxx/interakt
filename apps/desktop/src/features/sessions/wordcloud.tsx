import { useState } from "react";
import { type CurrentActivity, useSubmitWord } from "../../lib/sessions";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const SIZES = ["text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"];
const COLORS = ["text-indigo-500", "text-cyan-600", "text-amber-600", "text-rose-500", "text-emerald-600", "text-fuchsia-600"];

// Live word cloud: everyone submits a few words, sized by frequency. CSS-based (no chart dep).
export function WordCloudView({ sessionId, activity }: { sessionId: string; activity: CurrentActivity }) {
  const wc = activity.wordcloud;
  const submit = useSubmitWord(sessionId, activity.id);
  const [word, setWord] = useState("");
  if (!wc) return null;

  const max = Math.max(1, ...wc.words.map((w) => w.count));
  const remaining = wc.maxPerPerson - wc.mineCount;

  function send(e: React.FormEvent) {
    e.preventDefault();
    const w = word.trim();
    if (!w || remaining <= 0) return;
    submit.mutate(w, { onSuccess: () => setWord("") });
  }

  return (
    <Card>
      <h3 className="text-base font-semibold">{wc.prompt}</h3>
      <p className="mt-0.5 text-sm text-muted">{wc.total} {wc.total === 1 ? "word" : "words"} from the room</p>

      {remaining > 0 ? (
        <form onSubmit={send} className="mt-3 flex items-center gap-2">
          <Input placeholder="Add a word…" value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} className="flex-1" />
          <Button type="submit" disabled={submit.isPending || !word.trim()}>Add</Button>
          <span className="shrink-0 text-xs text-muted">{remaining} left</span>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">You've added all {wc.maxPerPerson} of your words.</p>
      )}
      {submit.isError && <p className="mt-2 text-sm text-red-600">Couldn't add that word.</p>}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg bg-bg p-4">
        {wc.words.length === 0 && <span className="py-6 text-sm text-muted">No words yet — be the first.</span>}
        {wc.words.map((w, i) => {
          const tier = Math.round(((w.count - 1) / max) * (SIZES.length - 1));
          return (
            <span key={w.text} className={`${SIZES[tier]} ${COLORS[i % COLORS.length]} font-semibold leading-tight`} title={`${w.count}`}>
              {w.text}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
