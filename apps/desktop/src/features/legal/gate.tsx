import { useLegal, useAcceptLegal, LEGAL_TITLES } from "../../lib/legal";
import { Button } from "../../ui/button";

// Blocking acceptance gate. While the logged-in user has un-accepted Terms/Privacy (e.g. after an
// admin updates them), this covers the whole app until they accept. One doc at a time.
export function LegalGate() {
  const { data } = useLegal();
  const accept = useAcceptLegal();
  if (!data || data.pending.length === 0) return null;
  const kind = data.pending[0];
  const doc = (data.docs as Record<string, { body: string; version: number } | null>)[kind];
  if (!doc) return null;
  const more = data.pending.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-fg">{LEGAL_TITLES[kind] ?? kind}</h2>
          <p className="text-xs text-muted">Please review and accept to continue{more > 0 ? ` — ${more} more after this` : ""}.</p>
        </div>
        <div className="flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 text-sm text-fg">{doc.body}</div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
          <span className="text-xs text-muted">v{doc.version}</span>
          <Button disabled={accept.isPending} onClick={() => accept.mutate(kind)}>I accept</Button>
        </div>
      </div>
    </div>
  );
}
