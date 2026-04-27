import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Masthead,
  StatCard,
  Button,
  Sparkline,
  EmptyState,
  relTime,
} from "../ui/primitives";
import { Link } from "react-router-dom";
import { FilterPanel, ChangeTable, type Filters } from "../ui/ChangeList";
import { useAppShell } from "../ui/shell";
import { useAuth } from "../lib/auth";
import { toast } from "../ui/toast";
import {
  fetchChanges,
  fetchFilterOptions,
  fetchSnapshots,
  exportCsvUrl,
} from "../lib/api";
import type { ChangeRecord } from "../lib/types";

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({});
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const openDiff = useAppShell((s) => s.openDiff);
  const diffOpen = useAppShell((s) => !!s.diffRecord);
  const cmdOpen = useAppShell((s) => s.commandOpen);
  // CSV export hits an editor-gated endpoint server-side (changes.py) — hide
  // the button for viewers so the surface matches the permission they have.
  const canExport = useAuth((s) => s.isEditor());

  const { data: options } = useQuery({ queryKey: ["filter-options"], queryFn: fetchFilterOptions });

  // Dashboard is a snapshot — small page so the screen reads quickly.
  // The dedicated `/changes` page provides the paginated full list.
  const DASHBOARD_PAGE_SIZE = 25;
  const { data: page, isLoading } = useQuery({
    queryKey: ["changes", "dashboard", filters],
    queryFn: ({ signal }) =>
      fetchChanges(
        {
          page: 1,
          page_size: DASHBOARD_PAGE_SIZE,
          ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        },
        signal
      ),
  });

  const { data: snapshots } = useQuery({
    queryKey: ["snapshots"],
    queryFn: fetchSnapshots,
    refetchInterval: 60_000,
    // Skip polling when the tab is hidden — saves API roundtrips and the DB
    // hit each minute for users who keep the dashboard open in the background.
    refetchIntervalInBackground: false,
  });

  const rows = page?.items || [];

  useEffect(() => {
    if (diffOpen || cmdOpen) return;
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (rows.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = rows.findIndex((r) => r.id === focusedId);
        const next = rows[Math.min(i + 1, rows.length - 1)];
        if (next) setFocusedId(next.id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = rows.findIndex((r) => r.id === focusedId);
        const next = rows[Math.max(i - 1, 0)];
        if (next) setFocusedId(next.id);
      } else if (e.key === "Enter" && focusedId != null) {
        const r = rows.find((x) => x.id === focusedId);
        if (r) openDiff(r, rows);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [rows, focusedId, diffOpen, cmdOpen, openDiff]);

  // Stats are scoped to the rows currently loaded in the table — the labels
  // explicitly say "in current view" so the user isn't misled. The "All events"
  // stat uses the full server-side count when available.
  const stats = useMemo(() => {
    const now = Date.now();
    const last24 = rows.filter(
      (r) => now - new Date(r.change_date + "Z").getTime() < 86_400_000
    ).length;
    const uniqueProducts = new Set(rows.map((r) => r.step_product_id)).size;
    return {
      total: page?.total ?? rows.length,
      last24,
      products: uniqueProducts,
      contributors: new Set(rows.map((r) => r.changed_by).filter(Boolean)).size,
    };
  }, [rows, page?.total]);

  // Real ingest activity over the last 24h, derived from snapshots that
  // actually completed in that window. Drives the "ingests · 24 h" badge.
  const ingestsLast24 = useMemo(() => {
    const cutoff = Date.now() - 86_400_000;
    return (snapshots || []).filter(
      (s) => new Date(s.received_at + "Z").getTime() >= cutoff,
    ).length;
  }, [snapshots]);

  // Real per-hour ingest volume across the last 24h. If everything is zero
  // we return an empty array so consumers can render an explicit "no activity"
  // state instead of a misleading flat line.
  const ingestSeries = useMemo(() => {
    const buckets = new Array(24).fill(0);
    const now = Date.now();
    (snapshots || []).forEach((s) => {
      const ts = new Date(s.received_at + "Z").getTime();
      const hoursAgo = Math.floor((now - ts) / 3_600_000);
      if (hoursAgo >= 0 && hoursAgo < 24) {
        buckets[23 - hoursAgo] += s.records_changed || 0;
      }
    });
    return buckets.some((x) => x > 0) ? buckets : [];
  }, [snapshots]);

  const typeVolume = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.change_element_type, (m.get(r.change_element_type) || 0) + 1));
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  }, [rows]);

