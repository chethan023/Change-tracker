/**
 * Settings page — in-page sub-nav (left) + focused panel (right).
 *
 * Sections:
 *   • My profile      — visible to everyone
 *   • Branding        — admin-only (client name, logo, brand colour, policies)
 *   • STEP integration — admin-only (endpoint + ingest credentials)
 *   • Retention       — admin-only (manual cleanup; no automatic scheduling)
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Masthead, Segmented, Switch, Icon, Avatar,
} from "../ui/primitives";
import {
  fetchConfig, updateConfig, fetchIngestCredentials,
  rotateIngestCredentials, runRetention,
} from "../lib/api";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { toast } from "../ui/toast";
import { confirmDialog } from "../ui/confirm";
import type { ClientConfig } from "../lib/types";

const REDUCE_MOTION_KEY = "ct_reduce_motion";

type SectionId =
  | "profile" | "step" | "branding" | "retention";

interface Section {
  id: SectionId;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const SECTIONS: Section[] = [
  { id: "profile",   label: "My profile",       icon: "user" },
  { id: "branding",  label: "Branding",         icon: "palette",  adminOnly: true },
  { id: "step",      label: "STEP integration", icon: "plug",     adminOnly: true },
  { id: "retention", label: "Retention",        icon: "archive",  adminOnly: true },
];

export default function Settings() {
  const isAdmin = useAuth((s) => s.isAdmin());
  const visible = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const [active, setActive] = useState<SectionId>("profile");

  return (
    <div className="fade-in">
      <Masthead
        eyebrow="Configure"
        title="Settings"
        subtitle="Client configuration, STEP endpoint and branding."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 24,
          alignItems: "start",
          maxWidth: 1100,
        }}
      >
        <SubNav items={visible} active={active} onSelect={setActive} />

        <div style={{ minWidth: 0 }}>
          {active === "profile"   && <ProfilePanel />}
          {active === "step"      && <StepPanel />}
          {active === "branding"  && <BrandingPanel />}
          {active === "retention" && <RetentionPanel />}
        </div>
      </div>
    </div>
  );
}

// ── Sub-nav ──────────────────────────────────────────────────────────

function SubNav({
  items, active, onSelect,
}: {
  items: Section[];
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      style={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      {items.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px",
              borderRadius: 10,
              background: isActive ? "var(--accent-soft)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--fg-secondary)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-text)",
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 500,
              letterSpacing: "-0.005em",
              textAlign: "left",
              transition: "background 140ms, color 140ms",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = "var(--bg-muted)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon name={s.icon} size={15} color="currentColor" />
            <span>{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Panel chrome ─────────────────────────────────────────────────────

function Panel({
  title, desc, children, danger,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className="card"
      style={{
        padding: 24,
        borderColor: danger ? "var(--danger)" : undefined,
        background: danger ? "var(--danger-soft)" : undefined,
      }}
    >
      <h2
        style={{
          margin: 0, fontSize: 20, fontWeight: 600,
          letterSpacing: "-0.014em",
          color: danger ? "var(--danger-fg)" : "var(--fg)",
        }}
      >
        {title}
      </h2>
      {desc && (
        <p
          style={{
            margin: "4px 0 18px",
            fontSize: 13, lineHeight: 1.5,
            color: "var(--fg-tertiary)",
          }}
        >
          {desc}
        </p>
      )}
      {!desc && <div style={{ height: 18 }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </section>
  );
}

// ── Section panels ───────────────────────────────────────────────────

function ProfilePanel() {
  const email = useAuth((s) => s.email);
  const role = useAuth((s) => s.role);
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.set);

  const [reduceMotion, setReduceMotion] = useState<boolean>(
    () => localStorage.getItem(REDUCE_MOTION_KEY) === "1",
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-motion", reduceMotion ? "1" : "0");
    localStorage.setItem(REDUCE_MOTION_KEY, reduceMotion ? "1" : "0");
  }, [reduceMotion]);

  return (
    <Panel
      title="My profile"
      desc="Your account details and on-device display preferences."
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 6 }}>
        <Avatar userId={email || "user"} size={48} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14, fontWeight: 600, color: "var(--fg)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {email || "—"}
          </div>
          <div style={{ marginTop: 4 }}>
            <RoleChip role={role} />
          </div>
        </div>
      </div>

      <Row label="Email" value={<span className="mono">{email || "—"}</span>} />
      <Row
        label="Theme"
        value={
          <Segmented
            value={theme}
            onChange={(v) => setTheme(v as "light" | "dark")}
            options={[
              { value: "light", label: "Light", icon: "sun" },
              { value: "dark",  label: "Dark",  icon: "moon" },
            ]}
            size="sm"
          />
        }
      />
      <Row
        label="Reduce motion"
        hint="Disable transitions and animations."
        value={<Switch on={reduceMotion} onToggle={() => setReduceMotion((v) => !v)} />}
      />
    </Panel>
  );
}

function StepPanel() {
  const { draft, setDraft, save, isSaving, dirty } = useConfigDraft(
    ["step_base_url"] as const,
  );

  return (
    <Panel
      title="STEP integration"
      desc="The OIEP endpoint we point STEP at, and the credentials STEP uses to POST payloads."
    >
      <EditRow
        label="STEP base URL"
        placeholder="https://step.example.com"
        value={draft.step_base_url}
        onChange={(v) => setDraft({ step_base_url: v })}
        mono
      />

      <SaveBar dirty={dirty} valid saving={isSaving} onSave={save} />

      <SectionHeading>Ingestion credentials</SectionHeading>
      <IngestCredentialsBlock />
    </Panel>
  );
}

function IngestCredentialsBlock() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ingest-credentials"],
    queryFn: fetchIngestCredentials,
    // Don't keep secrets cached longer than necessary in the React Query cache.
    staleTime: 0,
    gcTime: 30_000,
  });
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const rotate = useMutation({
    mutationFn: rotateIngestCredentials,
    onSuccess: (next) => {
      qc.setQueryData(["admin-ingest-credentials"], next);
      // Reveal the new key automatically — admin needs it to update STEP.
      setRevealed(true);
      toast({
        tone: "success",
        title: "API key rotated",
        body: "Update STEP OIEP with the new key — the previous key has stopped working.",
      });
    },
    onError: (e: any) => {
      toast({ tone: "error", title: "Rotate failed", body: extractApiError(e) });
    },
  });

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ tone: "error", title: "Couldn't copy", body: "Clipboard access was denied." });
    }
  };

  const onRotate = async () => {
    const ok = await confirmDialog({
      title: "Rotate the ingest API key?",
      body:
        "The current key will stop working immediately, and STEP OIEP must be "
        + "reconfigured with the new key before the next payload.",
      confirmLabel: "Rotate key",
      tone: "warning",
    });
    if (ok) rotate.mutate();
  };

  if (isLoading) return <SkeletonRows count={3} />;
  if (isError || !data) return <ErrorRow text="Couldn't load credentials." />;

  const display = revealed ? data.api_key : data.masked;
  // Backend reports the absolute, externally-reachable URL (PUBLIC_BASE_URL
  // override → X-Forwarded-* → request base URL). Don't second-guess it on
  // the client — window.location.origin would point at the frontend dev
  // server, which STEP can't reach.
  const absoluteUrl = data.endpoint;
  const curl = `curl -X POST "${absoluteUrl}" \\\n  -H "${data.header_name}: ${revealed ? data.api_key : "<API_KEY>"}" \\\n  -H "Content-Type: application/xml" \\\n  --data-binary @payload.xml`;

  return (
    <>
      <Row
        label="Ingest URL"
        value={
          <CopyField
            text={absoluteUrl}
            copied={copied === "endpoint"}
            onCopy={() => copy("endpoint", absoluteUrl)}
          />
        }
        hint="POST a STEPXML payload here with the API key header below."
      />
      <Row
        label="Header name"
        value={
          <CopyField
            text={data.header_name}
            copied={copied === "header"}
            onCopy={() => copy("header", data.header_name)}
          />
        }
      />
      <Row
        label="API key"
        value={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <SourcePill source={data.source} />
            <code
              className="mono"
              style={{
                fontSize: 12.5,
                padding: "5px 10px",
                background: "var(--bg-muted)",
                color: "var(--fg)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                userSelect: revealed ? "all" : "none",
              }}
            >
              {display || "—"}
            </code>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRevealed((v) => !v)}
              title={revealed ? "Hide" : "Reveal"}
              style={{ padding: "5px 8px" }}
            >
              <Icon name={revealed ? "eye-off" : "eye"} size={13} />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => copy("key", data.api_key)}
              disabled={!data.api_key}
              style={{ padding: "5px 10px" }}
            >
              <Icon name={copied === "key" ? "check" : "copy"} size={13} />
              {copied === "key" ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRotate}
              disabled={rotate.isPending}
              title="Generate a new API key"
              style={{ padding: "5px 10px" }}
            >
              <Icon name="refresh-cw" size={13} />
              {rotate.isPending ? "Rotating…" : "Rotate"}
            </button>
          </span>
        }
        hint={
          data.source === "db"
            ? "Generated in-app. Click Rotate to issue a fresh key — the current key stops working immediately."
            : "Currently sourced from the INGEST_API_KEY env var. Click Rotate to take ownership in-app."
        }
      />

      <SectionHeading>Ready-to-paste cURL</SectionHeading>
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: 12,
          background: "var(--bg-muted)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 10,
        }}
      >
        <pre
          className="mono"
          style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: 12, lineHeight: 1.55,
            color: "var(--fg)",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}
        >
          {curl}
        </pre>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => copy("curl", curl)}
          disabled={!data.api_key}
          style={{ padding: "5px 10px", flexShrink: 0 }}
          title={revealed ? "Copy with API key" : "Reveal the key first to include it"}
        >
          <Icon name={copied === "curl" ? "check" : "copy"} size={13} />
          {copied === "curl" ? "Copied" : "Copy"}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--fg-quaternary)", margin: "4px 0 0", lineHeight: 1.5 }}>
        {revealed
          ? "The snippet above includes the live API key — handle with care."
          : "Reveal the API key to embed it in the snippet, otherwise <API_KEY> is shown as a placeholder."}
      </p>
    </>
  );
}

function CopyField({
  text, copied, onCopy,
}: {
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <code
        className="mono"
        style={{
          fontSize: 12.5, padding: "5px 10px",
          background: "var(--bg-muted)", border: "1px solid var(--border-subtle)",
          borderRadius: 8, color: "var(--fg)",
        }}
      >
        {text}
      </code>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onCopy}
        title="Copy"
        style={{ padding: "5px 8px" }}
      >
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>
    </span>
  );
}

function BrandingPanel() {
  const { draft, setDraft, save, isSaving, dirty } = useConfigDraft(
    ["client_name", "logo_url", "primary_colour"] as const,
  );
  const colourValid =
    draft.primary_colour.length === 0 ||
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(draft.primary_colour);

  const logoPreviewUrl = draft.logo_url.trim();

  return (
    <Panel
      title="Branding"
      desc="Tenant identity, logo and accent colour shown on the login screen and chrome. Changes apply after Save."
    >
      <EditRow
        label="Client name"
        placeholder="Acme Corp"
        value={draft.client_name}
        onChange={(v) => setDraft({ client_name: v })}
      />
      <EditRow
        label="Logo URL"
        placeholder="https://…/logo.svg"
        value={draft.logo_url}
        onChange={(v) => setDraft({ logo_url: v })}
        mono
      />
      {logoPreviewUrl && (
        <LogoPreview url={logoPreviewUrl} />
      )}
      <EditRow
        label="Brand colour"
        placeholder="#1B3A6B"
        value={draft.primary_colour}
        onChange={(v) => setDraft({ primary_colour: v })}
        mono
        type="color-text"
        invalid={!colourValid}
      />
      <SaveBar dirty={dirty} valid={colourValid} saving={isSaving} onSave={save} />
    </Panel>
  );
}

function LogoPreview({ url }: { url: string }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [url]);
  if (!ok) return null;
  return (
    <div style={{ paddingLeft: 216, paddingBottom: 4, marginTop: -6 }}>
      <img
        key={url}
        src={url}
        alt="Logo preview"
        onError={() => setOk(false)}
        style={{
          display: "block",
          height: 36, maxWidth: 180,
          objectFit: "contain",
          padding: "6px 10px",
          background: "var(--bg-muted)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
        }}
      />
    </div>
  );
}

// Map UI values → days. Forever ⇒ undefined (skip cleanup of that table).
const CHANGE_RECORDS_OPTIONS: { value: string; label: string; days?: number }[] = [
  { value: "3m",      label: "3 months",  days: 90 },
  { value: "6m",      label: "6 months",  days: 180 },
  { value: "12m",     label: "12 months (default)", days: 365 },
  { value: "24m",     label: "24 months", days: 730 },
  { value: "forever", label: "Forever" }, // no cleanup
];
const PAYLOAD_OPTIONS: { value: string; label: string; days?: number }[] = [
  { value: "30d",  label: "30 days",            days: 30 },
  { value: "60d",  label: "60 days",            days: 60 },
  { value: "90d",  label: "90 days (default)",  days: 90 },
  { value: "365d", label: "365 days",           days: 365 },
];

/** Maps a stored number of days to the matching dropdown key, or null if not found. */
function daysToKey(
  days: number | null | undefined,
  options: { value: string; days?: number }[],
): string | null {
  if (days == null) return null;
  return options.find((o) => o.days === days)?.value ?? null;
}

