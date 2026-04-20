import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ChangeRecord } from "../lib/types";
import { absTime, changeTypeVariant, cn, relTime, truncate, variantClasses } from "../lib/utils";
import { TableSkeleton, EmptyState } from "./ui";

interface Props {
  rows: ChangeRecord[];
  onRowClick: (row: ChangeRecord) => void;
  loading?: boolean;
}

const col = createColumnHelper<ChangeRecord>();

export default function ChangeGrid({ rows, onRowClick, loading }: Props) {
  const columns = useMemo(
    () => [
      col.accessor("change_date", {
        header: "When",
        cell: (c) => (
          <div className="font-mono text-[11px] leading-tight">
            <div className="text-ink">{relTime(c.getValue())}</div>
            <div className="text-ink/40 text-[10px]">{absTime(c.getValue())}</div>
          </div>
        ),
        size: 130,
      }),
      col.accessor("change_element_type", {
        header: "Type",
        cell: (c) => {
          const variant = changeTypeVariant(c.getValue());
          return (
            <span
              className={cn(
                "chip",
                variantClasses[variant]
              )}
            >
              {c.getValue().replace(/_/g, " ").toLowerCase()}
            </span>
          );
        },
        size: 180,
      }),
      col.accessor("step_product_id", {
        header: "Product",
        cell: (c) => (
          <code className="font-mono text-[11px] text-ink">
            {truncate(c.getValue(), 32)}
          </code>
        ),
        size: 220,
      }),
      col.accessor("attribute_id", {
        header: "Attribute / Target",
        cell: (c) => {
          const row = c.row.original;
          const primary = c.getValue() || row.ref_type || "—";
          const secondary =
            row.qualifier_id ||
            row.target_id ||
            row.step_container_id ||
            row.unit_id;
          return (
            <div className="font-mono text-[11px] leading-tight">
              <div className="text-ink">{truncate(primary, 30)}</div>
              {secondary && (
                <div className="text-ink/40 text-[10px]">
                  {truncate(String(secondary), 30)}
                </div>
              )}
            </div>
          );
        },
        size: 200,
      }),
      col.accessor("previous_value", {
        header: "Previous",
        cell: (c) => {
          const raw = c.getValue();
          const arr = c.row.original.previous_values;
          const display = raw ?? (arr ? JSON.stringify(arr) : null);
          if (!display) {
            return <span className="text-ink/30 font-mono text-[11px]">—</span>;
          }
          return (
            <div className="border-l-2 border-rose pl-2 py-0.5 font-mono text-[11px] text-ink/70 bg-rose-50/40 max-w-sm">
              {truncate(String(display), 80)}
            </div>
          );
        },
      }),
      col.accessor("current_value", {
        header: "Current",
        cell: (c) => {
          const raw = c.getValue();
          const arr = c.row.original.current_values;
          const display = raw ?? (arr ? JSON.stringify(arr) : null);
          if (!display) {
            return <span className="text-ink/30 font-mono text-[11px]">—</span>;
          }
          return (
            <div className="border-l-2 border-sage pl-2 py-0.5 font-mono text-[11px] text-ink bg-sage-50/40 max-w-sm">
              {truncate(String(display), 80)}
            </div>
          );
        },
      }),
      col.accessor("changed_by", {
        header: "By",
        cell: (c) => (
          <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">
            {c.getValue() || "—"}
          </span>
        ),
        size: 130,
      }),
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <TableSkeleton rows={8} cols={6} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No changes match the current filter"
        description="Try broadening the query, or ingest a new STEPXML payload."
      />
    );
  }

  return (
    <div className="bg-surface border-2 border-ink shadow-sharp overflow-x-auto">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b-2 border-ink bg-ink text-paper">
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{ width: h.getSize() }}
                  className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r, idx) => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r.original)}
              className={cn(
                "border-b border-ink/10 hover:bg-paper cursor-pointer transition-colors",
                idx % 2 === 1 && "bg-paper-100/40"
              )}
            >
              {r.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
