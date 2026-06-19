import { useNavigate } from "react-router-dom";
import { Card } from "../../ui/card";
import { PageHeader } from "../../ui/page-header";
import { timezones, useSetProfilePics, useSetTimezone, useSetUsageLog, useTenantSettings } from "../../lib/tenant";

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
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Configure how this workspace is organized and governed." />

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
