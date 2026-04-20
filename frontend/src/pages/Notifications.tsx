import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Mail, MessageSquare, Plus, Trash2, X } from "lucide-react";
import {
  createNotificationRule,
  deleteNotificationRule,
  fetchNotificationFilterOptions,
  fetchNotificationRules,
} from "../lib/api";
import type { NotificationRule } from "../lib/types";
import { absTime, cn } from "../lib/utils";

// ── Change-type grouping ─────────────────────────────────────────
// Grouped for the multi-select so the user sees semantically-related types
// together (create / update / delete / reference / classification / …).
const CHANGE_TYPE_GROUPS: { label: string; types: string[] }[] = [
  {
    label: "create",
    types: ["PRODUCT_CREATED", "REFERENCE_ADDED", "ASSET_LINKED", "CLASSIFICATION_LINKED", "CONTAINER_ADDED"],
  },
  {
    label: "update",
    types: ["PRODUCT_RECLASSIFIED", "PRODUCT_TYPE_CHANGED", "PRODUCT_NAME_CHANGED", "ATTRIBUTE_VALUE", "MULTIVALUE_CHANGED", "CONTAINER_VALUE"],
  },
  {
    label: "delete",
    types: ["PRODUCT_DELETED", "REFERENCE_REMOVED", "REFERENCE_SUPPRESSED", "ASSET_UNLINKED", "ASSET_SUPPRESSED", "CLASSIFICATION_UNLINKED", "CONTAINER_REMOVED"],
  },
];

// Types where attribute_id / qualifier_id are meaningful on a ChangeRecord.
const TYPES_WITH_ATTRIBUTE = new Set([
  "ATTRIBUTE_VALUE",
  "MULTIVALUE_CHANGED",
  "CONTAINER_VALUE",
]);
const TYPES_WITH_REFERENCE = new Set([
  "REFERENCE_ADDED",
  "REFERENCE_REMOVED",
  "REFERENCE_SUPPRESSED",
  "ASSET_LINKED",
  "ASSET_UNLINKED",
  "ASSET_SUPPRESSED",
  "CLASSIFICATION_LINKED",
  "CLASSIFICATION_UNLINKED",
]);

type RuleForm = {
  rule_name: string;
  change_element_types: string[];
  attribute_ids: string[];
  qualifier_ids: string[];
  ref_types: string[];
  target_ids: string[];
  notify_channel: "email" | "slack";
  notify_target: string;
};

const EMPTY_FORM: RuleForm = {
  rule_name: "",
  change_element_types: [],
  attribute_ids: [],
  qualifier_ids: [],
  ref_types: [],
  target_ids: [],
  notify_channel: "email",
  notify_target: "",
};