function RetentionPanel() {
  const qc = useQueryClient();
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
  });

  // Derive initial selections from server config; fall back to localStorage
  // for backward compat when no server preference is stored yet.
  const [recordsRetention, setRecordsRetention] = useState<string>(
    () => localStorage.getItem("ct_retention_records") || "12m",
  );
  const [payloadRetention, setPayloadRetention] = useState<string>(
    () => localStorage.getItem("ct_retention_payload") || "90d",
  );

  // Sync dropdowns when config loads for the first time.
  const configLoadedRef = useRef(false);
  useEffect(() => {
    if (!config || configLoadedRef.current) return;
    configLoadedRef.current = true;
    const rKey = daysToKey(config.change_records_retention_days, CHANGE_RECORDS_OPTIONS);
    if (rKey) setRecordsRetention(rKey);
    const pKey = daysToKey(config.raw_xml_retention_days, PAYLOAD_OPTIONS);
    if (pKey) setPayloadRetention(pKey);
  }, [config]);

  const recordsDays = CHANGE_RECORDS_OPTIONS.find((o) => o.value === recordsRetention)?.days;
  const payloadDays = PAYLOAD_OPTIONS.find((o) => o.value === payloadRetention)?.days;

  const serverRecordsDays = config?.change_records_retention_days ?? undefined;
  const serverPayloadDays = config?.raw_xml_retention_days ?? undefined;
  const retentionDirty =
    recordsDays !== serverRecordsDays || payloadDays !== serverPayloadDays;

  const saveRetention = useMutation({
    mutationFn: () =>
      updateConfig({
        // Send the numeric days, or null to clear ("forever" = no stored preference).
        change_records_retention_days: recordsDays ?? null,
        raw_xml_retention_days: payloadDays ?? null,
      }),
    onSuccess: (next) => {
      qc.setQueryData(["config"], next);
      qc.invalidateQueries({ queryKey: ["config"] });
      // Also persist locally so the preference is visible even before config loads.
      localStorage.setItem("ct_retention_records", recordsRetention);
      localStorage.setItem("ct_retention_payload", payloadRetention);
      toast({ tone: "success", title: "Retention policy saved" });
    },
    onError: (e: any) => {
      toast({ tone: "error", title: "Save failed", body: extractApiError(e) });
    },
  });

  const run = useMutation({
    mutationFn: () =>
      runRetention({
        change_records_days: recordsDays,
        raw_xml_days: payloadDays,
      }),
    onSuccess: (r) => {
      toast({
        tone: "success",
        title: "Retention cleanup complete",
        body:
          `Deleted ${r.change_records_deleted.toLocaleString()} change record${r.change_records_deleted === 1 ? "" : "s"}`
          + ` · cleared XML on ${r.raw_xml_cleared.toLocaleString()} snapshot${r.raw_xml_cleared === 1 ? "" : "s"}.`,
      });
    },
    onError: (e: any) => {
      toast({ tone: "error", title: "Cleanup failed", body: extractApiError(e) });
    },
  });

  return (
    <Panel
      title="Data retention"
      desc="Set how long data is kept, then run cleanup manually or schedule it via the API."
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: "var(--warning-soft)",
          border: "1px solid var(--warning)",
          borderRadius: 8,
          marginBottom: 4,
        }}
      >
        <Icon name="clock" size={14} color="var(--warning-fg)" />
        <span style={{ fontSize: 12.5, color: "var(--warning-fg)", lineHeight: 1.45 }}>
          <strong>No scheduled cleanup is active.</strong> Cleanup only runs when you press
          the button below or call the API endpoint from an external scheduler.
        </span>
      </div>

      {configLoading && <SkeletonRows count={2} />}

      {!configLoading && (
        <>
          <SelectRow
            label="Change records window"
            value={recordsRetention}
            onChange={setRecordsRetention}
            options={CHANGE_RECORDS_OPTIONS.map(({ value, label }) => ({ value, label }))}
          />
          <SelectRow
            label="Raw STEPXML payloads"
            value={payloadRetention}
            onChange={setPayloadRetention}
            options={PAYLOAD_OPTIONS.map(({ value, label }) => ({ value, label }))}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!retentionDirty || saveRetention.isPending}
              onClick={() => saveRetention.mutate()}
            >
              {saveRetention.isPending ? "Saving…" : "Save policy"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4 }}>
            <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
              {(!recordsDays && !payloadDays)
                ? "Both windows set to forever — nothing will be deleted."
                : [
                    recordsDays && `Records older than ${recordsDays} d`,
                    payloadDays && `XML older than ${payloadDays} d`,
                  ].filter(Boolean).join(" · ") + " will be deleted."}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={run.isPending || (!recordsDays && !payloadDays)}
              onClick={async () => {
                const summary = [
                  recordsDays && `delete change records older than ${recordsDays} days`,
                  payloadDays && `clear STEPXML payloads older than ${payloadDays} days`,
                ].filter(Boolean).join(" and ");
                const ok = await confirmDialog({
                  title: "Run cleanup now?",
                  body: `This will ${summary}.`,
                  confirmLabel: "Run cleanup",
                  danger: true,
                });
                if (ok) run.mutate();
              }}
            >
              {run.isPending ? "Running…" : <><Icon name="trash-2" size={13} /> Run cleanup now</>}
            </button>
          </div>
        </>
      )}

      <p style={{ fontSize: 11.5, color: "var(--fg-quaternary)", margin: "6px 0 0", lineHeight: 1.5 }}>
        The policy above is saved server-side and shared across all admin sessions.
        For automated cleanup, call{" "}
        <code className="mono">POST /api/v1/admin/retention/run</code> from your scheduler.
      </p>
    </Panel>
  );
}


