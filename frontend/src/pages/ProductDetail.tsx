import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, History, Filter } from "lucide-react";
import { fetchProduct, fetchProductTimeline } from "../lib/api";
import type { ChangeRecord, ProductAttributeRow } from "../lib/types";
import {
  Card, Select, Spinner, Skeleton, EmptyState, ErrorState, Modal, Button,
} from "../components/ui";

const ALL = "__all__";

export default function ProductDetail() {
  const { id = "" } = useParams();
  const productId = decodeURIComponent(id);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(productId),
    enabled: !!productId,
  });

  const [selectedAttr, setSelectedAttr] = useState<ProductAttributeRow | null>(null);
  const [qualifierFilter, setQualifierFilter] = useState<string>(ALL);
  const [changedOnly, setChangedOnly] = useState(false);

  const { globalAttrs, qualifiedAttrs, qualifiers, visibleQualified, visibleGlobal } = useMemo(() => {
    const attrs = data?.attributes ?? [];
    const globalAttrs = attrs.filter((a) => !a.qualifier_id);
    const qualifiedAttrs = attrs.filter((a) => !!a.qualifier_id);
    const qualifiers = Array.from(
      new Set(qualifiedAttrs.map((a) => a.qualifier_id as string))
    ).sort();

    const matchesQualifier = (a: ProductAttributeRow) =>
      qualifierFilter === ALL ? true : a.qualifier_id === qualifierFilter;
    const matchesChanged = (a: ProductAttributeRow) =>
      changedOnly ? a.change_count > 0 : true;

    return {
      globalAttrs,
      qualifiedAttrs,
      qualifiers,
      visibleQualified: qualifiedAttrs.filter((a) => matchesQualifier(a) && matchesChanged(a)),
      visibleGlobal: globalAttrs.filter(matchesChanged),
    };
  }, [data, qualifierFilter, changedOnly]);

  if (isLoading) return <ProductDetailSkeleton />;
  if (error || !data) {
    return (
      <ErrorState
        title="Product not found"
        description={error instanceof Error ? error.message : "We couldn't load this product."}
        onRetry={() => refetch()}
      />
    );
  }

  const names = data.names.filter((n) => n.name_text);
  const primaryName = names[0]?.name_text || data.step_product_id;

  return (
    <>
      <Link
        to="/products"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink transition mb-4"
      >
        <ArrowLeft size={12} aria-hidden /> back to products
      </Link>

      <section className="mb-6 border-b-2 border-ink pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
          product / {data.user_type_id || "unknown type"}
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold text-ink leading-tight mt-1 break-words">
          {primaryName}
        </h1>
        <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-ink/60">
          <div><dt className="sr-only">id</dt>id: <dd className="inline text-ink">{data.step_product_id}</dd></div>
          {data.parent_id && (
            <div><dt className="sr-only">parent</dt>parent: <dd className="inline text-ink">{data.parent_id}</dd></div>
          )}
          <div><dt className="sr-only">changes</dt>changes: <dd className="inline text-ink tabular-nums">{data.change_count.toLocaleString()}</dd></div>
          {data.last_change_date && (
            <div><dt className="sr-only">last change</dt>last: <dd className="inline text-ink">{new Date(data.last_change_date).toLocaleString()}</dd></div>
          )}
        </dl>
      </section>

      {/* Filter bar — applies to attribute sections */}
      <div className="mb-6 flex flex-wrap items-end gap-3 border-y border-ink/10 py-3">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink/50">
          <Filter size={12} aria-hidden /> filter attributes
        </div>
        <Select
          label="Qualifier"
          value={qualifierFilter}
          onChange={(e) => setQualifierFilter(e.target.value)}
          aria-label="Filter attributes by qualifier"
        >
          <option value={ALL}>all ({qualifiers.length})</option>
          {qualifiers.map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </Select>
        <label className="inline-flex items-center gap-2 font-mono text-xs text-ink/70 cursor-pointer select-none pb-1">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={changedOnly}
            onChange={(e) => setChangedOnly(e.target.checked)}
          />
          changed only
        </label>
        {(qualifierFilter !== ALL || changedOnly) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setQualifierFilter(ALL); setChangedOnly(false); }}
          >
            clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attributes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Global (qualifier-independent) attributes — always visible */}
          <section aria-labelledby="global-attrs-h">
            <h2 id="global-attrs-h" className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-2">
              Global Attributes · {visibleGlobal.length}
              {changedOnly && (
                <span className="ml-2 text-ink/40 normal-case tracking-normal">
                  of {globalAttrs.length}
                </span>
              )}
            </h2>
            <div className="border-2 border-ink bg-surface shadow-sharp overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-ink bg-ink/5">
                    <Th>Attribute</Th>
                    <Th>Value</Th>
                    <Th className="text-right">Changes</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {visibleGlobal.map((a, i) => (
                    <AttrRow key={`g-${a.attribute_id}-${i}`} a={a} onClick={() => setSelectedAttr(a)} showQualifier={false} />
                  ))}
                </tbody>
              </table>
              {visibleGlobal.length === 0 && (
                <EmptyState
                  className="border-0 shadow-none"
                  title={changedOnly ? "No changed global attributes" : "No global attributes"}
                  description={changedOnly
                    ? "Turn off the “changed only” filter to see all global attributes."
                    : "This product has no qualifier-independent attributes."}
                />
              )}
            </div>
          </section>

          {/* Qualified attributes — filter by qualifier */}
          <section aria-labelledby="qualified-attrs-h">
            <h2 id="qualified-attrs-h" className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-2">
              Qualified Attributes · {visibleQualified.length}
              {(qualifierFilter !== ALL || changedOnly) && (
                <span className="ml-2 text-ink/40 normal-case tracking-normal">
                  of {qualifiedAttrs.length}
                </span>
              )}
            </h2>
            <div className="border-2 border-ink bg-surface shadow-sharp overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-ink bg-ink/5">
                    <Th>Attribute</Th>
                    <Th>Qualifier</Th>
                    <Th>Value</Th>
                    <Th className="text-right">Changes</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {visibleQualified.map((a, i) => (
                    <AttrRow key={`q-${a.attribute_id}-${a.qualifier_id}-${i}`} a={a} onClick={() => setSelectedAttr(a)} showQualifier />
                  ))}
                </tbody>
              </table>
              {visibleQualified.length === 0 && (
                <EmptyState
                  className="border-0 shadow-none"
                  title="No qualified attributes match"
                  description={
                    qualifierFilter !== ALL
                      ? `No attributes for qualifier "${qualifierFilter}"${changedOnly ? " with recorded changes" : ""}.`
                      : changedOnly
                      ? "No qualified attributes have recorded changes."
                      : "No qualified attributes recorded."
                  }
                />
              )}
            </div>
          </section>
        </div>

        {/* Sidebar: refs + classifications */}
        <aside className="space-y-6">
          <section aria-labelledby="refs-h">
            <h2 id="refs-h" className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-2">
              References · {data.references.length}
            </h2>
            <Card padded={false} className="p-3 space-y-2 max-h-80 overflow-auto">
              {data.references.map((r, i) => (
                <div key={i} className="font-mono text-xs flex justify-between gap-2">
                  <span className="text-ink/60">{r.ref_type}</span>
                  <span className="truncate text-ink">{r.target_product_id}</span>
                </div>
              ))}
              {data.references.length === 0 && (
                <div className="font-mono text-xs text-ink/40">none.</div>
              )}
            </Card>
          </section>

          <section aria-labelledby="cls-h">
            <h2 id="cls-h" className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-2">
              Classifications · {data.classifications.length}
            </h2>
            <Card padded={false} className="p-3 space-y-1 max-h-48 overflow-auto">
              {data.classifications.map((c) => (
                <div key={c} className="font-mono text-xs text-ink">{c}</div>
              ))}
              {data.classifications.length === 0 && (
                <div className="font-mono text-xs text-ink/40">none.</div>
              )}
            </Card>
          </section>
        </aside>
      </div>

      <AttributeTimeline
        open={!!selectedAttr}
        productId={data.step_product_id}
        attr={selectedAttr}
        onClose={() => setSelectedAttr(null)}
      />
    </>
  );
}

function ProductDetailSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="h-3 w-24 mb-4" />
      <Skeleton className="h-8 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-ink/50 font-mono text-xs">
        <Spinner /> loading product…
      </div>
    </div>
  );
}

function AttributeTimeline({
  open, productId, attr, onClose,
}: {
  open: boolean;
  productId: string;
  attr: ProductAttributeRow | null;
  onClose: () => void;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["product-timeline", productId],
    queryFn: () => fetchProductTimeline(productId),
    enabled: open && !!productId,
  });

  const rows = attr
    ? data.filter(
        (r: ChangeRecord) =>
          r.attribute_id === attr.attribute_id &&
          (attr.qualifier_id ? r.qualifier_id === attr.qualifier_id : true)
      )
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={attr?.attribute_id || "Audit trail"}
      description={attr ? `${productId}${attr.qualifier_id ? ` · ${attr.qualifier_id}` : ""}` : undefined}
    >
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-ink/60 font-mono text-xs">
            <Spinner /> loading timeline…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No changes recorded"
            description="This attribute has no change history in the current range."
          />
        ) : (
          rows.map((r) => (
            <div key={r.id} className="border border-ink/20 p-3 bg-paper/40">
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-ink/50">
                <span>{r.change_element_type}</span>
                <span>{new Date(r.change_date).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2 font-mono text-xs">
                <div>
                  <div className="text-ink/40 text-[10px] uppercase">previous</div>
                  <div className="text-rose break-all">{r.previous_value || "∅"}</div>
                </div>
                <div>
                  <div className="text-ink/40 text-[10px] uppercase">current</div>
                  <div className="text-sage break-all">{r.current_value || "∅"}</div>
                </div>
              </div>
              {r.changed_by && (
                <div className="mt-2 font-mono text-[10px] text-ink/50">by {r.changed_by}</div>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink/60 text-left ${className}`}>
      {children}
    </th>
  );
}

function AttrRow({
  a, onClick, showQualifier,
}: {
  a: ProductAttributeRow;
  onClick: () => void;
  showQualifier: boolean;
}) {
  return (
    <tr
      className="border-b border-ink/10 hover:bg-ink/5 transition cursor-pointer focus-within:bg-ink/5"
      onClick={onClick}
    >
      <td className="px-3 py-2 font-mono text-xs text-ink">
        <button
          className="text-left hover:underline focus:outline-none"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-label={`View audit trail for ${a.attribute_id}${a.qualifier_id ? ` (${a.qualifier_id})` : ""}`}
        >
          {a.attribute_id}
        </button>
        {a.kind === "multi" && (
          <span className="ml-2 chip border-brand/40 text-brand">multi</span>
        )}
        {a.change_count > 0 && (
          <span className="ml-2 chip border-amber/50 text-amber-900">changed</span>
        )}
      </td>
      {showQualifier && (
        <td className="px-3 py-2 font-mono text-xs text-ink/70">{a.qualifier_id || "—"}</td>
      )}
      <td className="px-3 py-2 font-mono text-xs break-all max-w-[28ch] text-ink">
        {a.kind === "multi"
          ? JSON.stringify(a.values_json)
          : a.value_text || <span className="text-ink/40">∅</span>}
        {a.unit_id && <span className="text-ink/50 ml-1">{a.unit_id}</span>}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">
        {a.change_count > 0 ? (
          <span className="text-amber-900">{a.change_count}</span>
        ) : (
          <span className="text-ink/30">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <History size={12} className="inline text-ink/40" aria-hidden />
      </td>
    </tr>
  );
}