export default function Notifications() {
  const qc = useQueryClient();
  const { data: rules } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotificationRules,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [err, setErr] = useState<string | null>(null);

  // Dependent filter options — refetched whenever the selected change types change.
  const { data: options } = useQuery({
    queryKey: ["notification-filter-options", form.change_element_types],
    queryFn: () => fetchNotificationFilterOptions(form.change_element_types),
  });

  // Usability: when the user narrows change types, drop any selected
  // attribute/qualifier/ref/target values that are no longer applicable.
  // Only prune against a *non-empty* option list — an empty list means
  // "nothing observed yet in history", not "nothing is valid", so we must
  // not wipe user-entered values in that case.
  useEffect(() => {
    if (!options) return;
    setForm((f) => {
      const next = { ...f };
      const prune = (key: keyof RuleForm, allowed: string[]) => {
        if (allowed.length === 0) return; // no authoritative list — keep as-is
        const current = f[key] as string[];
        const kept = current.filter((v) => allowed.includes(v));
        if (kept.length !== current.length) (next as any)[key] = kept;
      };
      prune("attribute_ids", options.attribute_ids);
      prune("qualifier_ids", options.qualifier_ids);
      prune("ref_types", options.ref_types);
      prune("target_ids", options.target_ids);
      return next;
    });
  }, [options]);

  const typeRelevance = useMemo(() => {
    const t = form.change_element_types;
    if (t.length === 0) return { attr: true, ref: true };
    return {
      attr: t.some((x) => TYPES_WITH_ATTRIBUTE.has(x)),
      ref: t.some((x) => TYPES_WITH_REFERENCE.has(x)),
    };
  }, [form.change_element_types]);

  const createMut = useMutation({
    mutationFn: createNotificationRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => setErr(e.response?.data?.detail || "Failed to create rule"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteNotificationRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const payload: Partial<NotificationRule> = {
      rule_name: form.rule_name,
      notify_channel: form.notify_channel,
      notify_target: form.notify_target,
      change_element_types: form.change_element_types.length ? form.change_element_types : null,
      attribute_ids: form.attribute_ids.length ? form.attribute_ids : null,
      qualifier_ids: form.qualifier_ids.length ? form.qualifier_ids : null,
      ref_types: form.ref_types.length ? form.ref_types : null,
      target_ids: form.target_ids.length ? form.target_ids : null,
    };
    createMut.mutate(payload);
  };

  const activeRules = rules || [];

  return (
    <>
      {/* ── Headline ────────────────────────────────────────── */}
      <section className="mb-6 flex items-end justify-between border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">
            dispatch
          </p>
          <h1 className="font-serif text-4xl font-semibold text-ink leading-none mt-1">
            Alert Rules
          </h1>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 border-2 border-ink font-mono text-[10px] uppercase tracking-widest transition",
            showForm
              ? "bg-ink text-paper"
              : "bg-surface hover:bg-ink hover:text-paper shadow-sharp hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          )}
        >
          <Plus size={12} />
          {showForm ? "cancel" : "new rule"}
        </button>
      </section>

      <p className="font-serif text-base text-ink/70 italic mb-6 max-w-2xl">
        Rules fire on every ingest. Pick one or more change types — the
        attribute, reference, and qualifier lists are then filtered to only
        the values valid for that selection. Fields that don't apply to the
        chosen types are disabled.
      </p>

      {/* ── Create form ─────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={submit}
          className="bg-surface border-2 border-ink shadow-sharp p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          <div className="md:col-span-2">
            <Label>Rule name</Label>
            <Input
              value={form.rule_name}
              onChange={(v) => setForm({ ...form, rule_name: v })}
              placeholder="e.g. Alert me on any DoP compliance change"
              required
            />
          </div>

          <div className="md:col-span-2">
            <Label>Change types</Label>
            <GroupedMultiSelect
              groups={CHANGE_TYPE_GROUPS}
              selected={form.change_element_types}
              onChange={(v) => setForm({ ...form, change_element_types: v })}
              placeholder="any change type"
            />
          </div>

          <div>
            <Label>Attributes</Label>
            <MultiSelect
              options={options?.attribute_ids || []}
              selected={form.attribute_ids}
              onChange={(v) => setForm({ ...form, attribute_ids: v })}
              placeholder="any attribute"
              disabledReason={
                !typeRelevance.attr
                  ? "not applicable for selected change types"
                  : null
              }
            />
          </div>
          <div>
            <Label>Qualifiers</Label>
            <MultiSelect
              options={options?.qualifier_ids || []}
              selected={form.qualifier_ids}
              onChange={(v) => setForm({ ...form, qualifier_ids: v })}
              placeholder="any qualifier"
              disabledReason={
                !typeRelevance.attr
                  ? "not applicable for selected change types"
                  : null
              }
            />
          </div>

          <div>
            <Label>Reference types</Label>
            <MultiSelect
              options={options?.ref_types || []}
              selected={form.ref_types}
              onChange={(v) => setForm({ ...form, ref_types: v })}
              placeholder="any reference type"
              disabledReason={
                !typeRelevance.ref
                  ? "not applicable for selected change types"
                  : null
              }
            />
          </div>
          <div>
            <Label>Target IDs</Label>
            <MultiSelect
              options={options?.target_ids || []}
              selected={form.target_ids}
              onChange={(v) => setForm({ ...form, target_ids: v })}
              placeholder="any target"
              disabledReason={
                !typeRelevance.ref
                  ? "not applicable for selected change types"
                  : null
              }
            />
          </div>

          <div className="md:col-span-2">
            <Label>Channel</Label>
            <div className="flex gap-2">
              {(["email", "slack"] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setForm({ ...form, notify_channel: ch })}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 font-mono text-xs uppercase tracking-wider transition",
                    form.notify_channel === ch
                      ? "border-ink bg-ink text-paper"
                      : "border-ink/20 text-ink/60 hover:border-ink"
                  )}
                >
                  {ch === "email" ? <Mail size={12} /> : <MessageSquare size={12} />}
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>
              {form.notify_channel === "email" ? "Email address" : "Slack webhook URL"}
            </Label>
            <Input
              type={form.notify_channel === "email" ? "email" : "url"}
              value={form.notify_target}
              onChange={(v) => setForm({ ...form, notify_target: v })}
              placeholder={
                form.notify_channel === "email"
                  ? "alerts@example.com"
                  : "https://hooks.slack.com/services/…"
              }
              required
            />
          </div>
          {err && (
            <div className="md:col-span-2 border-l-2 border-rose px-3 py-2 bg-rose-50 font-mono text-xs text-rose">
              {err}
            </div>
          )}
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="bg-ink text-paper font-mono text-xs uppercase tracking-widest px-6 py-2.5 hover:bg-brand transition disabled:opacity-50"
            >
              {createMut.isPending ? "creating…" : "create rule →"}
            </button>
          </div>
        </form>
      )}

      {/* ── Rules list ──────────────────────────────────────── */}
      {activeRules.length === 0 ? (
        <div className="bg-surface border-2 border-ink shadow-sharp p-16 text-center">
          <Bell size={32} className="mx-auto text-ink/20 mb-3" />
          <p className="font-serif text-xl text-ink/60 italic">
            No rules configured.
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink/40">
            create one above to start receiving alerts
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeRules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              onDelete={() => deleteMut.mutate(r.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── RuleCard ──────────────────────────────────────────────────────
function ruleValues(rule: NotificationRule, key: "change_element_types" | "attribute_ids" | "qualifier_ids"): string[] {
  const list = (rule[key] as string[] | null | undefined) || [];
  if (list.length) return list;
  // Fall back to legacy scalar fields
  const scalarKey =
    key === "change_element_types" ? "change_element_type" :
    key === "attribute_ids" ? "attribute_id" : "qualifier_id";
  const s = rule[scalarKey as keyof NotificationRule] as string | null | undefined;
  return s ? [s] : [];
}

function RuleCard({ rule, onDelete }: { rule: NotificationRule; onDelete: () => void }) {
  const Icon = rule.notify_channel === "email" ? Mail : MessageSquare;
  const types = ruleValues(rule, "change_element_types");
  const attrs = ruleValues(rule, "attribute_ids");
  const quals = ruleValues(rule, "qualifier_ids");
  const refs = rule.ref_types || [];
  const targets = rule.target_ids || [];

  return (
    <article className="bg-surface border-2 border-ink shadow-sharp p-5 group relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 border border-ink/20 font-mono text-[10px] uppercase tracking-wider text-ink/70">
            <Icon size={10} />
            {rule.notify_channel}
          </span>
          {rule.active && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-sage">
              <span className="h-1.5 w-1.5 bg-sage rounded-full pulse-dot" />
              active
            </span>
          )}
        </div>
        <button
          onClick={onDelete}
          className="text-ink/30 hover:text-rose transition opacity-0 group-hover:opacity-100"
          aria-label="Delete rule"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <h3 className="font-serif text-xl text-ink leading-tight mb-3">
        {rule.rule_name}
      </h3>

      <div className="space-y-2 mb-3">
        <ChipRow label="dispatch" values={[rule.notify_target]} />
        <ChipRow label="types" values={types.length ? types : ["any"]} />
        <ChipRow label="attrs" values={attrs.length ? attrs : ["any"]} />
        <ChipRow label="quals" values={quals.length ? quals : ["any"]} />
        {refs.length > 0 && <ChipRow label="refs" values={refs} />}
        {targets.length > 0 && <ChipRow label="targets" values={targets} />}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-wider text-ink/40">
        created {absTime(rule.created_at)}
      </p>
    </article>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink/40 w-16 flex-shrink-0 pt-1">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="font-mono text-[11px] text-ink border border-ink/20 px-1.5 py-0.5"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Form building blocks ───────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60 mb-2">
      {children}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = "text", required,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-1.5 font-mono text-sm bg-transparent placeholder:text-ink/30 text-ink"
    />
  );
}

// ── Multi-select: strict pick-from-list, values filtered by backend
// based on the currently selected change types. Disabled when the field
// doesn't apply to the selected types (e.g. attribute picker for a
// reference-only rule). No free-text entry.
function MultiSelect({
  options, selected, onChange, placeholder, disabledReason,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  const remove = (v: string) => onChange(selected.filter((x) => x !== v));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const disabled = Boolean(disabledReason);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center flex-wrap gap-1 min-h-[36px] border-b-2 border-ink/20 focus:border-ink py-1.5 font-mono text-sm text-left",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {selected.length === 0 ? (
          <span className="text-ink/40">
            {disabledReason || placeholder || "select…"}
          </span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-ink text-paper px-1.5 py-0.5 text-[11px]"
              onClick={(e) => { e.stopPropagation(); remove(v); }}
            >
              {v}
              <X size={10} />
            </span>
          ))
        )}
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-paper border-2 border-ink shadow-sharp">
          <div className="sticky top-0 bg-paper border-b border-ink/10 p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter…"
              className="w-full px-2 py-1 bg-transparent font-mono text-xs text-ink outline-none"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-2 font-mono text-xs text-ink/40">
              {options.length === 0 ? "no values available" : "no matches"}
            </div>
          ) : (
            filtered.map((o) => {
              const on = selected.includes(o);
              return (
                <button
                  type="button"
                  key={o}
                  onClick={() => toggle(o)}
                  className={cn(
                    "flex items-center w-full gap-2 px-3 py-1.5 font-mono text-xs text-left hover:bg-surface text-ink",
                    on && "bg-surface"
                  )}
                >
                  <span className={cn(
                    "w-3 h-3 border border-ink flex items-center justify-center",
                    on && "bg-ink text-paper"
                  )}>
                    {on && <Check size={8} />}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              );
            })
          )}
          <div className="sticky bottom-0 bg-paper border-t border-ink/10 flex justify-between p-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink"
            >
              clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink"
            >
              done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Grouped multi-select (for change types) — group header + per-group toggle.
function GroupedMultiSelect({
  groups, selected, onChange, placeholder,
}: {
  groups: { label: string; types: string[] }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const toggleGroup = (types: string[]) => {
    const allOn = types.every((t) => selected.includes(t));
    if (allOn) onChange(selected.filter((x) => !types.includes(x)));
    else onChange(Array.from(new Set([...selected, ...types])));
  };
  const remove = (v: string) => onChange(selected.filter((x) => x !== v));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center flex-wrap gap-1 min-h-[36px] border-b-2 border-ink/20 focus:border-ink py-1.5 font-mono text-sm text-left"
      >
        {selected.length === 0 ? (
          <span className="text-ink/40">{placeholder || "select…"}</span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-ink text-paper px-1.5 py-0.5 text-[11px]"
              onClick={(e) => { e.stopPropagation(); remove(v); }}
            >
              {v}
              <X size={10} />
            </span>
          ))
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-80 overflow-auto bg-paper border-2 border-ink shadow-sharp">
          {groups.map((g) => {
            const allOn = g.types.every((t) => selected.includes(t));
            const someOn = g.types.some((t) => selected.includes(t));
            return (
              <div key={g.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.types)}
                  className="flex items-center justify-between w-full px-3 py-1.5 bg-surface border-b border-ink/10 font-mono text-[10px] uppercase tracking-wider text-ink/70 hover:text-ink"
                >
                  <span>{g.label}</span>
                  <span className="text-ink/40">
                    {allOn ? "all selected" : someOn ? "partial" : "select all"}
                  </span>
                </button>
                {g.types.map((t) => {
                  const on = selected.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => toggle(t)}
                      className={cn(
                        "flex items-center w-full gap-2 px-4 py-1.5 font-mono text-xs text-left hover:bg-surface text-ink",
                        on && "bg-surface"
                      )}
                    >
                      <span className={cn(
                        "w-3 h-3 border border-ink flex items-center justify-center",
                        on && "bg-ink text-paper"
                      )}>
                        {on && <Check size={8} />}
                      </span>
                      <span className="truncate">{t}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="sticky bottom-0 bg-paper border-t border-ink/10 flex justify-between p-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink"
            >
              clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-[10px] uppercase tracking-wider text-ink/50 hover:text-ink"
            >
              done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
