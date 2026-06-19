import { cn } from "../lib/cn";

// Profile picture with an initials fallback. Callers pass `url` only when the institution allows pics,
// so disabling pics tenant-wide simply falls back to initials everywhere.
export function Avatar({ name, url, size = 36, className, ring }: { name: string; url?: string | null; size?: number; className?: string; ring?: string | null }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  // An equipped COLOR augment shows as a coloured ring around the avatar (the "frame").
  const ringStyle = ring ? { boxShadow: `0 0 0 2px var(--surface, #fff), 0 0 0 4px ${ring}` } : undefined;
  if (url) {
    return <img src={url} alt={name} width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size, ...ringStyle }} />;
  }
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary", className)} style={{ width: size, height: size, fontSize: size * 0.4, ...ringStyle }}>
      {initial}
    </div>
  );
}
