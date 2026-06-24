import { useState } from "react";
import { Modal } from "../../ui/modal";
import { Button } from "../../ui/button";
import { useSubmitBug } from "../../lib/feedback";
import { useTenantSettings } from "../../lib/tenant";
import { useAiStatus, useAskAssistant } from "../../lib/ai";
import { useLegal } from "../../lib/legal";

export const APP_VERSION = "0.1.0"; // bump on release

// The persistent footer: Help · Report a bug · Privacy, with a light, centered copyright + version line
// underneath (workspace can hide the credit line in Settings).
export function FooterBar() {
  const [open, setOpen] = useState<null | "help" | "bug" | "privacy" | "ai">(null);
  const { data: settings } = useTenantSettings();
  const { data: ai } = useAiStatus();
  const link = "text-muted/70 hover:text-fg hover:underline";
  const year = new Date().getFullYear();
  const who = settings?.name || "CES";
  return (
    <div className="space-y-1 px-1 pt-2 text-[11px]">
      <div className="flex flex-wrap items-center justify-center gap-2 text-muted/70">
        {ai?.available && <><button className={`${link} font-medium text-primary`} onClick={() => setOpen("ai")}>✨ Ask AI</button><span className="text-muted/40">·</span></>}
        <button className={link} onClick={() => setOpen("help")}>Help</button>
        <span className="text-muted/40">·</span>
        <button className={link} onClick={() => setOpen("bug")}>Report a bug</button>
        <span className="text-muted/40">·</span>
        <button className={link} onClick={() => setOpen("privacy")}>Privacy</button>
      </div>
      {settings?.footerCredit !== false && (
        <div className="text-center text-[10px] font-light text-muted/50">© {year} {who} · v{APP_VERSION}</div>
      )}

      {open === "help" && <HelpModal onClose={() => setOpen(null)} />}
      {open === "bug" && <BugModal onClose={() => setOpen(null)} />}
      {open === "privacy" && <PrivacyModal onClose={() => setOpen(null)} />}
      {open === "ai" && <AssistantModal onClose={() => setOpen(null)} />}
    </div>
  );
}

function AssistantModal({ onClose }: { onClose: () => void }) {
  const ask = useAskAssistant();
  const [q, setQ] = useState("");
  const send = () => { if (q.trim().length >= 2) ask.mutate(q.trim()); };
  return (
    <Modal title="✨ Ask the CES assistant" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-muted">Ask how to do anything in CES — "how do I run a poll?", "where do I see my points?". Answers come only from the CES guide.</p>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type your question…" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
          <Button onClick={send} disabled={q.trim().length < 2 || ask.isPending}>{ask.isPending ? "Thinking…" : "Ask"}</Button>
        </div>
        {ask.isError && <p className="text-sm text-rose-600">{(ask.error as any)?.message?.includes("cap") ? "The AI usage limit has been reached for now — try again later." : "Couldn't reach the assistant. An admin may need to check the AI settings."}</p>}
        {ask.data && (
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="whitespace-pre-wrap text-sm text-fg">{ask.data.answer}</p>
            <p className="mt-2 text-[11px] text-muted/60">{ask.data.tokensIn + ask.data.tokensOut} tokens used</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Help & getting started" onClose={onClose}>
      <div className="space-y-3 text-sm text-fg">
        <p>CES is your team's engagement hub — sessions and activities, recognition, wellness, events, feedback and more.</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li><b className="text-fg">Sidebar</b> groups everything by area — click a heading to collapse it.</li>
          <li><b className="text-fg">Dashboard</b> shows only what needs you, plus your daily check-in.</li>
          <li>Most screens have an <b className="text-fg">explainer (?)</b> on the things that aren't obvious.</li>
          <li>Found a problem or have an idea? Use <b className="text-fg">Report a bug</b> — it goes to your workspace admin.</li>
        </ul>
        <p className="text-xs text-muted">A fuller manual lives with your administrator.</p>
      </div>
    </Modal>
  );
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  const { data } = useLegal();
  const custom = data?.docs.PRIVACY?.body;
  if (custom) return <Modal title="Privacy Policy" onClose={onClose} wide><div className="whitespace-pre-wrap text-sm text-fg">{custom}</div></Modal>;
  return (
    <Modal title="Privacy" onClose={onClose} wide>
      <div className="space-y-3 text-sm text-muted">
        <p className="text-fg">CES is built privacy-first. In plain terms:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b className="text-fg">Anonymous means anonymous.</b> Suggestions, complaints and wellness check-ins are stored with <i>no</i> link to you — not even your ID, IP, or an exact timestamp. We literally cannot tell who submitted them.</li>
          <li><b className="text-fg">Aggregates only.</b> Wellbeing and pulse numbers are never shown for small groups (under five people), so no one can be singled out.</li>
          <li><b className="text-fg">Your data, your rights.</b> Download everything we hold that's linked to you from your profile (“Download my data”), and ask an admin to erase your personal data at any time.</li>
          <li><b className="text-fg">Retention.</b> Your workspace can automatically purge old data on a schedule.</li>
          <li><b className="text-fg">No selling, no outside sharing.</b> Your data stays in your organisation's self-hosted workspace.</li>
        </ul>
        <p className="text-xs">Built to align with GDPR, Jamaica's Data Protection Act, and US privacy laws. Contact your workspace administrator for the full policy.</p>
      </div>
    </Modal>
  );
}

function BugModal({ onClose }: { onClose: () => void }) {
  const submit = useSubmitBug();
  const [kind, setKind] = useState<"BUG" | "IDEA">("BUG");
  const [message, setMessage] = useState("");
  const send = () => {
    if (message.trim().length < 3) return;
    submit.mutate({ kind, message: message.trim(), page: window.location.pathname }, { onSuccess: () => setMessage("") });
  };
  return (
    <Modal title="Report a bug or share an idea" onClose={onClose}>
      {submit.isSuccess ? (
        <div className="space-y-3 text-sm">
          <p className="text-fg">Thanks! Sent to your workspace admin. 🙌</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1 text-sm">
            {(["BUG", "IDEA"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 ${kind === k ? "bg-primary/10 font-medium text-primary" : "text-muted hover:text-fg"}`}>{k === "BUG" ? "🐞 Bug" : "💡 Idea"}</button>
            ))}
          </div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} placeholder={kind === "BUG" ? "What went wrong? What were you doing?" : "What would make this better?"} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <p className="text-xs text-muted">Goes to your workspace admin, who can pass it on to the makers. We include the page you're on; nothing else.</p>
          <Button onClick={send} disabled={message.trim().length < 3 || submit.isPending}>Send</Button>
          {submit.isError && <p className="text-xs text-rose-600">Couldn't send — try again.</p>}
        </div>
      )}
    </Modal>
  );
}
