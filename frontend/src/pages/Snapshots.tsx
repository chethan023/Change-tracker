import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Masthead,
  Icon,
  IconButton,
  StatCard,
  SearchShell,
  EmptyState,
  absTime,
  relTime,
} from "../ui/primitives";
import { fetchSnapshots } from "../lib/api";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { Snapshot } from "../lib/types";

const PAGE_SIZE = 50;

function statusBadge(s: Snapshot) {
  const ok = s.status === "ok" || s.status === "parsed";
  const error = s.status === "error" || s.status === "failed";
  return (
    <span
      className="badge"
      style={{
        background: ok ? "var(--success-soft)" : error ? "var(--danger-soft)" : "var(--warning-soft)",
        color: ok ? "var(--success-fg)" : error ? "var(--danger-fg)" : "var(--warning-fg)",
      }}
    >
      <span
        className="badge-dot"
        style={{
          background: ok ? "var(--success)" : error ? "var(--danger)" : "var(--warning)",
        }}
      />
      {ok ? "Parsed" : error ? "Failed" : s.status.charAt(0).toUpperCase() + s.status.slice(1)}
    </span>
  );
}

export default function Snapshots() {
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Snapshot | null>(null);
  const debouncedQ = useDebouncedValue(q, 350);

  const {
    data, isLoading, isFetching, isFetchingNextPage,
    hasNextPage, fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["snapshots", debouncedQ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchSnapshots(
        {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(debouncedQ ? { search: debouncedQ } : {}),
        },
        signal,
      ),
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
    // First page polls so the dashboard reflects new ingests; deeper pages
    // are static history and don't need to refetch on an interval.
    refetchInterval: 30_000,
  });

  const list = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p?.items ?? []),
    [data],
  );

  // Parse rate is computed across loaded rows only — labelled as such if we
  // wanted to be picky, but it's a directional metric that converges fast.
  const parseRate = useMemo(() => {
    const total = list.reduce((s, x) => s + x.records_parsed, 0);
    const changed = list.reduce((s, x) => s + x.records_changed, 0);
    if (total === 0) return "—";
    return `${((changed / total) * 100).toFixed(1)}%`;
  }, [list]);

  // Best-effort prefetch of page 2 once the first page lands.
  useEffect(() => {
    if (data?.pages?.length === 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [data?.pages?.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="fade-in">
      <Masthead
        eyebrow="STEP OIEP"
        title="Ingest history"
        subtitle="Every STEPXML payload received, parsed and diffed."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <StatCard label="Loaded payloads" value={list.length} />
        <StatCard label="Change yield" value={parseRate} tone="up" />
        <StatCard
          label="Latest"
          value={list[0] ? relTime(list[0].received_at) : "—"}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <SearchShell
          value={q}
          onChange={setQ}
          placeholder="Search snapshot ID, hash or week…"
        />
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-tertiary)" }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading snapshots…
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="archive"
          title={debouncedQ ? "No snapshots match" : "No snapshots yet"}
          body={
            debouncedQ
              ? "Try a different search term."
              : "When STEP OIEP sends a STEPXML payload, it will appear here."
          }
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
         <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Ingested</th>
                <th>Week</th>
                <th>Parsed</th>
                <th>Changed</th>
                <th>Hash</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setDetail(s)}>
                  <td>
                    <code className="mono" style={{ color: "var(--fg)" }}>S-{s.id}</code>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{relTime(s.received_at)}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>
                      {absTime(s.received_at)}
                    </div>
                  </td>
                  <td>
                    {s.snapshot_week ? (
                      <span className="badge" style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}>
                        {s.snapshot_week}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg-quaternary)" }}>—</span>
                    )}
                  </td>
                  <td className="tabular">{s.records_parsed.toLocaleString()}</td>
                  <td className="tabular">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{s.records_changed}</span>
                      <div className="progress" style={{ width: 60 }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${
                              s.records_parsed > 0
                                ? Math.min(100, (s.records_changed / s.records_parsed) * 100)
                                : 0
                            }%`,
                            background:
                              s.records_changed > 0 ? "var(--accent)" : "var(--fg-tertiary)",
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5, color: "var(--fg-tertiary)" }}>
                    {s.file_hash ? s.file_hash.slice(0, 12) + "…" : "—"}
                  </td>
                  <td>{statusBadge(s)}</td>
                  <td>
                    <Icon name="chevron-right" size={14} color="var(--fg-tertiary)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
         <div
           style={{
             display: "flex", alignItems: "center", justifyContent: "space-between",
             padding: "10px 14px",
             borderTop: "1px solid var(--border-subtle)",
             background: "var(--bg-elevated)",
           }}
         >
           <div style={{ fontSize: 12.5, color: "var(--fg-tertiary)" }}>
             {list.length.toLocaleString()} loaded
             {isFetching && !isFetchingNextPage && (
               <span style={{ marginLeft: 8 }} className="spinner" />
             )}
           </div>
           {hasNextPage ? (
             <button
               type="button"
               className="btn btn-secondary btn-sm"
               onClick={() => fetchNextPage()}
               disabled={isFetchingNextPage}
             >
               {isFetchingNextPage ? (
                 <><span className="spinner" /> Loading…</>
               ) : (
                 <>Load more <Icon name="chevron-down" size={13} /></>
               )}
             </button>
           ) : (
             <span style={{ fontSize: 12.5, color: "var(--fg-quaternary)" }}>
               End of list
             </span>
           )}
         </div>
        </div>
      )}

      {detail && <SnapshotDetail snap={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SnapshotDetail({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          boxShadow: "var(--shadow-lg)",
          animation: "modal-in 280ms var(--ease-spring)",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontFamily: "var(--font-mono)" }}>
                S-{snap.id}
              </h3>
              {statusBadge(snap)}
            </div>
            <div
              style={{ marginTop: 4, fontSize: 12.5, color: "var(--fg-tertiary)" }}
              className="mono"
            >
              {snap.file_hash || "hash pending"}
            </div>
          </div>
          <IconButton icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <DetailRow label="Ingested" value={absTime(snap.received_at)} />
          <DetailRow label="Week" value={snap.snapshot_week || "—"} />
          <DetailRow label="Records parsed" value={snap.records_parsed.toLocaleString()} />
          <DetailRow label="Records changed" value={snap.records_changed.toLocaleString()} />
          <DetailRow label="SHA-256" value={snap.file_hash || "—"} mono />
          <DetailRow label="Status" value={snap.status} />
        </div>
        {snap.error_log && (
          <div
            style={{
              margin: "0 24px 20px",
              padding: 14,
              background: "var(--danger-soft)",
              color: "var(--danger-fg)",
              borderRadius: 10,
              fontSize: 13,
              display: "flex",
              gap: 10,
            }}
          >
            <Icon name="alert-triangle" size={18} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Errors</div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {snap.error_log}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label-sm" style={{ marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 14,
          color: "var(--fg)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-text)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
