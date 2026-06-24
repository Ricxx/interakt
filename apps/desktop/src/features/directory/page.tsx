import { useMemo, useState } from "react";
import { useDirectory } from "../../lib/directory";
import { useTenantSettings } from "../../lib/tenant";
import { useOpenProfile } from "../profile/overlay";
import { PageHeader } from "../../ui/page-header";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { Avatar } from "../../ui/avatar";

export function DirectoryPage() {
  const { data, isLoading } = useDirectory();
  const { data: tenant } = useTenantSettings();
  const openProfile = useOpenProfile();
  const showPics = tenant?.profilePicsEnabled !== false;
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");

  const people = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => {
      if (dept && p.nodeId !== dept) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || (p.jobTitle ?? "").toLowerCase().includes(term) || (p.dept ?? "").toLowerCase().includes(term);
    });
  }, [data, q, dept]);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Directory" subtitle="Find a colleague — search by name, role or department." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
          <option value="">All departments</option>
          {data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="text-sm text-muted">{people.length} {people.length === 1 ? "person" : "people"}</span>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {data && people.length === 0 && <Card><p className="text-sm text-muted">No one matches that search.</p></Card>}
      <div className="grid gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <button key={p.id} onClick={() => openProfile(p.id)} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left shadow-sm hover:border-primary/40 hover:bg-primary/5">
            <Avatar name={p.name} url={showPics ? p.avatarUrl : null} size={44} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.flair ? `${p.flair} ` : ""}{p.name}</div>
              <div className="truncate text-sm text-muted">{p.jobTitle || p.statusText || (p.dept ?? "—")}</div>
              {p.jobTitle && p.dept && <div className="truncate text-xs text-muted">{p.dept}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
