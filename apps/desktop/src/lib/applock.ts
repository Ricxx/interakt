// Local app-lock. The PIN is a *device-local* privacy gate — it never goes to the server and doesn't
// log you out; it just covers the screen until you re-enter it. Stored as a salted SHA-256 hash in
// localStorage (never the PIN itself). Pairs with the "always logged in" long session.
const PIN_KEY = "ces-applock-pin"; // JSON { salt, hash }
const OPT_KEY = "ces-applock-opts"; // JSON { idleMinutes, lockOnLaunch }

export type LockOpts = { idleMinutes: number; lockOnLaunch: boolean }; // idleMinutes 0 = no auto-lock

async function sha(salt: string, pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hasPin(): boolean { return !!localStorage.getItem(PIN_KEY); }

export async function setPin(pin: string): Promise<void> {
  const salt = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash: await sha(salt, pin) }));
}
export function removePin(): void { localStorage.removeItem(PIN_KEY); }

export async function verifyPin(pin: string): Promise<boolean> {
  try { const { salt, hash } = JSON.parse(localStorage.getItem(PIN_KEY) ?? "{}"); return !!hash && (await sha(salt, pin)) === hash; } catch { return false; }
}

export function getOpts(): LockOpts {
  try { return { idleMinutes: 5, lockOnLaunch: true, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? "{}") }; } catch { return { idleMinutes: 5, lockOnLaunch: true }; }
}
export function setOpts(o: LockOpts): void { localStorage.setItem(OPT_KEY, JSON.stringify(o)); }
