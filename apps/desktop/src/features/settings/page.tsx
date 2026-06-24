import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../ui/card";
import { PageHeader } from "../../ui/page-header";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { EmojiPicker } from "../../ui/emoji-picker";
import { BRAND_COLORS, TERM_DEFAULTS, TERM_LABELS, TOGGLEABLE_MODULES, applyBrandColor, brandHue, timezones, useSetBranding, useSetModules, useSetProfilePics, useSetTimezone, useSetUsageLog, useTenantSettings } from "../../lib/tenant";
import { uploadImage } from "../../lib/upload";
import { useClearComplaintRoute, useComplaintRoutes, useSetComplaintRoute } from "../../lib/suggestions";
import { useRetention, useRunRetention, useSaveRetention } from "../../lib/retention";
import { useAiSettings, useSaveAiSettings, useAiUsage } from "../../lib/ai";
import { useLegal, useSaveLegal, LEGAL_TITLES } from "../../lib/legal";
import { useOrgNodes } from "../../lib/recognition";

// A small admin hub for configuration that doesn't need its own top-level nav item.
// Each entry links to an existing page; add rows here as more settings appear.
const SETTINGS = [
  { to: "/org", title: "Organization structure", desc: "Divisions, departments and units that scope everything." },
  { to: "/audit", title: "Audit log", desc: "Tamper-evident record of privileged actions." },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { data: settings } = useTenantSettings();
  const setTz = useSetTimezone();
  const setUsage = useSetUsageLog();
  const setPics = useSetProfilePics();
  const setModules = useSetModules();
  const disabled = new Set(settings?.disabledModules ?? []);
  const toggleModule = (key: string, enable: boolean) => {
    const next = new Set(disabled);
    if (enable) next.delete(key); else next.add(key);
    setModules.mutate([...next]);
  };
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Configure how this workspace is organized and governed." />

      <Branding />

      <Terminology />

      <Card className="mb-4">
        <h2 className="text-sm font-semibold text-fg">Workspace timezone</h2>
        <p className="mb-2 mt-0.5 text-sm text-muted">All scheduled times — sessions, scavenger-hunt clue releases, tournament matches — are shown in this zone.</p>
        <div className="flex items-center gap-3">
          <select value={settings?.timezone ?? "UTC"} disabled={!settings || setTz.isPending} onChange={(e) => setTz.mutate(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {timezones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          {setTz.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </Card>

      <Card className="mb-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={!!settings?.usageLogEnabled} disabled={!settings || setUsage.isPending} onChange={(e) => setUsage.mutate(e.target.checked)} />
          <span>
            <span className="text-sm font-semibold text-fg">Team usage log</span>
            <p className="text-sm text-muted">Lets managers (with the “View usage log” permission) see a light overview of who joined which sessions and what activities ran — never any content. Off by default; some teams find it micromanage-y.</p>
          </span>
        </label>
      </Card>

      <Card className="mb-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={settings?.profilePicsEnabled !== false} disabled={!settings || setPics.isPending} onChange={(e) => setPics.mutate(e.target.checked)} />
          <span>
            <span className="text-sm font-semibold text-fg">Profile pictures</span>
            <p className="text-sm text-muted">Let people set a profile picture. Turn off to keep avatars as initials only across the workspace.</p>
          </span>
        </label>
      </Card>

      <Card className="mb-4">
        <h2 className="text-sm font-semibold text-fg">Modules</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted">Hide feature areas this workspace doesn't use — they disappear from everyone's sidebar. Core areas (Dashboard, Sessions, Notifications, admin) can't be turned off.</p>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {TOGGLEABLE_MODULES.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!disabled.has(m.key)} disabled={!settings || setModules.isPending} onChange={(e) => toggleModule(m.key, e.target.checked)} />
              <span className={disabled.has(m.key) ? "text-muted" : "text-fg"}>{m.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <ComplaintRouting />

      <AiSettingsCard />

      <LegalEditor />

      <DataRetention />

      <Card className="divide-y divide-border p-0">
        {SETTINGS.map((s) => (
          <button
            key={s.to}
            onClick={() => navigate(s.to)}
            className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-border/40"
          >
            <div>
              <div className="text-sm font-medium text-fg">{s.title}</div>
              <div className="text-sm text-muted">{s.desc}</div>
            </div>
            <span className="text-muted">›</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

// Data-retention schedule. Off by default — nothing is auto-deleted until an admin turns it on.
// Audit/ledger tables are never auto-purged (kept for accountability), which we state plainly.
function DataRetention() {
  const { data } = useRetention();
  const save = useSaveRetention();
  const run = useRunRetention();
  const [c, setC] = useState(12);
  const [w, setW] = useState(90);
  const [d, setD] = useState(60);

  useEffect(() => {
    if (!data) return;
    setC(data.complaintsResolvedMonths); setW(data.wellnessRawDays); setD(data.deactivatedPiiDays);
  }, [data?.complaintsResolvedMonths, data?.wellnessRawDays, data?.deactivatedPiiDays]);

  const num = (v: string, fb: number) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; };
  const Field = ({ label, value, onChange, unit }: { label: string; value: number; onChange: (n: number) => void; unit: string }) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-fg">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input type="number" value={String(value)} onChange={(e) => onChange(num(e.target.value, value))} onBlur={() => save.mutate({ complaintsResolvedMonths: c, wellnessRawDays: w, deactivatedPiiDays: d })} className="w-20 text-right" />
        <span className="w-14 text-xs text-muted">{unit}</span>
      </span>
    </label>
  );

  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-fg">Data retention</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">Automatically purge old data to honour storage-limitation rules (GDPR, Jamaica's DPA, CCPA). Off by default — turn it on only when you're ready, as purges are permanent. The tamper-evident audit log and points ledger are kept for accountability and are never auto-deleted.</p>

      <label className="mb-3 flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={!!data?.enabled} disabled={!data || save.isPending} onChange={(e) => save.mutate({ enabled: e.target.checked })} />
        <span>
          <span className="text-sm font-semibold text-fg">Enable automatic purges</span>
          <p className="text-sm text-muted">Runs daily across the workspace once on.</p>
        </span>
      </label>

      <div className="space-y-2 border-t border-border pt-3">
        <Field label="Delete resolved suggestions/complaints after" value={c} onChange={setC} unit="months" />
        <Field label="Delete raw wellness check-ins after" value={w} onChange={setW} unit="days" />
        <Field label="Anonymise an offboarded member's data after" value={d} onChange={setD} unit="days" />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
        <Button variant="subtle" onClick={() => run.mutate()} disabled={!data?.enabled || run.isPending}>Run now</Button>
        {run.data && <span className="text-xs text-emerald-600">Purged {run.data.complaints} items, {run.data.wellness} check-ins, anonymised {run.data.erased}.</span>}
        {!run.data && data?.lastRunAt && <span className="text-xs text-muted">Last run {new Date(data.lastRunAt).toLocaleString()}</span>}
        {!run.data && data?.enabled === false && <span className="text-xs text-muted">Enable purges to run.</span>}
      </div>
    </Card>
  );
}

// Complaint routing: per category, pick the department whose managers handle it. A complaint filed
// under a routed category is directed straight to that team (still anonymous).
function ComplaintRouting() {
  const { data } = useComplaintRoutes();
  const { data: org } = useOrgNodes();
  const setRoute = useSetComplaintRoute();
  const clearRoute = useClearComplaintRoute();
  const routeFor = (cat: string) => data?.routes.find((r) => r.category === cat)?.nodeId ?? "";

  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-fg">Complaint routing</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">Send each kind of complaint straight to the team that handles it (e.g. harassment → HR). People filing a complaint pick a category; routed ones go privately to that department — still fully anonymous. Leave a category unset to keep it in its normal box.</p>
      <div className="space-y-2">
        {data?.categories.map((c) => (
          <div key={c.key} className="flex items-center gap-2">
            <span className="w-56 shrink-0 text-sm text-fg">{c.label}</span>
            <select
              value={routeFor(c.key)}
              onChange={(e) => (e.target.value ? setRoute.mutate({ category: c.key, nodeId: e.target.value }) : clearRoute.mutate(c.key))}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
            >
              <option value="">— normal box —</option>
              {org?.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Editable Terms of Service + Privacy Policy. Saving bumps the version → everyone re-accepts on next login.
function LegalEditor() {
  const { data } = useLegal();
  const save = useSaveLegal();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setDraft({ TOS: data.docs.TOS?.body ?? "", PRIVACY: data.docs.PRIVACY?.body ?? "" }); }, [data?.docs.TOS?.version, data?.docs.PRIVACY?.version]);
  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-fg">Terms & Privacy</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">Edit your Terms of Service and Privacy Policy. Saving a change bumps the version and prompts everyone to accept it the next time they log in.</p>
      <div className="space-y-4">
        {(["TOS", "PRIVACY"] as const).map((k) => {
          const cur = data?.docs[k];
          const dirty = (draft[k] ?? "") !== (cur?.body ?? "");
          return (
            <div key={k}>
              <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold text-fg">{LEGAL_TITLES[k]}</span>{cur && <span className="text-[11px] text-muted">v{cur.version}</span>}</div>
              <textarea value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} rows={5} placeholder={`Paste your ${LEGAL_TITLES[k]} text…`} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <div className="mt-1 flex items-center gap-3">
                <Button variant="subtle" disabled={!dirty || !(draft[k] ?? "").trim() || save.isPending} onClick={() => save.mutate({ kind: k, body: (draft[k] ?? "").trim() })}>{cur ? "Save & re-prompt everyone" : "Publish"}</Button>
                {!dirty && cur && <span className="text-xs text-emerald-600">Saved</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// AI: bring-your-own-key config + token caps + a usage/cost dashboard.
function AiSettingsCard() {
  const { data: s } = useAiSettings();
  const { data: u } = useAiUsage();
  const save = useSaveAiSettings();
  const [key, setKey] = useState("");
  if (!s) return null;
  const providerModels = s.models.filter((m) => m.provider === s.provider);
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">AI assistant</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${!s.keySet ? "bg-border text-muted" : s.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {!s.keySet ? "No key — inactive" : s.enabled ? "● Active" : "Off"}
        </span>
      </div>
      <p className="mb-3 mt-0.5 text-sm text-muted">Bring your own provider key — your organisation pays for its own usage (the vendor never does). Caps keep token spend bounded. The ✨ Ask AI button only appears for everyone once this is <b>active</b> (enabled <i>and</i> a key saved).</p>

      <label className="mb-3 flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={s.enabled} disabled={save.isPending || !s.keySet} onChange={(e) => save.mutate({ enabled: e.target.checked })} />
        <span><span className="text-sm font-semibold text-fg">Enable AI</span><p className="text-sm text-muted">{s.keySet ? "Turns the assistant on for everyone in the workspace." : "Save an API key below first — then this switches on."}</p></span>
      </label>

      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
        <label className="text-sm"><span className="text-xs font-medium text-muted">Provider</span>
          <select value={s.provider} onChange={(e) => save.mutate({ provider: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI (GPT)</option><option value="gemini">Google (Gemini)</option>
          </select>
        </label>
        <label className="text-sm"><span className="text-xs font-medium text-muted">Model</span>
          <select value={s.model} onChange={(e) => save.mutate({ model: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {providerModels.map((m) => <option key={m.model} value={m.model}>{m.label} — ${m.inUsd}/${m.outUsd} per 1M</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2"><span className="text-xs font-medium text-muted">{s.keySet ? "Replace API key" : "API key"}</span>
          <span className="mt-1 flex gap-2">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.keySet ? "•••••••• (saved)" : "paste your provider key"} className="flex-1" />
            <Button variant="subtle" disabled={!key.trim() || save.isPending} onClick={() => save.mutate({ apiKey: key.trim() }, { onSuccess: () => setKey("") })}>Save key</Button>
            {s.keySet && <Button variant="ghost" onClick={() => save.mutate({ apiKey: "", enabled: false })}>Clear</Button>}
          </span>
        </label>
        <label className="text-sm"><span className="text-xs font-medium text-muted">Weekly token cap (0 = unlimited)</span>
          <Input type="number" defaultValue={String(s.weeklyTokenCap)} onBlur={(e) => save.mutate({ weeklyTokenCap: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1" />
        </label>
        <label className="text-sm"><span className="text-xs font-medium text-muted">Per-user daily cap (0 = unlimited)</span>
          <Input type="number" defaultValue={String(s.perUserDailyCap)} onBlur={(e) => save.mutate({ perUserDailyCap: Math.max(0, parseInt(e.target.value) || 0) })} className="mt-1" />
        </label>
      </div>

      {u && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted/70">Usage & estimated cost</h3>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
            <span><b className="text-fg">${u.weekCost}</b> <span className="text-muted">this week</span></span>
            <span><b className="text-fg">${u.monthCost}</b> <span className="text-muted">last 30 days</span></span>
            {u.weeklyTokenCap > 0 && <span className="flex items-center gap-2 text-xs text-muted">{u.weekTokens.toLocaleString()}/{u.weeklyTokenCap.toLocaleString()} tokens<span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-border"><span className="block h-full bg-primary" style={{ width: `${u.weekPct}%` }} /></span>{u.weekPct}%</span>}
            <span className="text-[11px] text-muted/70">estimates</span>
          </div>
          {u.topUsers.length > 0 && (
            <div className="mt-2 text-xs text-muted">Top users: {u.topUsers.slice(0, 5).map((t) => `${t.name} (${t.tokens.toLocaleString()} tok · $${t.cost})`).join(" · ")}</div>
          )}
        </div>
      )}
    </Card>
  );
}

// White-label vocabulary: rename the nouns to match the org's culture (points → "Coins" etc.).
function Terminology() {
  const { data: settings } = useTenantSettings();
  const save = useSetBranding();
  const [terms, setTerms] = useState<Record<string, string>>({});
  useEffect(() => { if (settings) setTerms(settings.terms ?? {}); }, [settings?.terms]);
  const dirty = !!settings && JSON.stringify(terms) !== JSON.stringify(settings.terms ?? {});
  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-fg">Terminology</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">Rename things to match how your team talks. Leave blank to keep the default.</p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {Object.keys(TERM_DEFAULTS).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">{TERM_LABELS[k]}</span>
            <Input value={terms[k] ?? ""} onChange={(e) => setTerms({ ...terms, [k]: e.target.value })} placeholder={TERM_DEFAULTS[k]} maxLength={30} className="w-36" />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => save.mutate({ terms })} disabled={!dirty || save.isPending}>Save terminology</Button>
        {!dirty && save.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
    </Card>
  );
}

// Per-tenant branding: workspace name, an accent colour (re-tints the whole app), and an optional
// wordmark emoji. The colour previews live as you click before it's even saved.
function Branding() {
  const { data: settings } = useTenantSettings();
  const save = useSetBranding();
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [emoji, setEmoji] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [welcome, setWelcome] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setName(settings.name ?? "");
    setColor(settings.brandColor ?? "blue");
    setEmoji(settings.brandEmoji ?? "");
    setLogo(settings.brandLogoUrl ?? null);
    setWelcome(settings.welcomeMessage ?? "");
  }, [settings?.name, settings?.brandColor, settings?.brandEmoji, settings?.brandLogoUrl, settings?.welcomeMessage]);

  // If they previewed a colour but navigate away without saving, restore the saved accent.
  useEffect(() => () => { if (settings?.brandColor) applyBrandColor(settings.brandColor); }, [settings?.brandColor]);
  const pickColor = (key: string) => { setColor(key); applyBrandColor(key); }; // live preview
  const dirty = !!settings && (name.trim() !== settings.name || color !== settings.brandColor || (emoji || null) !== (settings.brandEmoji ?? null) || (logo || null) !== (settings.brandLogoUrl ?? null) || (welcome.trim() || null) !== (settings.welcomeMessage ?? null));
  const submit = () => { if (name.trim()) save.mutate({ name: name.trim(), brandColor: color, brandEmoji: emoji || null, brandLogoUrl: logo, welcomeMessage: welcome.trim() || null }); };

  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-fg">Branding</h2>
      <p className="mb-3 mt-0.5 text-sm text-muted">Make this workspace feel like yours — it shows in the sidebar and tints the whole app.</p>
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted">Workspace name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Acme Corp" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted">Logo</label>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </div>
          {emoji && <button onClick={() => setEmoji("")} className="pb-2.5 text-xs text-muted hover:text-fg">Remove</button>}
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Accent colour</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {BRAND_COLORS.map((c) => (
              <button key={c.key} onClick={() => pickColor(c.key)} title={c.label} aria-label={c.label}
                className="h-8 w-8 rounded-full transition"
                style={{ backgroundColor: `hsl(${c.hue} 65% 45%)`, boxShadow: color === c.key ? `0 0 0 2px hsl(var(--surface)), 0 0 0 4px hsl(${c.hue} 65% 45%)` : undefined }} />
            ))}
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <label className="text-xs font-medium text-muted">Logo image (optional — replaces the emoji + name in the sidebar)</label>
          <div className="mt-1 flex items-center gap-3">
            {logo && <img src={logo} alt="logo" className="max-h-8 max-w-[160px] rounded object-contain" />}
            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { setLogo((await uploadImage(f)).url); } finally { setUploading(false); } }} className="text-xs" />
            {uploading && <span className="text-xs text-muted">Uploading…</span>}
            {logo && <button onClick={() => setLogo(null)} className="text-xs text-muted hover:text-red-600">Remove</button>}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Welcome message (shown on the dashboard)</label>
          <textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={280} rows={2} placeholder="e.g. Welcome to the Acme team hub! 🎉" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 border-t border-border pt-3 text-sm">
          <input type="checkbox" checked={settings?.footerCredit !== false} disabled={!settings || save.isPending} onChange={(e) => save.mutate({ footerCredit: e.target.checked })} />
          <span className="text-fg">Show <span className="text-muted">“© {new Date().getFullYear()} {settings?.name || "CES"} · version”</span> in the footer</span>
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={!dirty || !name.trim() || save.isPending}>Save branding</Button>
          {dirty ? <span className="text-xs text-muted">Accent previews live; Save to keep it for everyone.</span> : save.isSuccess && <span className="text-xs text-emerald-600">Saved</span>}
          {dirty && settings && <button onClick={() => { setName(settings.name); setColor(settings.brandColor); setEmoji(settings.brandEmoji ?? ""); setLogo(settings.brandLogoUrl ?? null); setWelcome(settings.welcomeMessage ?? ""); applyBrandColor(settings.brandColor); }} className="text-xs text-muted hover:text-fg">Reset</button>}
        </div>
      </div>
    </Card>
  );
}
