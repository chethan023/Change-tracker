import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Masthead,
  Icon,
  IconButton,
  StatCard,
  EmptyState,
  Segmented,
  Switch,
  absTime,
  relTime,
} from "../ui/primitives";
import { fetchProduct, fetchProductTimeline } from "../lib/api";
import type { ChangeRecord, ProductAttributeRow } from "../lib/types";

const ALL = "__all__";

export default function ProductDetail() {
  const { id = "" } = useParams();
  const productId = decodeURIComponent(id);

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => fetchProduct(productId),
    enabled: !!productId,
  });

  const [selectedAttr, setSelectedAttr] = useState<ProductAttributeRow | null>(null);
  const [qualifierFilter, setQualifierFilter] = useState<string>(ALL);
  const [changedOnly, setChangedOnly] = useState<boolean>(false);

  const { globalAttrs, qualifiedAttrs, qualifiers, visibleQualified, visibleGlobal } =
    useMemo(() => {
      const attrs = data?.attributes ?? [];
      const globalAttrs = attrs.filter((a) => !a.qualifier_id);
      const qualifiedAttrs = attrs.filter((a) => !!a.qualifier_id);
      const qualifiers = Array.from(
        new Set(qualifiedAttrs.map((a) => a.qualifier_id as string))
      ).sort();

      const matchQ = (a: ProductAttributeRow) =>
        qualifierFilter === ALL ? true : a.qualifier_id === qualifierFilter;
      const matchC = (a: ProductAttributeRow) =>
        changedOnly ? a.change_count > 0 : true;

      return {
        globalAttrs,
        qualifiedAttrs,
        qualifiers,
        visibleQualified: qualifiedAttrs.filter((a) => matchQ(a) && matchC(a)),
        visibleGlobal: globalAttrs.filter(matchC),
      };
    }, [data, qualifierFilter, changedOnly]);

  if (isLoading) {
    return (
      <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--fg-tertiary)" }}>
        <span className="spinner" style={{ marginRight: 8 }} /> Loading product…
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        icon="alert-triangle"
        title="Product not found"
        body={error instanceof Error ? error.message : "We couldn't load this product."}
      />
    );
  }

  const primaryName =
    data.names.find((n) => n.name_text)?.name_text || data.step_product_id;

  return (
    <div className="fade-in">
      <Link
        to="/products"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--fg-tertiary)",
          textDecoration: "none",
          marginBottom: 12,
        }}
      >
        <Icon name="arrow-left" size={14} /> Back to products
      </Link>

      <Masthead
        eyebrow={`Product · ${data.user_type_id || "unknown type"}`}
        title={primaryName}
        subtitle={
          <code className="mono" style={{ fontSize: 13 }}>
            {data.step_product_id}
            {data.parent_id ? ` · parent ${data.parent_id}` : ""}
          </code>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <StatCard label="Total changes" value={data.change_count.toLocaleString()} />
        <StatCard label="Attributes" value={data.attributes.length} />
        <StatCard
          label="Last change"
          value={data.last_change_date ? relTime(data.last_change_date) : "—"}
        />
      </div>

      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="filter" size={14} color="var(--fg-tertiary)" />
          <span className="label-sm">Qualifier</span>
          <select
            value={qualifierFilter}
            onChange={(e) => setQualifierFilter(e.target.value)}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              padding: "4px 10px",
              fontSize: 13,
              color: "var(--fg)",
            }}
          >
            <option value={ALL}>All ({qualifiers.length})</option>
            {qualifiers.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <Switch on={changedOnly} onToggle={() => setChangedOnly((v) => !v)} />
          <span style={{ fontSize: 13, color: "var(--fg-secondary)" }}>Changed only</span>
        </label>
        {(qualifierFilter !== ALL || changedOnly) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQualifierFilter(ALL);
              setChangedOnly(false);
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <AttrSection
            title="Global attributes"
            count={visibleGlobal.length}
            totalCount={globalAttrs.length}
            showingAll={!changedOnly}
            rows={visibleGlobal}
            onSelect={setSelectedAttr}
            showQualifier={false}
            emptyBody={
              changedOnly
                ? "Turn off 'Changed only' to see all global attributes."
                : "This product has no qualifier-independent attributes."
            }
          />
          <AttrSection
            title="Qualified attributes"
            count={visibleQualified.length}
            totalCount={qualifiedAttrs.length}
            showingAll={qualifierFilter === ALL && !changedOnly}
            rows={visibleQualified}
            onSelect={setSelectedAttr}
            showQualifier
            emptyBody={
              qualifierFilter !== ALL
                ? `No attributes for qualifier "${qualifierFilter}".`
                : "No qualified attributes recorded."
            }
          />
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section>
            <div className="label-sm" style={{ marginBottom: 8 }}>
              References · {data.references.length}
            </div>
            <div className="card" style={{ padding: 12, maxHeight: 300, overflow: "auto" }}>
              {data.references.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--fg-quaternary)" }}>None.</div>
              ) : (
                data.references.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "6px 0",
                      borderBottom:
                        i === data.references.length - 1
                          ? "none"
                          : "1px solid var(--border-subtle)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--fg-tertiary)" }}>{r.ref_type}</span>
                    <code
                      className="mono"
                      style={{
                        color: "var(--fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.target_product_id}
                    </code>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <div className="label-sm" style={{ marginBottom: 8 }}>
              Classifications · {data.classifications.length}
            </div>
            <div className="card" style={{ padding: 12, maxHeight: 220, overflow: "auto" }}>
              {data.classifications.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--fg-quaternary)" }}>None.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.classifications.map((c) => (
                    <span
                      key={c}
                      className="badge"
                      style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {selectedAttr && (
        <AttributeTimeline
          productId={data.step_product_id}
          attr={selectedAttr}
          onClose={() => setSelectedAttr(null)}
        />
      )}
    </div>
  );
}

