import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchChanges, exportCsvUrl } from "../lib/api";
import type { ChangeRecord } from "../lib/types";
import FilterBar, { Filters } from "../components/FilterBar";
import ChangeGrid from "../components/ChangeGrid";
import DiffModal from "../components/DiffModal";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/auth";

const PAGE_SIZE = 50;

export default function Dashboard() {
  const canExport = useAuth((s) => s.isEditor());
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ChangeRecord | null>(null);

  const queryParams = { ...filters, page, page_size: PAGE_SIZE };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["changes", queryParams],
    queryFn: ({ signal }) => fetchChanges(queryParams, signal),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const items = data?.items || [];
  // Backend only returns `total` on page 1 — cache it so paginated views can
  // still display the headline count.
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  useEffect(() => {
    if (typeof data?.total === "number") setKnownTotal(data.total);
  }, [data?.total]);
  useEffect(() => {
    setKnownTotal(null);
  }, [JSON.stringify(filters)]);

  const total = knownTotal;
  const hasMore = data?.has_more ?? false;
  const totalPages =
    total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
  const showingFrom = items.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = (page - 1) * PAGE_SIZE + items.length;

  // Prefetch the next page so pagination feels instant.
  useEffect(() => {
    if (!hasMore) return;
    const nextParams = { ...filters, page: page + 1, page_size: PAGE_SIZE };
    queryClient.prefetchQuery({
      queryKey: ["changes", nextParams],
      queryFn: ({ signal }) => fetchChanges(nextParams, signal),
      staleTime: 30_000,
    });
  }, [hasMore, page, filters, queryClient]);

  // Reset to page 1 when filters change
  const handleFilterChange = (next: Filters) => {
    setFilters(next);
    setPage(1);
  };

  return (
    <>
      {/* ── Headline / stat strip ───────────────────────────── */}
      <section className="mb-6 flex items-end justify-between border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
            the record
          </p>
          <h1 className="font-serif text-4xl font-semibold text-ink leading-none mt-1">
            All Changes
          </h1>
        </div>
        <div className="flex items-end gap-8 font-mono">
          <Stat label="Total" value={total !== null ? total.toLocaleString() : "—"} />
          <Stat label="Showing" value={`${showingFrom}–${showingTo}`} />
          <Stat
            label="Page"
            value={totalPages !== null ? `${page} / ${totalPages}` : `${page}`}
          />
        </div>
      </section>

      {/* ── Filters ────────────────────────────────────────── */}
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* ── Toolbar (export + status) ──────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
          {isFetching && !isLoading ? (
            <span className="text-amber-900">⦿ refreshing…</span>
          ) : total !== null ? (
            `${total.toLocaleString()} record${total === 1 ? "" : "s"}`
          ) : (
            `${items.length} on this page`
          )}
        </div>
        {canExport && (
          <a
            href={exportCsvUrl(filters)}
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-ink bg-surface font-mono text-[10px] uppercase tracking-widest hover:bg-ink hover:text-paper transition shadow-sharp hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          >
            <Download size={12} /> export csv
          </a>
        )}
      </div>

      {/* ── Grid ───────────────────────────────────────────── */}
      <ChangeGrid
        rows={items}
        onRowClick={setSelected}
        loading={isLoading}
      />

      {/* ── Pagination ─────────────────────────────────────── */}
      {(page > 1 || hasMore) && (
        <nav className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 border-2 border-ink font-mono text-[10px] uppercase tracking-widest transition",
              page === 1
                ? "opacity-30 cursor-not-allowed"
                : "bg-surface hover:bg-ink hover:text-paper shadow-sharp hover:shadow-none hover:translate-x-1 hover:translate-y-1"
            )}
          >
            <ChevronLeft size={12} /> prev
          </button>

          <div className="font-mono text-xs text-ink/60">
            {totalPages !== null ? `page ${page} of ${totalPages}` : `page ${page}`}
          </div>

          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 border-2 border-ink font-mono text-[10px] uppercase tracking-widest transition",
              !hasMore
                ? "opacity-30 cursor-not-allowed"
                : "bg-surface hover:bg-ink hover:text-paper shadow-sharp hover:shadow-none hover:translate-x-1 hover:translate-y-1"
            )}
          >
            next <ChevronRight size={12} />
          </button>
        </nav>
      )}

      {/* ── Diff modal ─────────────────────────────────────── */}
      <DiffModal record={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/40">
        {label}
      </div>
      <div className="font-serif text-2xl text-ink leading-none mt-0.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}
