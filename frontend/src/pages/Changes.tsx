/**
 * /changes — comprehensive paginated list of every change record.
 *
 * The Dashboard shows a snapshot (latest 25); this page is the full record
 * with explicit Prev/Next pagination. Filters mirror the dashboard's so the
 * whole filter UI is reused as-is.
 *
 * Pagination strategy: backend returns `total` only on page 1 (cost reasons)
 * and `has_more` on every page. We keep the page-1 total around in state so
 * we can still display "Page X of Y" while flipping pages.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Masthead, Button, Icon, EmptyState,
} from "../ui/primitives";
import { FilterPanel, ChangeTable, type Filters } from "../ui/ChangeList";
import { useAppShell } from "../ui/shell";
import { useAuth } from "../lib/auth";
import { toast } from "../ui/toast";
import {
  fetchChanges, fetchFilterOptions, exportCsvUrl,
} from "../lib/api";
import type { ChangeRecord } from "../lib/types";

const PAGE_SIZE = 50;

export default function Changes() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const openDiff = useAppShell((s) => s.openDiff);
  const canExport = useAuth((s) => s.isEditor());

  // Reset to page 1 whenever filters change — otherwise users land on an
  // empty page when narrowing the filter.
  useEffect(() => {
    setPage(1);
    setKnownTotal(null);
  }, [filters]);

  const { data: options } = useQuery({
    queryKey: ["filter-options"],
    queryFn: fetchFilterOptions,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["changes", "all", page, filters],
    queryFn: ({ signal }) =>
      fetchChanges(
        {
          page,
          page_size: PAGE_SIZE,
          ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        },
        signal,
      ),
    placeholderData: (prev) => prev, // smoother flips
  });

  // Cache total from page 1 so subsequent pages can still render "of N".
  useEffect(() => {
    if (page === 1 && data?.total != null) setKnownTotal(data.total);
  }, [page, data?.total]);

  const rows = data?.items ?? [];
  const hasMore = data?.has_more ?? (rows.length === PAGE_SIZE);

  const totalPages = useMemo(() => {
    if (knownTotal == null) return null;
    return Math.max(1, Math.ceil(knownTotal / PAGE_SIZE));
  }, [knownTotal]);

  const onExport = () => {
    const url = exportCsvUrl({ ...filters });
    window.open(url, "_blank");
    toast({
      tone: "info",
      title: "Export started",
      body: "Your CSV download will begin shortly.",
    });
  };

  return (
    <div className="fade-in">
      <Masthead
        eyebrow="Library · the record"
        title="All changes"
        subtitle={
          knownTotal != null
            ? <>{knownTotal.toLocaleString()} event{knownTotal === 1 ? "" : "s"} matched</>
            : <>Loading totals…</>
        }
        actions={
          canExport ? (
            <Button variant="secondary" size="sm" icon="download" onClick={onExport}>
              Export CSV
            </Button>
          ) : null
        }
      />

      <FilterPanel filters={filters} setFilters={setFilters} options={options} />

      {isLoading ? (
        <LoadingCard />
      ) : (
        <>
          {rows.length === 0 ? (
            <EmptyState
              icon="search-x"
              title={page > 1 ? "No more results on this page" : "No changes match the current filter"}
              body={
                page > 1
                  ? "Go back to the previous page to see results."
                  : "Try broadening the query, or wait for the next STEPXML payload."
              }
              action={
                page > 1 ? (
                  <Button variant="secondary" size="sm" onClick={() => setPage(1)}>
                    Back to page 1
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setFilters({})}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <ChangeTable
              rows={rows}
              onRowClick={(r: ChangeRecord) => openDiff(r, rows)}
            />
          )}
          {(rows.length > 0 || page > 1) && (
            <Paginator
              page={page}
              totalPages={totalPages}
              hasMore={hasMore}
              isFetching={isFetching}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              pageSize={PAGE_SIZE}
              rowsOnPage={rows.length}
            />
          )}
        </>
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      className="card"
      style={{
        padding: 48, textAlign: "center", color: "var(--fg-tertiary)",
      }}
    >
      <span className="spinner" style={{ marginRight: 8 }} /> Loading changes…
    </div>
  );
}

function Paginator({
  page, totalPages, hasMore, isFetching, onPrev, onNext, pageSize, rowsOnPage,
}: {
  page: number;
  totalPages: number | null;
  hasMore: boolean;
  isFetching: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSize: number;
  rowsOnPage: number;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + rowsOnPage;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginTop: 14,
        padding: "10px 14px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 12.5, color: "var(--fg-tertiary)" }}>
        Showing <strong style={{ color: "var(--fg)" }}>{from.toLocaleString()}</strong>
        {" – "}
        <strong style={{ color: "var(--fg)" }}>{to.toLocaleString()}</strong>
        {totalPages != null && (
          <>
            {" "}· Page <strong style={{ color: "var(--fg)" }}>{page}</strong> of{" "}
            <strong style={{ color: "var(--fg)" }}>{totalPages}</strong>
          </>
        )}
        {isFetching && <span style={{ marginLeft: 8 }} className="spinner" />}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onPrev}
          disabled={page <= 1 || isFetching}
        >
          <Icon name="chevron-left" size={13} /> Previous
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onNext}
          disabled={!hasMore || isFetching}
        >
          Next <Icon name="chevron-right" size={13} />
        </button>
      </div>
    </div>
  );
}