function AttrSection({
  title,
  count,
  totalCount,
  showingAll,
  rows,
  onSelect,
  showQualifier,
  emptyBody,
}: {
  title: string;
  count: number;
  totalCount: number;
  showingAll: boolean;
  rows: ProductAttributeRow[];
  onSelect: (a: ProductAttributeRow) => void;
  showQualifier: boolean;
  emptyBody: string;
}) {
  return (
    <section>
      <div
        className="label-sm"
        style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 8 }}
      >
        <span>{title} · {count}</span>
        {!showingAll && (
          <span style={{ color: "var(--fg-quaternary)", textTransform: "none", letterSpacing: 0 }}>
            of {totalCount}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="search" title={`No ${title.toLowerCase()} match`} body={emptyBody} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
         <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Attribute</th>
                {showQualifier && <th>Qualifier</th>}
                <th>Value</th>
                <th style={{ textAlign: "right" }}>Changes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr
                  key={`${a.attribute_id}-${a.qualifier_id || ""}-${i}`}
                  className="clickable"
                  onClick={() => onSelect(a)}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <code className="mono" style={{ fontSize: 12, color: "var(--fg)" }}>
                        {a.attribute_id}
                      </code>
                      {a.kind === "multi" && (
                        <span
                          className="badge"
                          style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}
                        >
                          multi
                        </span>
                      )}
                      {a.change_count > 0 && (
                        <span
                          className="badge"
                          style={{ background: "var(--warning-soft)", color: "var(--warning-fg)" }}
                        >
                          changed
                        </span>
                      )}
                    </div>
                  </td>
                  {showQualifier && (
                    <td>
                      <code className="mono" style={{ fontSize: 12, color: "var(--fg-secondary)" }}>
                        {a.qualifier_id || "—"}
                      </code>
                    </td>
                  )}
                  <td
                    style={{
                      maxWidth: "32ch",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                    title={
                      a.kind === "multi" ? JSON.stringify(a.values_json) : a.value_text || ""
                    }
                  >
                    {a.kind === "multi"
                      ? JSON.stringify(a.values_json)
                      : a.value_text || (
                          <span style={{ color: "var(--fg-quaternary)" }}>∅</span>
                        )}
                    {a.unit_id && (
                      <span style={{ color: "var(--fg-tertiary)", marginLeft: 6 }}>
                        {a.unit_id}
                      </span>
                    )}
                  </td>
                  <td className="tabular" style={{ textAlign: "right" }}>
                    {a.change_count > 0 ? (
                      <span style={{ fontWeight: 600, color: "var(--warning-fg)" }}>
                        {a.change_count}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fg-quaternary)" }}>0</span>
                    )}
                  </td>
                  <td>
                    <Icon name="history" size={13} color="var(--fg-tertiary)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
        </div>
      )}
    </section>
  );
}

