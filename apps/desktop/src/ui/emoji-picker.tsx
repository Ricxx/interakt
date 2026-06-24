import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

// A small curated emoji set for shop items / icons — no external dependency.
const EMOJIS = [
  "🎁", "🎉", "🎊", "🥳", "✨", "⭐", "🔥", "💎", "🏆", "🥇", "🏅", "🎖️",
  "☕", "🍵", "🥤", "🍺", "🍷", "🥂", "🍕", "🍔", "🌮", "🍩", "🍪", "🍫",
  "🍿", "🧁", "🎂", "🍰", "🍦", "🍎", "🥨", "🍱", "🎟️", "🎫", "🎬", "🎤",
  "🎧", "🎮", "🕹️", "🎨", "📚", "🖊️", "🧩", "⚽", "🏀", "🎯", "🎳", "🧗",
  "👕", "🧢", "🧦", "👟", "🛍️", "🛒", "🎒", "⌚", "📱", "💻", "🎀", "🪴",
  "🌱", "🐶", "🐱", "🚗", "🏖️", "✈️", "🏨", "💳", "💵", "🪙", "❤️", "👍",
];

// A clickable emoji picker — shows the current emoji; click to open a grid and pick one.
export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
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

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} title="Pick an emoji" className="flex h-10 w-12 items-center justify-center rounded-lg border border-border bg-surface text-xl hover:border-primary">
        {value || "🎁"}
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-50 grid w-64 grid-cols-8 gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => { onChange(e); setOpen(false); }} className={cn("flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-border/60", value === e && "bg-primary/15 ring-1 ring-primary/40")}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