// ── Shared rows / atoms ──────────────────────────────────────────────

function Row({
  label, value, hint, mono,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 16, padding: "10px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11.5, color: "var(--fg-quaternary)", marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 13, color: "var(--fg)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-text)",
          textAlign: "right",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EditRow({
  label, value, onChange, placeholder, mono, type, invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: "color-text";
  invalid?: boolean;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        alignItems: "center", gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--fg-secondary)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {type === "color-text" && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value) && (
          <span
            aria-hidden
            style={{
              width: 18, height: 18, borderRadius: 5,
              background: value, border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          />
        )}
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="input input-sm"
          style={{
            flex: 1, minWidth: 0,
            fontFamily: mono ? "var(--font-mono)" : undefined,
            fontSize: 13,
            borderColor: invalid ? "var(--danger)" : undefined,
          }}
        />
      </span>
    </label>
  );
}

function SelectRow({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        alignItems: "center", gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--fg-secondary)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input input-sm"
        style={{ fontSize: 13 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12, marginBottom: 4,
        fontSize: 11, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--fg-tertiary)",
      }}
    >
      {children}
    </div>
  );
}

function SaveBar({
  dirty, valid, saving, onSave,
}: {
  dirty: boolean;
  valid: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
      <button
        className="btn btn-primary btn-sm"
        disabled={!dirty || !valid || saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

// ── Small pills ──────────────────────────────────────────────────────

function RoleChip({ role }: { role: string | null }) {
  if (!role) return <>—</>;
  const palette = role === "admin"
    ? { bg: "var(--accent-soft)", fg: "var(--info-fg)" }
    : role === "editor"
    ? { bg: "var(--success-soft)", fg: "var(--success-fg)" }
    : { bg: "var(--bg-muted)", fg: "var(--fg-secondary)" };
  return (
    <span className="badge" style={{ background: palette.bg, color: palette.fg, textTransform: "capitalize" }}>
      {role}
    </span>
  );
}

function SourcePill({ source }: { source: "db" | "env" }) {
  const palette = source === "db"
    ? { bg: "var(--success-soft)", fg: "var(--success-fg)", label: "In-app" }
    : { bg: "var(--bg-muted)", fg: "var(--fg-secondary)", label: "Env var" };
  return (
    <span className="badge" style={{ background: palette.bg, color: palette.fg, fontSize: 11 }}>
      {palette.label}
    </span>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ height: 12, width: 140, background: "var(--bg-muted)", borderRadius: 4 }} />
          <div style={{ height: 12, width: 80,  background: "var(--bg-muted)", borderRadius: 4 }} />
        </div>
      ))}
    </>
  );
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--danger-soft)", color: "var(--danger-fg)",
        borderRadius: 8, fontSize: 12.5,
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      <Icon name="alert-circle" size={13} /> {text}
    </div>
  );
}

