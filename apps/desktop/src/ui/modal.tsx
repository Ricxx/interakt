import { useEffect, type ReactNode } from "react";

// A centered modal over a white, blurred backdrop. Click the backdrop or press Escape to close.
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`max-h-[85vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} overflow-auto rounded-xl border border-border bg-surface p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
