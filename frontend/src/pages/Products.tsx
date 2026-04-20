import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ArrowRight, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { fetchProducts } from "../lib/api";
import { Input, Select, Button, TableSkeleton, EmptyState, ErrorState } from "../components/ui";

const PAGE_SIZE = 50;
const ALL = "__all__";

export default function Products() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [changedOnly, setChangedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const userTypes = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => r.user_type_id && s.add(r.user_type_id));
    return Array.from(s).sort();
  }, [data]);

  const items = useMemo(() => {
    const rows = data || [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hay =
          r.step_product_id.toLowerCase() +
          " " +
          (r.user_type_id || "").toLowerCase() +
          " " +
          (r.parent_id || "").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (typeFilter !== ALL && r.user_type_id !== typeFilter) return false;
      if (changedOnly && !(r.change_count && r.change_count > 0)) return false;
      return true;
    });
  }, [data, q, typeFilter, changedOnly]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, total);

  return (
    <>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
            catalogue
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold text-ink leading-none mt-1">
            Products
          </h1>
        </div>
        <div className="font-mono text-xs text-ink/60 tabular-nums">
          {showingFrom}–{showingTo} of {total.toLocaleString()}
          {data && total !== data.length && (
            <span className="text-ink/40"> · {data.length.toLocaleString()} total</span>
          )}
        </div>
      </section>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <Input
          label="Search"
          leading={<Search size={14} aria-hidden />}
          placeholder="Search id, type, or parent…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          aria-label="Search products"
        />
        <Select
          label="User type"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          aria-label="Filter by user type"
        >
          <option value={ALL}>all ({userTypes.length})</option>
          {userTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
        </Select>
        <label className="inline-flex items-center gap-2 font-mono text-xs text-ink/70 cursor-pointer select-none pb-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={changedOnly}
            onChange={(e) => { setChangedOnly(e.target.checked); setPage(1); }}
          />
          changed only
        </label>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : error ? (
        <ErrorState
          title="Couldn't load products"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<Package size={18} aria-hidden />}
          title="No products match your filters"
          description="Try clearing the search box or switching to “all” user types."
          action={
            <Button
              size="sm"
              onClick={() => { setQ(""); setTypeFilter(ALL); setChangedOnly(false); }}
            >
              clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="border-2 border-ink bg-surface shadow-sharp overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Products list</caption>
              <thead>
                <tr className="border-b-2 border-ink bg-ink/5">
                  <Th>Product ID</Th>
                  <Th>User Type</Th>
                  <Th>Parent</Th>
                  <Th className="text-right">Changes</Th>
                  <Th>Last change</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {paged.map((p) => (
                  <tr key={p.step_product_id}
                      className="border-b border-ink/10 hover:bg-ink/5 transition">
                    <td className="px-3 py-2 font-mono text-xs text-ink">{p.step_product_id}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/70">{p.user_type_id || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/70">{p.parent_id || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">
                      {p.change_count && p.change_count > 0 ? (
                        <span className="text-amber-900">{p.change_count.toLocaleString()}</span>
                      ) : (
                        <span className="text-ink/30">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/70">
                      {p.last_change_date ? new Date(p.last_change_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/products/${encodeURIComponent(p.step_product_id)}`}
                        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-brand hover:text-ink transition"
                        aria-label={`View product ${p.step_product_id}`}
                      >
                        view <ArrowRight size={12} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
              <Button
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={12} aria-hidden /> prev
              </Button>
              <span className="font-mono text-xs text-ink/60">
                page {currentPage} of {totalPages}
              </span>
              <Button
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                next <ChevronRight size={12} aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink/60 text-left ${className}`}>
      {children}
    </th>
  );
}