/**
 * FastAPI returns 422 detail as an array of {loc, msg, type} objects, while
 * application errors return `{detail: "string"}`. The previous toast just
 * stringified the array (showing "[object Object]") which is what produced
 * the confusing "method does not exist" wording in the field.
 */
function extractApiError(e: any): string {
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join(" · ");
  }
  if (typeof detail === "string") return detail;
  if (status === 405) return "This update isn't supported by the server. The deployed API may be out of date.";
  if (status === 404) return "The endpoint doesn't exist on the server. Check the API version.";
  if (status === 403) return "You don't have permission to do that.";
  if (typeof e?.message === "string") return e.message;
  return "Please check the form and try again.";
}

// ── Config draft hook ────────────────────────────────────────────────

/**
 * Generic config-draft hook. Each panel asks for the keys it cares about
 * and gets back a typed slice of state plus mutate helpers — so panels can't
 * accidentally clobber fields they don't own.
 */
type ConfigKeys = keyof Pick<
  ClientConfig,
  "client_name" | "primary_colour" | "step_base_url" | "logo_url"
>;
type Draft = Record<ConfigKeys, string>;

function useConfigDraft<K extends readonly ConfigKeys[]>(
  keys: K,
) {
  const qc = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });

  const [draft, setDraftRaw] = useState<Draft>({
    client_name: "",
    primary_colour: "#1B3A6B",
    step_base_url: "",
    logo_url: "",
  });

  // Sync draft with config exactly once — on first load. After that the draft
  // is owned by the user; refetches (e.g., after invalidateQueries on save)
  // must not clobber in-progress edits.
  const initialSyncedRef = useRef(false);
  useEffect(() => {
    if (!config || initialSyncedRef.current) return;
    initialSyncedRef.current = true;
    setDraftRaw((d) => ({
      ...d,
      client_name:    config.client_name    ?? "",
      primary_colour: config.primary_colour ?? "#1B3A6B",
      step_base_url:  config.step_base_url  ?? "",
      logo_url:       config.logo_url       ?? "",
    }));
  }, [config]);

  const setDraft = (partial: Partial<Draft>) =>
    setDraftRaw((d) => ({ ...d, ...partial }));

  const dirty = !!config && keys.some((k) => (draft[k] ?? "") !== ((config as any)[k] ?? ""));

  const mut = useMutation({
    mutationFn: () => {
      const body: Partial<ClientConfig> = {};
      for (const k of keys) (body as any)[k] = draft[k];
      return updateConfig(body);
    },
    onSuccess: (next) => {
      // Optimistic update first so the UI responds immediately, then
      // invalidate so the cache re-syncs with the canonical server value.
      qc.setQueryData(["config"], next);
      qc.invalidateQueries({ queryKey: ["config"] });
      toast({ tone: "success", title: "Saved" });
    },
    onError: (e: any) => {
      toast({
        tone: "error",
        title: "Save failed",
        body: extractApiError(e),
      });
    },
  });

  return {
    config,
    draft,
    setDraft,
    save: () => mut.mutate(),
    isSaving: mut.isPending,
    dirty,
    valid: true,
  };
}
