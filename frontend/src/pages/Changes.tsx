/**
 * /changes — keyset-paginated full record of every change.
 *
 * Pagination model: opaque cursor returned by the server. We keep a stack of
 * cursors (`[null, c1, c2, …]` where the index is the page number) so Prev
 * is O(1) and Next pushes the cursor we got back. This avoids the deep-page
 * latency cliff that OFFSET-based pagination hits at 100k+ rows.
 *
 * Search is debounced 350 ms so we don't fire a request per keystroke.
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
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { ChangeRecord } from "../lib/types";

const PAGE_SIZE = 50;

export default function Changes() {
  const [filters, setFilters] = useState<Filters>({});
  // cursorStack[i] is the cursor that produces page i+1.
  // cursorStack[0] is always null (first page) and never popped.
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const openDiff = useAppShell((s) => s.openDiff);
  const canExport = useAuth((s) => s.isEditor());

  // Debounce the typed search value into the value that drives queries.
  const debouncedSearch = useDebouncedValue(filters.search ?? "", 350);
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch || undefined }),
    [filters, debouncedSearch],
  );

  // Reset pagination + cached total whenever the *effective* filter set
  // changes. Using queryFilters (debounced) avoids resetting on every
  // keystroke before the request actually fires.
  useEffect(() => {
    setCursorStack([null]);
    setKnownTotal(null);
  }, [
    queryFilters.search,
    queryFilters.change_element_type,
    queryFilters.step_product_id,
    queryFilters.attribute_id,
    queryFilters.qualifier_id,
    queryFilters.changed_by,
    queryFilters.snapshot_week,
  ]);

  const page = cursorStack.length; // 1-indexed for display
  const cursor = cursorStack[cursorStack.length - 1];

  const { data: options } = useQuery({
    queryKey: ["filter-options"],
    queryFn: fetchFilterOptions,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["changes", "all", cursor, queryFilters],
    queryFn: ({ signal }) =>
      fetchChanges(
        {
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
          ...Object.fromEntries(
            Object.entries(queryFilters).filter(([, v]) => v),
          ),
        },
        signal,
      ),
    placeholderData: (prev) => prev,
  });

  // Cache total returned on the first page so deeper pages can render "of N".
  useEffect(() => {
    if (cursor == null && data?.total != null) setKnownTotal(data.total);
  }, [cursor, data?.total]);

  const rows = data?.items ?? [];
  const hasMore = data?.has_more ?? false;
  const totalPages = useMemo(() => {
    if (knownTotal == null) return null;
    return Math.max(1, Math.ceil(knownTotal / PAGE_SIZE));
  }, [knownTotal]);

  const onNext = () => {
    if (!data?.next_cursor) return;
    setCursorStack((s) => [...s, data.next_cursor]);
  };
  const onPrev = () => {
    setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  const onExport = () => {
    // Export runs against the current effective filter set, not a cursor —
    // the backend streams the full filtered result.
    const url = exportCsvUrl({
      ...Object.fromEntries(
        Object.entries(queryFilters).filter(([, v]) => v),
      ),
    });
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
                  <Button variant="secondary" size="sm" onClick={() => setCursorStack([null])}>
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
              onPrev={onPrev}
              onNext={onNext}
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
