import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Masthead,
  Icon,
  IconButton,
  StatCard,
  Field,
  Segmented,
  EmptyState,
  absTime,
} from "../ui/primitives";
import { toast } from "../ui/toast";
import {
  createNotificationRule,
  deleteNotificationRule,
  fetchNotificationFilterOptions,
  fetchNotificationRules,
} from "../lib/api";
import type { NotificationRule } from "../lib/types";

const CHANGE_TYPE_GROUPS: { label: string; types: string[] }[] = [
  {
    label: "Create",
    types: ["PRODUCT_CREATED", "REFERENCE_ADDED", "ASSET_LINKED", "CLASSIFICATION_LINKED", "CONTAINER_ADDED"],
  },
  {
    label: "Update",
    types: ["PRODUCT_RECLASSIFIED", "PRODUCT_TYPE_CHANGED", "PRODUCT_NAME_CHANGED", "ATTRIBUTE_VALUE", "MULTIVALUE_CHANGED", "CONTAINER_VALUE"],
  },
  {
    label: "Delete",
    types: ["PRODUCT_DELETED", "REFERENCE_REMOVED", "REFERENCE_SUPPRESSED", "ASSET_UNLINKED", "ASSET_SUPPRESSED", "CLASSIFICATION_UNLINKED", "CONTAINER_REMOVED"],
  },
];

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
  const [params, setParams] = useSearchParams();
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [err, setErr] = useState<string | null>(null);

  const { data: rules } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotificationRules,
  });

  const { data: options } = useQuery({
    queryKey: ["notification-filter-options", form.change_element_types],
    queryFn: () => fetchNotificationFilterOptions(form.change_element_types),
  });

  useEffect(() => {
    if (!options) return;
    setForm((f) => {
      const next = { ...f };
      const prune = (key: keyof RuleForm, allowed: string[]) => {
        if (allowed.length === 0) return;
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
      closeForm();
      toast({ tone: "success", title: "Rule created" });
    },
    onError: (e: any) => setErr(e.response?.data?.detail || "Failed to create rule"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteNotificationRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({ tone: "success", title: "Rule deleted" });
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setErr(null);
    if (params.get("new")) {
      params.delete("new");
      setParams(params, { replace: true });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    createMut.mutate({
      rule_name: form.rule_name,
      notify_channel: form.notify_channel,
      notify_target: form.notify_target,
      change_element_types: form.change_element_types.length ? form.change_element_types : null,
      attribute_ids: form.attribute_ids.length ? form.attribute_ids : null,
      qualifier_ids: form.qualifier_ids.length ? form.qualifier_ids : null,
      ref_types: form.ref_types.length ? form.ref_types : null,
      target_ids: form.target_ids.length ? form.target_ids : null,
    } as Partial<NotificationRule>);
  };

  const activeRules = rules || [];
  const active = activeRules.filter((r) => r.active).length;

  return (
    <div className="fade-in">
      <Masthead
        eyebrow="Dispatch"
        title="Alert rules"
        subtitle="Rules fire on every ingest. Pick one or more change types — dependent fields narrow to matching values."
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> New rule
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <StatCard label="Total rules" value={activeRules.length} />
        <StatCard label="Active" value={active} tone="up" />
        <StatCard label="Channels" value={new Set(activeRules.map((r) => r.notify_channel)).size} />
      </div>

      {activeRules.length === 0 ? (
        <EmptyState
          icon="bell"
          title="No rules configured"
          body="Create one to start receiving alerts on STEP changes."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 14,
          }}
        >
          {activeRules.map((r) => (
            <RuleCard key={r.id} rule={r} onDelete={() => deleteMut.mutate(r.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <RuleBuilder
          form={form}
          setForm={setForm}
          options={options}
          typeRelevance={typeRelevance}
          onSubmit={submit}
          onClose={closeForm}
          pending={createMut.isPending}
          error={err}
        />
      )}
    </div>
  );
}

function ruleValues(
  rule: NotificationRule,
  key: "change_element_types" | "attribute_ids" | "qualifier_ids"
): string[] {
  const list = (rule[key] as string[] | null | undefined) || [];
  if (list.length) return list;
  const scalarKey =
    key === "change_element_types"
      ? "change_element_type"
      : key === "attribute_ids"
      ? "attribute_id"
      : "qualifier_id";
  const s = rule[scalarKey as keyof NotificationRule] as string | null | undefined;
  return s ? [s] : [];
}

function RuleCard({ rule, onDelete }: { rule: NotificationRule; onDelete: () => void }) {
  const types = ruleValues(rule, "change_element_types");
  const attrs = ruleValues(rule, "attribute_ids");
  const quals = ruleValues(rule, "qualifier_ids");
  const refs = rule.ref_types || [];
  const targets = rule.target_ids || [];
  const channelIcon = rule.notify_channel === "email" ? "mail" : "message-square";

  return (
    <article className="card" style={{ padding: 18, position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          className="badge"
          style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}
        >
          <Icon name={channelIcon} size={11} />
          {rule.notify_channel}
        </span>
        {rule.active && (
          <span
            className="badge"
            style={{ background: "var(--success-soft)", color: "var(--success-fg)" }}
          >
            <span className="badge-dot" style={{ background: "var(--success)" }} />
            active
          </span>
        )}
        <div style={{ flex: 1 }} />
        <IconButton icon="trash-2" onClick={onDelete} />
      </div>

      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
        {rule.rule_name}
      </h3>
      <div
        className="mono"
        style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 4, wordBreak: "break-all" }}
      >
        → {rule.notify_target}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        <ChipRow label="Types" values={types.length ? types : ["any"]} muted={types.length === 0} />
        <ChipRow label="Attrs" values={attrs.length ? attrs : ["any"]} muted={attrs.length === 0} />
        <ChipRow label="Quals" values={quals.length ? quals : ["any"]} muted={quals.length === 0} />
        {refs.length > 0 && <ChipRow label="Refs" values={refs} />}
        {targets.length > 0 && <ChipRow label="Targets" values={targets} />}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 11,
          color: "var(--fg-tertiary)",
        }}
      >
        Created {absTime(rule.created_at)}
      </div>
    </article>
  );
}

function ChipRow({ label, values, muted }: { label: string; values: string[]; muted?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span className="label-sm" style={{ width: 60, flexShrink: 0, paddingTop: 3 }}>
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="mono"
            style={{
              fontSize: 11,
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              padding: "1px 6px",
              color: muted ? "var(--fg-quaternary)" : "var(--fg-secondary)",
              background: "var(--bg-elevated)",
            }}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Builder modal ─────────────────────────────────────────── */

function RuleBuilder({
  form,
  setForm,
  options,
  typeRelevance,
  onSubmit,
  onClose,
  pending,
  error,
}: {
  form: RuleForm;
  setForm: (f: RuleForm) => void;
  options: any;
  typeRelevance: { attr: boolean; ref: boolean };
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [step, setStep] = useState<"match" | "scope" | "deliver">("match");
  const stepIdx = step === "match" ? 1 : step === "scope" ? 2 : 3;
  const nextStep = () => setStep(step === "match" ? "scope" : "deliver");
  const prevStep = () => setStep(step === "deliver" ? "scope" : "match");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 760,
          boxShadow: "var(--shadow-lg)",
          animation: "modal-in 280ms var(--ease-spring)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "88vh",
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
          <div style={{ flex: 1 }}>
            <div className="label-sm">Step {stepIdx} of 3</div>
            <h3 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 600 }}>
              {step === "match" ? "What to match" : step === "scope" ? "Narrow the scope" : "Where to send"}
            </h3>
          </div>
          <Segmented
            value={step}
            onChange={setStep}
            options={[
              { value: "match", label: "Match" },
              { value: "scope", label: "Scope" },
              { value: "deliver", label: "Deliver" },
            ]}
          />
          <IconButton icon="x" onClick={onClose} />
        </div>

        <div style={{ padding: 22, overflow: "auto", flex: 1 }}>
          {step === "match" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Field label="Rule name">
                <input
                  className="input"
                  value={form.rule_name}
                  onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
                  placeholder="e.g. Alert me on any compliance change"
                  required
                />
              </Field>
              <Field label="Change types">
                <div style={{ fontSize: 12, color: "var(--fg-tertiary)", marginBottom: 8 }}>
                  Leave empty to match every type.
                </div>
                <GroupedPicker
                  groups={CHANGE_TYPE_GROUPS}
                  selected={form.change_element_types}
                  onChange={(v) => setForm({ ...form, change_element_types: v })}
                />
              </Field>
            </div>
          )}

          {step === "scope" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Field label="Attributes">
                <Picker
                  options={options?.attribute_ids || []}
                  selected={form.attribute_ids}
                  onChange={(v) => setForm({ ...form, attribute_ids: v })}
                  disabled={!typeRelevance.attr}
                  disabledReason="not applicable"
                  placeholder="Any attribute"
                />
              </Field>
              <Field label="Qualifiers">
                <Picker
                  options={options?.qualifier_ids || []}
                  selected={form.qualifier_ids}
                  onChange={(v) => setForm({ ...form, qualifier_ids: v })}
                  disabled={!typeRelevance.attr}
                  disabledReason="not applicable"
                  placeholder="Any qualifier"
                />
              </Field>
              <Field label="Reference types">
                <Picker
                  options={options?.ref_types || []}
                  selected={form.ref_types}
                  onChange={(v) => setForm({ ...form, ref_types: v })}
                  disabled={!typeRelevance.ref}
                  disabledReason="not applicable"
                  placeholder="Any reference type"
                />
              </Field>
              <Field label="Target IDs">
                <Picker
                  options={options?.target_ids || []}
                  selected={form.target_ids}
                  onChange={(v) => setForm({ ...form, target_ids: v })}
                  disabled={!typeRelevance.ref}
                  disabledReason="not applicable"
                  placeholder="Any target"
                />
              </Field>
            </div>
          )}

          {step === "deliver" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Field label="Channel">
                <Segmented
                  value={form.notify_channel}
                  onChange={(v) => setForm({ ...form, notify_channel: v })}
                  options={[
                    { value: "email", label: "Email", icon: "mail" },
                    { value: "slack", label: "Slack", icon: "message-square" },
                  ]}
                />
              </Field>
              <Field
                label={form.notify_channel === "email" ? "Email address" : "Slack webhook URL"}
              >
                <input
                  className="input"
                  type={form.notify_channel === "email" ? "email" : "url"}
                  value={form.notify_target}
                  onChange={(e) => setForm({ ...form, notify_target: e.target.value })}
                  placeholder={
                    form.notify_channel === "email"
                      ? "alerts@example.com"
                      : "https://hooks.slack.com/services/…"
                  }
                  required
                />
              </Field>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 8,
                background: "var(--danger-soft)",
                color: "var(--danger-fg)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          {stepIdx > 1 && (
            <button type="button" className="btn btn-secondary" onClick={prevStep}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
          )}
          {stepIdx < 3 ? (
            <button type="button" className="btn btn-primary" onClick={nextStep}>
              Next <Icon name="arrow-right" size={14} />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create rule"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ── Pickers ───────────────────────────────────────────────── */

function Picker({
  options,
  selected,
  onChange,
  placeholder,
  disabled,
  disabledReason,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const remove = (v: string) => onChange(selected.filter((x) => x !== v));

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          width: "100%",
          minHeight: 40,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: disabled ? "var(--bg-muted)" : "var(--bg-elevated)",
          padding: "6px 10px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 4,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          textAlign: "left",
          fontSize: 13,
          color: "var(--fg)",
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: "var(--fg-quaternary)" }}>
            {disabled ? disabledReason : placeholder}
          </span>
        ) : (
          selected.map((v) => (
            <span
              key={v}
              className="chip"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
            >
              {v}
              <Icon name="x" size={11} />
            </span>
          ))
        )}
        <div style={{ flex: 1 }} />
        <Icon name="chevron-down" size={14} color="var(--fg-tertiary)" />
      </button>

      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 280,
            overflow: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "var(--bg-elevated)",
              padding: 8,
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <input
              autoFocus
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              style={{ fontSize: 12, padding: "4px 10px" }}
            />
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "var(--fg-tertiary)" }}>
              {options.length === 0 ? "No values available" : "No matches"}
            </div>
          ) : (
            filtered.map((o) => {
              const on = selected.includes(o);
              return (
                <button
                  type="button"
                  key={o}
                  onClick={() => toggle(o)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    fontSize: 12.5,
                    background: on ? "var(--accent-soft)" : "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--fg)",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: "1px solid var(--border)",
                      background: on ? "var(--accent)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on && <Icon name="check" size={10} color="#fff" />}
                  </span>
                  <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {o}
                  </span>
                </button>
              );
            })
          )}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              background: "var(--bg-elevated)",
              borderTop: "1px solid var(--border-subtle)",
              padding: 8,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupedPicker({
  groups,
  selected,
  onChange,
}: {
  groups: { label: string; types: string[] }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const toggleGroup = (types: string[]) => {
    const allOn = types.every((t) => selected.includes(t));
    if (allOn) onChange(selected.filter((x) => !types.includes(x)));
    else onChange(Array.from(new Set([...selected, ...types])));
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--bg-elevated)",
      }}
    >
      {groups.map((g, gi) => {
        const allOn = g.types.every((t) => selected.includes(t));
        const someOn = g.types.some((t) => selected.includes(t));
        return (
          <div
            key={g.label}
            style={{
              borderTop: gi === 0 ? "none" : "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "var(--bg-muted)",
              }}
            >
              <span className="label-sm">{g.label}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => toggleGroup(g.types)}
              >
                {allOn ? "Unselect all" : someOn ? "Select rest" : "Select all"}
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 0,
              }}
            >
              {g.types.map((t) => {
                const on = selected.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggle(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: on ? "var(--accent-soft)" : "transparent",
                      border: "none",
                      borderTop: "1px solid var(--border-subtle)",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "var(--fg)",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                        background: on ? "var(--accent)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {on && <Icon name="check" size={10} color="#fff" />}
                    </span>
                    <span
                      className="mono"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
