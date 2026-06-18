import { useEffect, useState } from "react";

// Client-only preferences (theme + notification sound), persisted in localStorage.
const THEME_KEY = "ces-theme";
const SOUND_KEY = "ces-sound";

// Apply the saved theme before React renders, so there's no light→dark flash.
export function initTheme() {
  document.documentElement.classList.toggle("dark", localStorage.getItem(THEME_KEY) === "dark");
}

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function soundEnabled() {
  return localStorage.getItem(SOUND_KEY) !== "off"; // default on
}

export function useSound() {
  const [on, setOn] = useState(soundEnabled);
  useEffect(() => { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); }, [on]);
  return { on, toggle: () => setOn((v) => !v) };
}

// A short, soft blip via Web Audio (no asset to bundle). Used to pull back someone whose
// window isn't focused when something needs them. No-op if sound is off.
let ctx: AudioContext | null = null;
export function playNotify() {
  if (!soundEnabled()) return;
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.31);
  } catch {
    /* audio not available — ignore */
  }
}
