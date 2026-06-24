import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasPin, setPin, removePin, verifyPin, getOpts, setOpts, type LockOpts } from "../../lib/applock";
import { useTenantSettings } from "../../lib/tenant";
import { Modal } from "../../ui/modal";
import { Button } from "../../ui/button";

type Ctx = { lock: () => void; openManager: () => void; pinSet: boolean };
const AppLockCtx = createContext<Ctx>({ lock: () => {}, openManager: () => {}, pinSet: false });
export const useAppLock = () => useContext(AppLockCtx);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [pinSet, setPinSet] = useState(hasPin());
  const [locked, setLocked] = useState(() => hasPin() && getOpts().lockOnLaunch);
  const [manager, setManager] = useState(false);
  const lastActivity = useRef(Date.now());

  const lock = useCallback(() => { if (hasPin()) setLocked(true); }, []);

  // Auto-lock after the configured idle time.
  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); };
    for (const e of ["mousemove", "keydown", "click", "touchstart"]) window.addEventListener(e, bump, { passive: true });
    const t = setInterval(() => {
      const o = getOpts();
      if (!locked && hasPin() && o.idleMinutes > 0 && Date.now() - lastActivity.current > o.idleMinutes * 60_000) setLocked(true);
    }, 10_000);
    return () => { clearInterval(t); for (const e of ["mousemove", "keydown", "click", "touchstart"]) window.removeEventListener(e, bump); };
  }, [locked]);

  return (
    <AppLockCtx.Provider value={{ lock, openManager: () => setManager(true), pinSet }}>
      {children}
      {locked && <LockScreen onUnlock={() => { lastActivity.current = Date.now(); setLocked(false); }} />}
      {manager && <LockManager onClose={() => { setPinSet(hasPin()); setManager(false); }} onLockNow={() => { setManager(false); lock(); }} />}
    </AppLockCtx.Provider>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { data: s } = useTenantSettings();
  const [pin, setPinVal] = useState("");
  const [err, setErr] = useState(false);
  const submit = async () => { if (await verifyPin(pin)) onUnlock(); else { setErr(true); setPinVal(""); } };
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-white/80 backdrop-blur-md">
      <div className="w-full max-w-xs text-center">
        {s?.brandLogoUrl ? <img src={s.brandLogoUrl} alt="" className="mx-auto mb-3 max-h-10 object-contain" /> : <div className="mb-2 text-2xl">🔒</div>}
        <div className="mb-1 text-lg font-semibold text-fg">{s?.name || "CES"} is locked</div>
        <p className="mb-4 text-sm text-muted">Enter your PIN to continue.</p>
        <input
          autoFocus type="password" inputMode="numeric" value={pin}
          onChange={(e) => { setPinVal(e.target.value.replace(/\D/g, "").slice(0, 8)); setErr(false); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className={`w-full rounded-lg border bg-surface px-3 py-3 text-center text-2xl tracking-[0.4em] outline-none ${err ? "border-rose-400" : "border-border focus:border-primary"}`}
          placeholder="••••"
        />
        {err && <p className="mt-2 text-sm text-rose-600">Wrong PIN — try again.</p>}
        <Button className="mt-4 w-full" onClick={submit} disabled={pin.length < 4}>Unlock</Button>
      </div>
    </div>
  );
}

function LockManager({ onClose, onLockNow }: { onClose: () => void; onLockNow: () => void }) {
  const exists = hasPin();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [opts, setO] = useState<LockOpts>(getOpts());
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (p1) { if (p1.length < 4 || p1 !== p2) return; await setPin(p1); }
    setOpts(opts); setP1(""); setP2(""); setSaved(true);
  };
  return (
    <Modal title="App lock (PIN)" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">A PIN locks the screen on this device without logging you out — handy for shared or unattended machines.</p>
        <div className="space-y-2">
          <label className="block"><span className="text-xs font-medium text-muted">{exists ? "New PIN (leave blank to keep)" : "Set a PIN (4–8 digits)"}</span>
            <input type="password" inputMode="numeric" value={p1} onChange={(e) => { setP1(e.target.value.replace(/\D/g, "").slice(0, 8)); setSaved(false); }} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 tracking-widest" /></label>
          {p1 && <label className="block"><span className="text-xs font-medium text-muted">Confirm PIN</span>
            <input type="password" inputMode="numeric" value={p2} onChange={(e) => setP2(e.target.value.replace(/\D/g, "").slice(0, 8))} className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2 tracking-widest ${p2 && p1 !== p2 ? "border-rose-400" : "border-border"}`} /></label>}
        </div>
        <label className="flex items-center justify-between gap-2"><span className="text-fg">Lock when idle</span>
          <select value={opts.idleMinutes} onChange={(e) => { setO({ ...opts, idleMinutes: Number(e.target.value) }); setSaved(false); }} className="rounded-lg border border-border bg-surface px-2 py-1">
            <option value={0}>Never</option><option value={2}>2 min</option><option value={5}>5 min</option><option value={15}>15 min</option><option value={30}>30 min</option>
          </select>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={opts.lockOnLaunch} onChange={(e) => { setO({ ...opts, lockOnLaunch: e.target.checked }); setSaved(false); }} /><span className="text-fg">Require PIN when the app opens</span></label>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button onClick={save} disabled={!!p1 && (p1.length < 4 || p1 !== p2)}>Save</Button>
          {exists && <Button variant="subtle" onClick={onLockNow}>Lock now</Button>}
          {exists && <button onClick={() => { removePin(); onClose(); }} className="text-xs text-rose-600 hover:underline">Remove PIN</button>}
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </div>
    </Modal>
  );
}
