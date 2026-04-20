import { useEffect } from "react";
import { X } from "lucide-react";
import { diffChars } from "diff";
import type { ChangeRecord } from "../lib/types";
import { absTime, changeTypeVariant, cn, variantClasses } from "../lib/utils";

interface Props {
  record: ChangeRecord | null;
  onClose: () => void;
}

export default function DiffModal({ record, onClose }: Props) {
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, onClose]);

  if (!record) return null;

  const variant = changeTypeVariant(record.change_element_type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-paper border-2 border-ink shadow-lift w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <header className="border-b-2 border-ink bg-surface">
          <div className="flex items-center justify-between px-6 py-3 border-b border-ink/10">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
              change record · no. {record.id}
            </p>
            <button
              onClick={onClose}
              className="text-ink/40 hover:text-ink transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-3 mb-2">
              <span className={cn("chip", variantClasses[variant])}>
                {record.change_element_type.replace(/_/g, " ").toLowerCase()}
              </span>
              {record.changed_hint && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-900">
                  · step marked changed
                </span>
              )}
            </div>
            <h2 className="font-serif text-2xl text-ink leading-tight">
              {record.attribute_id ||
                record.ref_type ||
                record.target_id ||
                "Product-level change"}
            </h2>
            <p className="font-mono text-xs text-ink/50 mt-1">
              on <code className="text-ink">{record.step_product_id}</code>
              {record.qualifier_id && (
                <> · qualifier <code className="text-ink">{record.qualifier_id}</code></>
              )}
            </p>
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <DiffBody record={record} />

          {/* Metadata table */}
          <section className="px-6 py-5 border-t border-ink/10">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-3">
              § metadata
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px]">
              <MetaRow label="Change date" value={absTime(record.change_date)} />
              <MetaRow label="Changed by" value={record.changed_by || "—"} />
              <MetaRow label="Snapshot" value={record.snapshot_week || "—"} />
              <MetaRow label="Snapshot ID" value={record.snapshot_id?.toString() || "—"} />
              <MetaRow label="Attribute ID" value={record.attribute_id || "—"} />
              <MetaRow label="Qualifier" value={record.qualifier_id || "—"} />
              <MetaRow label="Unit" value={record.unit_id || "—"} />
              <MetaRow label="LOV ID" value={record.lov_id || "—"} />
              <MetaRow label="Ref type" value={record.ref_type || "—"} />
              <MetaRow label="Target ID" value={record.target_id || "—"} />
              <MetaRow label="Container ID" value={record.step_container_id || "—"} />
              <MetaRow label="STEP hint" value={record.changed_hint ? "yes" : "no"} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Diff body ─────────────────────────────────────────────────────
function DiffBody({ record }: { record: ChangeRecord }) {
  const { previous_value, current_value, previous_values, current_values } = record;

  // Multi-value sets: show JSON array diff
  if (current_values || previous_values) {
    return (
      <section className="px-6 py-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-3">
          § multi-value set
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <ValueBlock
            label="Previous"
            variant="rose"
            value={formatArray(previous_values)}
          />
          <ValueBlock
            label="Current"
            variant="sage"
            value={formatArray(current_values)}
          />
        </div>
      </section>
    );
  }

  // Simple scalar diff with character-level highlighting
  const hasDiff = previous_value !== null && current_value !== null;
  const parts = hasDiff ? diffChars(previous_value || "", current_value || "") : [];

  return (
    <section className="px-6 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-3">
        § value diff
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <ValueBlock label="Previous" variant="rose" value={previous_value} />
        <ValueBlock label="Current" variant="sage" value={current_value} />
      </div>

      {hasDiff && parts.length > 1 && (
        <div className="border-2 border-ink bg-surface p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 mb-2">
            inline diff
          </p>
          <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
            {parts.map((part, i) => (
              <span
                key={i}
                className={cn(
                  part.added && "bg-sage-50 text-sage border-b border-sage",
                  part.removed && "bg-rose-50 text-rose line-through border-b border-rose",
                  !part.added && !part.removed && "text-ink/60"
                )}
              >
                {part.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Helpers ────────────────────────────────────────────────────────
function ValueBlock({
  label,
  variant,
  value,
}: {
  label: string;
  variant: "rose" | "sage";
  value?: string | null;
}) {
  const bg = variant === "rose" ? "bg-rose-50" : "bg-sage-50";
  const border = variant === "rose" ? "border-rose" : "border-sage";
  const text = variant === "rose" ? "text-rose" : "text-sage";

  return (
    <div className={cn("border-l-4 p-4", border, bg)}>
      <p className={cn("font-mono text-[10px] uppercase tracking-[0.25em] mb-2", text)}>
        {label}
      </p>
      <div className="font-mono text-sm text-ink whitespace-pre-wrap break-words">
        {value !== null && value !== undefined && value !== ""
          ? value
          : <span className="italic text-ink/30">(empty)</span>}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink/50 uppercase tracking-wider text-[10px]">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  );
}

function formatArray(arr: unknown[] | null | undefined): string {
  if (!arr || arr.length === 0) return "(empty)";
  return arr.map((x) => `· ${String(x)}`).join("\n");
}
