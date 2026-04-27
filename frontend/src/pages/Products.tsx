import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Masthead,
  Icon,
  SearchShell,
  EmptyState,
  relTime,
} from "../ui/primitives";
import { fetchProducts } from "../lib/api";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const PAGE_SIZE = 50;

export default function Products() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const debouncedQ = useDebouncedValue(q, 350);

  const {
    data, isLoading, isFetching, isFetchingNextPage,
    hasNextPage, fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["products", debouncedQ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchProducts(
        {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(debouncedQ ? { search: debouncedQ } : {}),
        },
        signal,
      ),
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
  });

  const list = useMemo(
    // Guard against a stale backend that still returns the legacy bare-list
    // shape (no `items` field) — produces an empty list instead of mapping
    // over `undefined` and crashing the page.
    () => (data?.pages ?? []).flatMap((p) => p?.items ?? []),
    [data],
  );

  // Best-effort prefetch of page 2 once the first page lands. Keeps the
  // initial render small but makes the first "Load more" instant.
  useEffect(() => {
    if (data?.pages?.length === 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [data?.pages?.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="fade-in">
      <Masthead
        eyebrow="Library"
        title="Products"
        subtitle="Every product the STEP feed has touched, with a rolling count of changes."
      />

      <div style={{ display: "flex", marginBottom: 12 }}>
        <SearchShell value={q} onChange={setQ} placeholder="Search products by ID, type or parent…" />
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-tertiary)" }}>
          <span className="spinner" style={{ marginRight: 8 }} /> Loading products…
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="package"
          title={debouncedQ ? "No products match" : "No products yet"}
          body={
            debouncedQ
              ? "Try a different search term."
              : "Products will appear here after the first STEPXML ingest."
          }
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
         <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Parent</th>
                <th>Changes · total</th>
                <th>Last change</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr
                  key={p.step_product_id}
                  className="clickable"
                  onClick={() =>
                    navigate(`/products/${encodeURIComponent(p.step_product_id)}`)
                  }
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: "var(--bg-muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--fg-tertiary)",
                        }}
                      >
                        <Icon name="package" size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <code
                          className="mono"
                          style={{
                            fontSize: 13,
                            color: "var(--fg)",
                            fontWeight: 600,
                          }}
                        >
                          {p.step_product_id}
                        </code>
                      </div>
                    </div>
                  </td>
                  <td>
                    {p.user_type_id ? (
                      <code className="mono" style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                        {p.user_type_id}
                      </code>
                    ) : (
                      <span style={{ color: "var(--fg-quaternary)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {p.parent_id ? (
                      <span
                        className="badge"
                        style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}
                      >
                        {p.parent_id}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg-quaternary)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className="tabular"
                      style={{
                        fontWeight: 600,
                        color: (p.change_count ?? 0) > 0 ? "var(--fg)" : "var(--fg-quaternary)",
                      }}
                    >
                      {p.change_count ?? 0}
                    </span>
                  </td>
                  <td>
                    {p.last_change_date ? (
                      <span style={{ fontSize: 12.5, color: "var(--fg-secondary)" }}>
                        {relTime(p.last_change_date)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg-quaternary)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <Icon name="chevron-right" size={14} color="var(--fg-tertiary)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
         <LoadMoreFooter
           hasNextPage={!!hasNextPage}
           isFetching={isFetching}
           isFetchingNextPage={isFetchingNextPage}
           loaded={list.length}
           onLoadMore={() => fetchNextPage()}
         />
        </div>
      )}
    </div>
  );
}

function LoadMoreFooter({
  hasNextPage, isFetching, isFetchingNextPage, loaded, onLoadMore,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  loaded: number;
  onLoadMore: () => void;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--bg-elevated)",
      }}
    >
      <div style={{ fontSize: 12.5, color: "var(--fg-tertiary)" }}>
        {loaded.toLocaleString()} loaded
        {isFetching && !isFetchingNextPage && (
          <span style={{ marginLeft: 8 }} className="spinner" />
        )}
      </div>
      {hasNextPage ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onLoadMore}
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
  );
}