const onExport = () => {
  const url = exportCsvUrl({ ...filters });

  const link = document.createElement("a");
  link.href = url;
  link.download = "export.csv"; // optional filename
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast({
    tone: "info",
    title: "Export started",
    body: "Your CSV download will begin shortly."
  });
};


  return (
    <div className="fade-in">
      <Masthead
        eyebrow="The record · STEPXML feed"
        title="Recent changes"
        subtitle={
          <>
            {(page?.total ?? rows.length).toLocaleString()} event
            {(page?.total ?? rows.length) === 1 ? "" : "s"} total ·
            showing the latest {DASHBOARD_PAGE_SIZE}
          </>
        }
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link to="/changes" className="btn btn-ghost btn-sm">
              View all changes →
            </Link>
            {canExport && (
              <Button variant="secondary" className="btn-secondary" size="sm" icon="download" onClick={onExport}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <StatCard
          label="All events"
          value={(page?.total ?? rows.length).toLocaleString()}
          delta={page?.total != null ? `${rows.length} loaded` : "loaded count"}
          spark={ingestSeries.length > 0 ? ingestSeries : undefined}
        />
        <StatCard
          label="Ingests · 24 h"
          value={ingestsLast24}
          delta={ingestsLast24 ? "completed payloads" : "no activity"}
        />
        <StatCard label="Products in view"  value={stats.products}     delta={`from ${rows.length} loaded`} />
        <StatCard label="Contributors in view" value={stats.contributors} delta={`from ${rows.length} loaded`} />
      </div>

      <div className="dash-grid">
        <div style={{ minWidth: 0 }}>
          <FilterPanel filters={filters} setFilters={setFilters} options={options} />
          {isLoading ? (
            <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-tertiary)" }}>
              <span className="spinner" style={{ marginRight: 8 }} /> Loading changes…
            </div>
          ) : rows.length > 0 ? (
            <ChangeTable
              rows={rows}
              onRowClick={(r: ChangeRecord) => openDiff(r, rows)}
              focusedId={focusedId}
            />
          ) : (
            <EmptyState
              icon="search-x"
              title="No changes match the current filter"
              body="Try broadening the query, or wait for the next STEPXML payload."
              action={
                <button className="btn btn-secondary btn-sm" onClick={() => setFilters({})}>
                  Clear filters
                </button>
              }
            />
          )}
        </div>

        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            position: "sticky",
            top: 76,
          }}
        >
          <IntegrationHealth
            ingestSeries={ingestSeries}
            totalToday={(snapshots || []).filter(
              (s) => Date.now() - new Date(s.received_at + "Z").getTime() < 86_400_000
            ).length}
            latest={snapshots?.[0]}
          />
          {typeVolume.length > 0 && <TypeBreakdown data={typeVolume} />}
          <RecentSnapshots snapshots={(snapshots || []).slice(0, 4)} />
        </aside>
      </div>
    </div>
  );
}

function IntegrationHealth({
  ingestSeries,
  totalToday,
  latest,
}: {
  ingestSeries: number[];
  totalToday: number;
  latest?: { received_at: string };
}) {
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 2 }}>Integration</div>
          <h4 style={{ margin: 0, fontSize: 15 }}>STEP OIEP health</h4>
        </div>
        <span
          className="badge"
          style={{
            background: latest ? "var(--success-soft)" : "var(--bg-muted)",
            color: latest ? "var(--success-fg)" : "var(--fg-secondary)",
          }}
        >
          <span
            className="badge-dot"
            style={{ background: latest ? "var(--success)" : "var(--fg-tertiary)" }}
          />
          {latest ? "Healthy" : "Idle"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Last ingest" value={latest ? relTime(latest.received_at) : "—"} />
        <Stat label="Payloads · 24h" value={String(totalToday)} />
      </div>
      <div>
        <div className="label-sm" style={{ marginBottom: 6 }}>Ingests · 24 h</div>
        <Sparkline data={ingestSeries} w={280} h={36} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-sm" style={{ fontSize: 10 }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.014em",
          fontVariantNumeric: "tabular-nums",
          color: "var(--fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const FAMILY_COLOR: Record<string, string> = {
  add: "var(--change-add)",
  modify: "var(--change-modify)",
  remove: "var(--change-remove)",
  move: "var(--change-move)",
  suppress: "var(--change-suppress)",
};

function familyOf(type: string): keyof typeof FAMILY_COLOR {
  if (/CREATED|ADDED|LINKED/.test(type)) return "add";
  if (/DELETED|REMOVED|UNLINKED/.test(type)) return "remove";
  if (/RECLASSIFIED|TYPE_CHANGED/.test(type)) return "move";
  if (/SUPPRESSED/.test(type)) return "suppress";
  return "modify";
}

function TypeBreakdown({ data }: { data: { type: string; count: number }[] }) {
  const max = Math.max(...data.map((t) => t.count), 1);
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 2 }}>Activity</div>
        <h4 style={{ margin: 0, fontSize: 15 }}>Change types · current view</h4>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((t) => (
          <div
            key={t.type}
            style={{ display: "grid", gridTemplateColumns: "1fr 28px", gap: 10, alignItems: "center" }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--fg-secondary)",
                  marginBottom: 3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {t.type.toLowerCase().replace(/_/g, " ")}
              </div>
              <div
                style={{
                  height: 4,
                  background: "var(--bg-muted)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(t.count / max) * 100}%`,
                    background: FAMILY_COLOR[familyOf(t.type)],
                    borderRadius: 999,
                    transition: "width 600ms",
                  }}
                />
              </div>
            </div>
            <div
              className="tabular"
              style={{ fontSize: 12, color: "var(--fg-tertiary)", textAlign: "right" }}
            >
              {t.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentSnapshots({
  snapshots,
}: {
  snapshots: { id: number; received_at: string; status: string; records_changed: number }[];
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h4 style={{ margin: 0, fontSize: 15 }}>Recent ingests</h4>
        <a href="/snapshots" style={{ fontSize: 12, color: "var(--accent)" }}>View all</a>
      </div>
      {snapshots.length === 0 && (
        <div style={{ padding: "14px 0", color: "var(--fg-tertiary)", fontSize: 12.5 }}>
          No ingests yet.
        </div>
      )}
      {snapshots.map((s, i) => (
        <div
          key={s.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 0",
            borderBottom:
              i === snapshots.length - 1 ? "none" : "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="badge-dot"
            style={{
              background:
                s.status === "ok" || s.status === "parsed"
                  ? "var(--success)"
                  : s.status === "error"
                  ? "var(--danger)"
                  : "var(--warning)",
              width: 7,
              height: 7,
            }}
          />
          <code className="mono" style={{ fontSize: 12, color: "var(--fg)" }}>
            S-{s.id}
          </code>
          <span style={{ flex: 1, fontSize: 12, color: "var(--fg-tertiary)" }}>
            {relTime(s.received_at)}
          </span>
          <span className="tabular" style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
            {s.records_changed} changes
          </span>
        </div>
      ))}
    </div>
  );
}
