import { useEffect, useRef, useState } from "react";

export type Help = { blurb: string; steps: string[] };

// A small "?" help button that pops a mini explainer. Accessible: real button, aria-label, Escape +
// click-outside to dismiss. Renders nothing if there's no help for this item.
export function InfoTip({ label, help }: { label: string; help?: Help }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!help) return null;
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`How ${label} works`}
        aria-expanded={open}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-muted hover:border-primary hover:text-primary"
      >
        ?
      </button>
      {open && (
        <div role="tooltip" className="absolute right-0 top-5 z-50 w-64 rounded-lg border border-border bg-surface p-3 text-left shadow-lg">
          <p className="text-xs font-medium text-fg">{label}</p>
          <p className="mt-0.5 text-xs text-muted">{help.blurb}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-muted">
            {help.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}
    </span>
  );
}
