import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { fetchFilterOptions } from "../lib/api";
import { cn } from "../lib/utils";

const SEARCH_DEBOUNCE_MS = 350;

export interface Filters {
  step_product_id?: string;
  change_element_type?: string;
  attribute_id?: string;
  qualifier_id?: string;
  changed_by?: string;
  snapshot_week?: string;
  search?: string;
}

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
}

export default function FilterBar({ filters, onChange }: Props) {
  const { data: options } = useQuery({
    queryKey: ["filter-options"],
    queryFn: fetchFilterOptions,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Search input is buffered locally and debounced before being lifted up so
  // we don't fire an API request on every keystroke.
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");

  useEffect(() => {
    setSearchDraft(filters.search ?? "");
  }, [filters.search]);

  useEffect(() => {
    const next = searchDraft || undefined;
    if (next === filters.search) return;
    const t = setTimeout(() => onChange({ ...filters, search: next }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const active = Object.entries(filters).filter(([, v]) => v).length;

  const set = (key: keyof Filters, value: string) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  const clearAll = () => {
    setSearchDraft("");
    onChange({});
  };

  return (
    <section className="mb-6">
      {/* ── Filter header strip ─────────────────────────────── */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
            § filter
          </p>
          <h2 className="font-serif text-2xl text-ink mt-1">Narrow the record</h2>
        </div>
        <div className="flex items-center gap-3">
          {active > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-amber-900 bg-amber-50 border border-amber px-2 py-1">
              {active} active
            </span>
          )}
          <button
            onClick={clearAll}
            disabled={active === 0}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <X size={11} /> reset
          </button>
        </div>
      </div>

      {/* ── Filter grid ─────────────────────────────────────── */}
      <div className="bg-surface border-2 border-ink shadow-sharp">
        {/* search row */}
        <div className="flex items-center border-b border-ink/10">
          <div className="px-3 border-r border-ink/10">
            <Search size={14} className="text-ink/40 dark:text-ink/60" />
          </div>
          <input
            type="text"
            placeholder="Search products, attributes, values…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="flex-1 px-4 py-3 font-mono text-sm bg-transparent text-ink outline-none placeholder:text-ink/30 dark:placeholder:text-ink/55"
          />
          {searchDraft && (
            <button
              onClick={() => setSearchDraft("")}
              className="px-3 text-ink/40 hover:text-ink dark:text-ink/60"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* dropdown grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Dropdown
            label="Change Type"
            value={filters.change_element_type}
            options={options?.change_element_types || []}
            onChange={(v) => set("change_element_type", v)}
          />
          <Dropdown
            label="Product ID"
            value={filters.step_product_id}
            options={options?.product_ids || []}
            onChange={(v) => set("step_product_id", v)}
          />
          <Dropdown
            label="Attribute"
            value={filters.attribute_id}
            options={options?.attribute_ids || []}
            onChange={(v) => set("attribute_id", v)}
          />
          <Dropdown
            label="Qualifier"
            value={filters.qualifier_id}
            options={options?.qualifier_ids || []}
            onChange={(v) => set("qualifier_id", v)}
          />
          <Dropdown
            label="Changed By"
            value={filters.changed_by}
            options={options?.changed_by || []}
            onChange={(v) => set("changed_by", v)}
          />
          <Dropdown
            label="Snapshot Week"
            value={filters.snapshot_week}
            options={options?.snapshot_weeks || []}
            onChange={(v) => set("snapshot_week", v)}
            lastColumn
          />
        </div>
      </div>
    </section>
  );
}

interface DropdownProps {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  lastColumn?: boolean;
}

function Dropdown({ label, value, options, onChange, lastColumn }: DropdownProps) {
  return (
    <div
      className={cn(
        "relative group border-t border-ink/10 md:border-t-0 md:border-l border-ink/10 first:border-l-0 md:border-b-0",
        !lastColumn && "md:border-r-0"
      )}
    >
      <label className="block px-3 pt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/40 dark:text-ink/60">
        {label}
      </label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full px-3 pb-2 pt-0.5 bg-transparent font-mono text-xs outline-none appearance-none cursor-pointer",
          value ? "text-ink" : "text-ink/40 dark:text-ink/60"
        )}
      >
        <option value="" className="bg-surface text-ink">—— any ——</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-surface text-ink">
            {o}
          </option>
        ))}
      </select>
      {value && (
        <span className="absolute top-1.5 right-2 h-1 w-1 bg-amber rounded-full" />
      )}
    </div>
  );
}
