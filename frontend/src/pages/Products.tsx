import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Masthead,
  Icon,
  SearchShell,
  EmptyState,
  relTime,
} from "../ui/primitives";
import { fetchProducts } from "../lib/api";

export default function Products() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });

  const list = useMemo(() => {
    if (!data) return [];
    const s = q.toLowerCase();
    return data.filter(
      (p) =>
        !s ||
        p.step_product_id.toLowerCase().includes(s) ||
        p.user_type_id?.toLowerCase().includes(s) ||
        p.parent_id?.toLowerCase().includes(s)
    );
  }, [data, q]);

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
        <EmptyState icon="package" title="No products yet" body="Products will appear here after the first STEPXML ingest." />
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
        </div>
      )}
    </div>
  );
}
