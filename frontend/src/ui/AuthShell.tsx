/**
 * AuthShell — single-card layout shared by all unauthenticated screens.
 *
 * Visual reference: change-tracker design bundle, src/Login.jsx —
 * brand-dot header, ambient radial-gradient backdrop, soft-tinted icon
 * badges, focus-following labels, password requirements grid.
 *
 * All styling is bound to design tokens (`--accent`, `--bg`, `--shadow-lg`,
 * etc.) so dark mode, density, and brand colour propagate without edits here.
 */
import { ReactNode, useState } from "react";
import { Icon } from "./primitives";
import type { ClientConfig } from "../lib/types";

export interface AuthShellProps {
  config?: ClientConfig;
  /** Lucide icon name for the soft-tinted badge above the heading. */
  badgeIcon?: string;
  /** Tone of the badge background — info uses --accent, etc. */
  badgeTone?: "info" | "warning" | "success" | "danger";
  /** Page heading. */
  title: string;
  /** Optional supporting copy under the heading. */
  subtitle?: ReactNode;
  /** Optional back-link rendered above the badge (for sub-flows). */
  backLink?: { label: string; onClick: () => void };
  /** Card body — usually a <form>. */
  children: ReactNode;
  /** Footer slot under the card — links like "Forgot password?". */
  footer?: ReactNode;
}

const TONE: Record<string, { bg: string; fg: string }> = {
  info:    { bg: "var(--accent-soft)",  fg: "var(--accent)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)" },
  danger:  { bg: "var(--danger-soft)",  fg: "var(--danger)" },
};

export default function AuthShell({
  config, badgeIcon, badgeTone = "info",
  title, subtitle, backLink, children, footer,
}: AuthShellProps) {
  const tone = TONE[badgeTone];
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
        fontFamily: "var(--font-text)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient radial backdrop — picks up brand accent automatically. */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background:
            "radial-gradient(ellipse 80% 60% at 20% 10%, color-mix(in oklch, var(--accent) 12%, transparent), transparent), " +
            "radial-gradient(ellipse 60% 50% at 90% 90%, color-mix(in oklch, var(--accent) 8%, transparent), transparent)",
        }}
      />

      <div style={{ position: "relative", width: "100%", maxWidth: 440 }}>
        <div
          className="card"
          style={{
            padding: "36px 36px 28px",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-lg)",
            background: "var(--bg-elevated)",
          }}
        >
          <BrandHeader config={config} />

          {backLink && (
            <button
              type="button"
              onClick={backLink.onClick}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "transparent", border: "none", padding: 0,
                color: "var(--accent)", cursor: "pointer",
                fontFamily: "var(--font-text)", fontSize: 12, fontWeight: 500,
                marginBottom: 14,
              }}
            >
              <Icon name="arrow-left" size={12} /> {backLink.label}
            </button>
          )}

          {badgeIcon && (
            <div
              style={{
                width: 48, height: 48, borderRadius: 12,
                background: tone.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <Icon name={badgeIcon} size={20} color={tone.fg} />
            </div>
          )}

          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 28, fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              style={{
                marginTop: 6, marginBottom: 24,
                fontSize: 13.5, lineHeight: 1.55,
                color: "var(--fg-tertiary)",
              }}
            >
              {subtitle}
            </div>
          )}
          {!subtitle && <div style={{ height: 18 }} />}

          {children}

          <div
            style={{
              marginTop: 24, paddingTop: 20,
              borderTop: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 11.5, color: "var(--fg-quaternary)",
            }}
          >
            <span>© 2026 {config?.client_name || "Change Tracker"}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="lock" size={10} /> Secured by SSO
            </span>
          </div>
        </div>

        {footer && (
          <div
            style={{
              marginTop: 16, textAlign: "center",
              color: "var(--fg-tertiary)", fontSize: 13,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function BrandHeader({ config }: { config?: ClientConfig }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
      {config?.logo_url ? (
        <img src={config.logo_url} alt="" style={{ height: 22, display: "block" }} />
      ) : (
        <span
          aria-hidden
          style={{
            width: 18, height: 18, borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600, fontSize: 17,
          letterSpacing: "-0.015em",
          color: "var(--fg)",
        }}
      >
        {config?.client_name || "Change Tracker"}
      </span>
      <span style={{ width: 1, height: 14, background: "var(--border)" }} />
      <span style={{ fontSize: 13, color: "var(--fg-secondary)" }}>Change Tracker</span>
    </div>
  );
}

// ── Form primitives ──────────────────────────────────────────────────

/**
 * Field with focus-following label (label colour shifts to --accent when
 * the input is focused) + optional right-aligned slot for inline links.
 */
export function AuthField({
  label, type = "text", value, onChange, placeholder, autoFocus,
  autoComplete, minLength, required = true, rightSlot,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  rightSlot?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <label
          style={{
            fontSize: 11.5, fontWeight: 600,
            letterSpacing: "0.04em", textTransform: "uppercase",
            color: focused ? "var(--accent)" : "var(--fg-secondary)",
            transition: "color 120ms",
          }}
        >
          {label}
        </label>
        {rightSlot}
      </div>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 12px",
        background: "var(--danger-soft)", color: "var(--danger-fg)",
        borderRadius: 8, fontSize: 12.5,
        marginBottom: 14,
      }}
    >
      <Icon name="alert-circle" size={13} /> {children}
    </div>
  );
}

export function AuthNote({
  tone = "info", children,
}: {
  tone?: "info" | "warning" | "success";
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      style={{
        background: t.bg,
        color: tone === "warning" ? "var(--warning-fg)"
             : tone === "success" ? "var(--success-fg)"
             : "var(--info-fg)",
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 12.5,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

/** "Signing in as <user>" pill seen on the design's Set-new-password step. */
export function SigningInAs({ email }: { email: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px",
        background: "var(--bg-muted)",
        borderRadius: 10,
        marginBottom: 16,
        fontSize: 12.5,
      }}
    >
      <Icon name="user" size={13} color="var(--fg-tertiary)" />
      <span style={{ color: "var(--fg-secondary)" }}>Signing in as</span>
      <strong style={{ color: "var(--fg)" }}>{email}</strong>
    </div>
  );
}

/**
 * Live password requirements grid — matches the design's PwdRequirements,
 * but the rules mirror our backend (≥12 chars, server-side validated).
 */
export function PwdRequirements({ pwd, confirm }: { pwd: string; confirm?: string }) {
  const reqs = [
    { label: "At least 12 characters", pass: pwd.length >= 12 },
    { label: "One uppercase letter",   pass: /[A-Z]/.test(pwd) },
    { label: "One number",             pass: /[0-9]/.test(pwd) },
    ...(confirm !== undefined
      ? [{ label: "Both passwords match", pass: pwd.length > 0 && pwd === confirm }]
      : []),
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "4px 10px",
        marginTop: 8, marginBottom: 4,
      }}
    >
      {reqs.map((r) => (
        <div
          key={r.label}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11.5,
            color: r.pass ? "var(--success-fg)" : "var(--fg-quaternary)",
            transition: "color 140ms",
          }}
        >
          <Icon
            name={r.pass ? "check-circle-2" : "circle"}
            size={12}
            color={r.pass ? "var(--success)" : "var(--fg-quaternary)"}
          />
          {r.label}
        </div>
      ))}
    </div>
  );
}

/** Inline link button used inside field labels (e.g. "Forgot?"). */
export function AuthLinkButton({
  onClick, children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent", border: "none", padding: 0,
        color: "var(--accent)", cursor: "pointer",
        fontFamily: "var(--font-text)",
        fontSize: 11.5, fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}
