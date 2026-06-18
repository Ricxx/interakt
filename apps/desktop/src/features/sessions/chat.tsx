import { useEffect, useState } from "react";
import { type Message, useMarkChatRead, useMessages, useReactToMessage, useSendMessage } from "../../lib/sessions";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { cn } from "../../lib/cn";
import { RefText } from "../../lib/ref-text";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🙌", "👀"];
// Stable light background per sender (literal classes so Tailwind keeps them).
const SENDER_COLORS = ["bg-blue-100", "bg-green-100", "bg-purple-100", "bg-amber-100", "bg-pink-100", "bg-teal-100"];
function colorFor(userId: string) {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

export function Chat({ sessionId }: { sessionId: string }) {
  const { data } = useMessages(sessionId);
  const send = useSendMessage(sessionId);
  const markRead = useMarkChatRead(sessionId);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const msgs = data?.messages ?? [];

  // Viewing the chat marks it read (clears the badge), incl. as new messages arrive.
  useEffect(() => { markRead.mutate(); }, [msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    send.mutate({ body: text.trim(), replyToId: replyTo?.id }, { onSuccess: () => { setText(""); setReplyTo(null); } });
  }

  return (
    <Card>
      <div className="mb-3 max-h-96 space-y-3 overflow-y-auto">
        {msgs.length === 0 && <p className="text-sm text-muted">No messages yet — say hi 👋</p>}
        {msgs.map((m, i) => (
          <Bubble key={m.id} sessionId={sessionId} m={m} showName={!m.mine && msgs[i - 1]?.userId !== m.userId} onReply={() => setReplyTo(m)} />
        ))}
      </div>

      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded border-l-2 border-primary bg-bg px-2 py-1 text-xs">
          <span className="truncate text-muted">Replying to <span className="font-medium text-fg">{replyTo.name}</span>: {replyTo.body}</span>
          <button onClick={() => setReplyTo(null)} className="ml-2 text-muted hover:text-fg">×</button>
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the room…" className="flex-1" />
        <Button type="submit" disabled={!text.trim() || send.isPending}>Send</Button>
      </form>
    </Card>
  );
}

function Bubble({ sessionId, m, showName, onReply }: { sessionId: string; m: Message; showName: boolean; onReply: () => void }) {
  const react = useReactToMessage(sessionId);
  const [pick, setPick] = useState(false);
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary", "rounded-lg");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded-lg"), 1200);
  };
  return (
    <div id={`msg-${m.id}`} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[78%]">
        <div className={cn("rounded-lg px-3 py-2", m.mine ? "bg-primary text-primary-fg" : `${colorFor(m.userId)} text-fg`)}>
          {showName && <div className="mb-0.5 text-xs font-semibold">{m.name}</div>}
          {m.replyTo && (
            <button
              type="button"
              onClick={() => m.replyTo && jumpTo(m.replyTo.id)}
              className={cn("mb-1 block w-full rounded border-l-2 px-2 py-0.5 text-left text-xs hover:opacity-80", m.mine ? "border-primary-fg/50 bg-primary-fg/10" : "border-fg/20 bg-fg/5")}
            >
              <span className="font-medium">{m.replyTo.name}</span>: {m.replyTo.body.slice(0, 80)}
            </button>
          )}
          <div className="whitespace-pre-wrap break-words text-sm"><RefText text={m.body} /></div>
          <div className={cn("mt-0.5 text-right text-[10px]", m.mine ? "text-primary-fg/70" : "text-muted")}>
            {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>

        {/* reactions + actions */}
        <div className={cn("mt-1 flex items-center gap-1", m.mine ? "justify-end" : "justify-start")}>
          {m.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => react.mutate({ messageId: m.id, emoji: r.emoji })}
              className={cn("rounded-full border px-1.5 py-0.5 text-xs", r.mine ? "border-primary bg-primary/10" : "border-border")}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          <div className="relative">
            <button onClick={() => setPick(!pick)} className="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted hover:text-fg">＋</button>
            {pick && (
              <div className="absolute z-10 mt-1 flex gap-1 rounded-lg border border-border bg-surface p-1 shadow">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => { react.mutate({ messageId: m.id, emoji: e }); setPick(false); }} className="text-base hover:scale-110">{e}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onReply} className="text-xs text-muted hover:text-fg">reply</button>
        </div>
      </div>
    </div>
  );
}