function AttributeTimeline({
  productId,
  attr,
  onClose,
}: {
  productId: string;
  attr: ProductAttributeRow;
  onClose: () => void;
}) {
  const [view, setView] = useState<"list" | "raw">("list");
  const { data = [], isLoading } = useQuery({
    queryKey: ["product-timeline", productId],
    queryFn: () => fetchProductTimeline(productId),
    enabled: !!productId,
  });

  const rows = data.filter(
    (r: ChangeRecord) =>
      r.attribute_id === attr.attribute_id &&
      (attr.qualifier_id ? r.qualifier_id === attr.qualifier_id : true)
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 780,
          boxShadow: "var(--shadow-lg)",
          animation: "modal-in 280ms var(--ease-spring)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="label-sm">Audit trail</div>
            <div
              className="mono"
              style={{ fontSize: 15, color: "var(--fg)", marginTop: 2 }}
            >
              {attr.attribute_id}
              {attr.qualifier_id && (
                <span style={{ color: "var(--fg-tertiary)" }}> · {attr.qualifier_id}</span>
              )}
            </div>
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "List" },
              { value: "raw", label: "Raw" },
            ]}
          />
          <IconButton icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: 18, overflow: "auto", flex: 1 }}>
          {isLoading ? (
            <div style={{ color: "var(--fg-tertiary)", fontSize: 13 }}>
              <span className="spinner" style={{ marginRight: 8 }} /> Loading timeline…
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="history"
              title="No changes recorded"
              body="This attribute has no change history."
            />
          ) : view === "raw" ? (
            <pre
              className="mono"
              style={{
                margin: 0,
                fontSize: 11.5,
                color: "var(--fg-secondary)",
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(rows, null, 2)}
            </pre>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: 12,
                    background: "var(--bg-elevated)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--fg-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    <span>{r.change_element_type}</span>
                    <span>{absTime(r.change_date)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div className="label-sm" style={{ marginBottom: 4 }}>Previous</div>
                      <code
                        className="mono"
                        style={{
                          display: "block",
                          background: "var(--diff-before-bg)",
                          color: "var(--diff-before-fg)",
                          borderLeft: "2px solid var(--diff-before-line)",
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          wordBreak: "break-all",
                        }}
                      >
                        {r.previous_value || "∅"}
                      </code>
                    </div>
                    <div>
                      <div className="label-sm" style={{ marginBottom: 4 }}>Current</div>
                      <code
                        className="mono"
                        style={{
                          display: "block",
                          background: "var(--diff-after-bg)",
                          color: "var(--diff-after-fg)",
                          borderLeft: "2px solid var(--diff-after-line)",
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          wordBreak: "break-all",
                        }}
                      >
                        {r.current_value || "∅"}
                      </code>
                    </div>
                  </div>
                  {r.changed_by && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: "var(--fg-tertiary)",
                      }}
                    >
                      by <span className="mono">{r.changed_by}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
