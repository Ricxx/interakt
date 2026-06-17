import { useNavigate } from "react-router-dom";
import { Card } from "../../ui/card";
import { PageHeader } from "../../ui/page-header";

// A small admin hub for configuration that doesn't need its own top-level nav item.
// Each entry links to an existing page; add rows here as more settings appear.
const SETTINGS = [
  { to: "/org", title: "Organization structure", desc: "Divisions, departments and units that scope everything." },
  { to: "/audit", title: "Audit log", desc: "Tamper-evident record of privileged actions." },
];

export function SettingsPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Configure how this workspace is organized and governed." />
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
