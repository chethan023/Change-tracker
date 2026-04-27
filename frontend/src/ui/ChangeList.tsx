import { useState } from "react";
import {
  Icon,
  IconButton,
  Avatar,
  ChangeTypeBadge,
  relTime,
} from "./primitives";
import type { ChangeRecord, FilterOptions } from "../lib/types";

export interface Filters {
  search?: string;
  change_element_type?: string;
  step_product_id?: string;
  attribute_id?: string;
  qualifier_id?: string;
  changed_by?: string;
  snapshot_week?: string;
}

export function FilterPanel({
  filters,
  setFilters,
  options,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  options?: FilterOptions;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = Object.entries(filters).filter(([k, v]) => k !== "search" && v).length;

  const update = (k: keyof Filters, v: string) =>
    setFilters({ ...filters, [k]: v || undefined });
  const reset = () => setFilters({ search: filters.search });
  const chips = Object.entries(filters).filter(([k, v]) => k !== "search" && v);

  const fields: { key: keyof Filters; label: string; opts: string[] }[] = [
    { key: "change_element_type", label: "Change type", opts: options?.change_element_types || [] },
    { key: "step_product_id", label: "Product ID", opts: options?.product_ids || [] },
    { key: "attribute_id", label: "Attribute", opts: options?.attribute_ids || [] },
    { key: "qualifier_id", label: "Qualifier", opts: options?.qualifier_ids || [] },
    { key: "changed_by", label: "Changed by", opts: options?.changed_by || [] },
    { key: "snapshot_week", label: "Week", opts: options?.snapshot_weeks || [] },
  ];

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-elevated)",
            padding: "0 14px",
          }}
        >
          <Icon name="search" size={16} color="var(--fg-tertiary)" />
          <input
            className="input-bare"
            placeholder="Search products, attributes, values, users…"
            value={filters.search || ""}
            onChange={(e) => update("search", e.target.value)}
          />
          {filters.search && <IconButton icon="x" onClick={() => update("search", "")} />}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(!expanded)}>
          <Icon name="filter" size={14} />
          Filters
          {active > 0 && (
            <span
              style={{
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                marginLeft: 2,
              }}
            >
              {active}
            </span>
          )}
        </button>
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {chips.map(([k, v]) => (
            <span key={k} className="chip">
              {v}
              <button onClick={() => update(k as keyof Filters, "")}>×</button>
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            Clear
          </button>
        </div>
      )}
      {expanded && (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {fields.map((f) => (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="label-sm">{f.label}</div>
                <select
                  className="input input-sm"
                  value={(filters[f.key] as string) || ""}
                  onChange={(e) => update(f.key, e.target.value)}
                >
                  <option value="">Any</option>
                  {f.opts.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
export function ChangeTable({
  rows,
  onRowClick,
  selectedId,
  focusedId,
}: {
  rows: ChangeRecord[];
  onRowClick: (r: ChangeRecord) => void;
  selectedId?: number | null;
  focusedId?: number | null;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 168 }}>Product</th>
              <th style={{ width: 144 }}>Type</th>
              <th style={{ width: 168 }}>Attribute / Target</th>
              <th>Previous</th>
              <th>Current</th>
              <th style={{ width: 144 }}>When &amp; who</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cls = [
                "clickable",
                selectedId === r.id ? "selected" : "",
                focusedId === r.id ? "kb-focused" : "",
              ].filter(Boolean).join(" ");
              return (
                <tr
                  key={r.id}
                  id={`change-${r.id}`}
                  className={cls}
                  onClick={() => onRowClick(r)}
                >
                  <td>
                    <code
                      className="mono"
                      style={{
                        fontSize: 13,
                        color: "var(--fg)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "block",
                      }}
                      title={r.step_product_id}
                    >
                      {r.step_product_id}
                    </code>
                  </td>
                  <td><ChangeTypeBadge type={r.change_element_type} /></td>
                  <td>
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="mono"
                        style={{
                          fontSize: 13,
                          color: "var(--fg)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={r.attribute_id || r.ref_type || ""}
                      >
                        {r.attribute_id || r.ref_type || "—"}
                      </div>
                      {(r.qualifier_id || r.unit_id) && (
                        <div
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--fg-tertiary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {[r.qualifier_id, r.unit_id].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </td>
                  <td><ValueCell value={r.previous_value} variant="before" /></td>
                  <td><ValueCell value={r.current_value} variant="after" /></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Avatar userId={r.changed_by || "system"} size={24} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--fg)", whiteSpace: "nowrap" }}>
                          {relTime(r.change_date)}
                        </div>
                        <div
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--fg-tertiary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {r.changed_by || "system"}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Single before/after value cell — coloured pill with monospaced text and
 * an em-dash placeholder when the value is missing. Same shape so Previous
 * and Current columns line up vertically across rows.
 */
function ValueCell({
  value, variant,
}: {
  value: string | null | undefined;
  variant: "before" | "after";
}) {
  const empty = value == null || value === "";
  const palette =
    variant === "before"
      ? { bg: "var(--diff-before-bg)", fg: "var(--diff-before-fg)", line: "var(--diff-before-line)" }
      : { bg: "var(--diff-after-bg)",  fg: "var(--diff-after-fg)",  line: "var(--diff-after-line)" };
  if (empty) {
    return <span style={{ color: "var(--fg-quaternary)" }}>—</span>;
  }
  return (
    <span
      title={String(value)}
      style={{
        display: "inline-block",
        background: palette.bg,
        color: palette.fg,
        padding: "3px 8px",
        borderRadius: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
        borderLeft: `2px solid ${palette.line}`,
        maxWidth: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {value}
    </span>
  );
}
