import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { fetchSnapshots } from "../lib/api";
import type { Snapshot } from "../lib/types";
import { absTime, cn, relTime, truncate } from "../lib/utils";

export default function Snapshots() {
  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["snapshots"],
    queryFn: fetchSnapshots,
    refetchInterval: 5000, // auto-refresh to catch running ingests
  });

  const rows = snapshots || [];

  return (
    <>
      {/* ── Headline ────────────────────────────────────────── */}
      <section className="mb-6 flex items-end justify-between border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
            the feed
          </p>
          <h1 className="font-serif text-4xl font-semibold text-ink leading-none mt-1">
            Ingest History
          </h1>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/40">
          auto-refreshing every 5s
        </div>
      </section>

      {/* ── Explanation ─────────────────────────────────────── */}
      <p className="font-serif text-base text-ink/70 italic mb-6 max-w-2xl">
        Each row is a STEPXML payload received from STIBO STEP. The diff engine
        processes them in the background; status updates in real time.
      </p>

      {/* ── Grid ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-surface border-2 border-ink shadow-sharp p-12 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-ink/40">
            loading history…
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-surface border-2 border-ink shadow-sharp p-16 text-center">
          <p className="font-serif text-xl text-ink/60 italic">
            No ingests yet.
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink/40">
            POST a STEPXML payload to /api/v1/ingest to get started
          </p>
        </div>
      ) : (
        <div className="bg-surface border-2 border-ink shadow-sharp overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-ink bg-ink text-paper">
                <Th>#</Th>
                <Th>Received</Th>
                <Th>Status</Th>
                <Th>Records Parsed</Th>
                <Th>Records Changed</Th>
                <Th>Week</Th>
                <Th>File Hash</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, idx) => (
                <SnapshotRow key={s.id} snapshot={s} alt={idx % 2 === 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SnapshotRow({ snapshot, alt }: { snapshot: Snapshot; alt: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-ink/10 hover:bg-paper transition-colors align-top",
        alt && "bg-paper-100/40"
      )}
    >
      <td className="px-4 py-3 font-mono text-[11px] text-ink/60">#{snapshot.id}</td>
      <td className="px-4 py-3">
        <div className="font-mono text-[11px] leading-tight">
          <div className="text-ink">{relTime(snapshot.received_at)}</div>
          <div className="text-ink/40 text-[10px]">{absTime(snapshot.received_at)}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusChip status={snapshot.status} />
        {snapshot.error_log && (
          <div className="mt-1 font-mono text-[10px] text-rose border-l-2 border-rose pl-2">
            {truncate(snapshot.error_log, 60)}
          </div>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-ink tabular-nums">
        {snapshot.records_parsed.toLocaleString()}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-ink tabular-nums">
        {snapshot.records_changed > 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber bg-amber-50 text-amber-900 text-xs font-mono uppercase tracking-wider">
            {snapshot.records_changed}
          </span>
        ) : (
          <span className="text-ink/30">0</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-[11px] text-ink/60">
        {snapshot.snapshot_week || "—"}
      </td>
      <td className="px-4 py-3 font-mono text-[10px] text-ink/40">
        {snapshot.file_hash ? snapshot.file_hash.slice(0, 12) + "…" : "—"}
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; Icon: typeof Clock; cls: string }> = {
    queued:     { label: "queued",     Icon: Clock,       cls: "border-amber text-amber-900 bg-amber-50" },
    processing: { label: "processing", Icon: Loader2,     cls: "border-brand text-brand bg-brand-50" },
    completed:  { label: "done",       Icon: CheckCircle2, cls: "border-sage text-sage bg-sage-50" },
    failed:     { label: "failed",     Icon: XCircle,     cls: "border-rose text-rose bg-rose-50" },
  };
  const c = cfg[status] || cfg.queued;
  return (
    <span className={cn("chip", c.cls)}>
      <c.Icon size={10} className={status === "processing" ? "animate-spin" : ""} />
      {c.label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em]">
      {children}
    </th>
  );
}
