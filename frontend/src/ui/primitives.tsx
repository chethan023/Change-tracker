import { ReactNode, CSSProperties, ButtonHTMLAttributes } from "react";
import * as Icons from "lucide-react";
import type { ChangeElementType } from "../lib/types";
import { relTime, absTime } from "../lib/utils";

export { relTime, absTime };

/* ── Icon (thin wrapper over lucide-react) ─────────────────── */
type IconName = keyof typeof Icons;

// Convert kebab name to PascalCase (lucide-react exports PascalCase components)
function pascal(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function Icon({
  name,
  size = 16,
  color,
  style,
  strokeWidth = 1.5,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  const Comp = (Icons as unknown as Record<string, Icons.LucideIcon>)[pascal(name)] as
    | Icons.LucideIcon
    | undefined;
  if (!Comp) return <span style={{ width: size, height: size, display: "inline-block" }} />;
  return (
    <Comp
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      style={{ display: "inline-flex", flexShrink: 0, ...style }}
    />
  );
}

/* ── Button ─────────────────────────────────────────────────── */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  icon?: string;
}
export function Button({
  variant = "primary",
  size,
  icon,
  children,
  className,
  ...rest
}: ButtonProps) {
  const cls = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", className || ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  style,
  disabled,
}: {
  icon: string;
  title?: string;
  onClick?: () => void;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  return (
    <button
      className="btn btn-icon"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/* ── Keyboard shortcut pill ─────────────────────────────────── */
export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ── Change-type badge ──────────────────────────────────────── */
const CHANGE_VARIANTS = {
  add: { bg: "var(--success-soft)", fg: "var(--success-fg)", dot: "var(--change-add)" },
  modify: { bg: "var(--info-soft)", fg: "var(--info-fg)", dot: "var(--change-modify)" },
  remove: { bg: "var(--danger-soft)", fg: "var(--danger-fg)", dot: "var(--change-remove)" },
  move: { bg: "rgba(175,82,222,0.14)", fg: "#6A2B94", dot: "var(--change-move)" },
  suppress: { bg: "var(--bg-muted)", fg: "var(--fg-secondary)", dot: "var(--change-suppress)" },
} as const;

export function variantFor(type: string): keyof typeof CHANGE_VARIANTS {
  if (/CREATED|ADDED|LINKED/.test(type)) return "add";
  if (/DELETED|REMOVED|UNLINKED/.test(type)) return "remove";
  if (/RECLASSIFIED|TYPE_CHANGED/.test(type)) return "move";
  if (/SUPPRESSED/.test(type)) return "suppress";
  return "modify";
}

export function ChangeTypeBadge({ type }: { type: ChangeElementType | string }) {
  const v = CHANGE_VARIANTS[variantFor(type)];
  return (
    <span className="badge" style={{ background: v.bg, color: v.fg }}>
      <span className="badge-dot" style={{ background: v.dot }} />
      {type.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

/* ── Avatar (derived from username string) ──────────────────── */
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#0071E3,#AF52DE)",
  "linear-gradient(135deg,#34C759,#0071E3)",
  "linear-gradient(135deg,#FF9F0A,#FF3B30)",
  "linear-gradient(135deg,#AF52DE,#FF3B30)",
  "linear-gradient(135deg,#0071E3,#34C759)",
  "linear-gradient(135deg,#FF9F0A,#AF52DE)",
  "linear-gradient(135deg,#86868B,#4B4B50)",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function userColor(id: string): string {
  return AVATAR_GRADIENTS[hashStr(id || "system") % AVATAR_GRADIENTS.length];
}

export function userInitials(id: string): string {
  if (!id) return "··";
  const cleaned = id.replace(/@.*$/, "").split(/[._\-\s]+/).filter(Boolean);
  if (cleaned.length === 0) return id.slice(0, 2).toUpperCase();
  if (cleaned.length === 1) return cleaned[0].slice(0, 2).toUpperCase();
  return (cleaned[0][0] + cleaned[1][0]).toUpperCase();
}

export function userDisplayName(id: string | null | undefined): string {
  if (!id) return "System";
  return id
    .replace(/@.*$/, "")
    .replace(/[._]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Avatar({
  userId,
  size = 28,
}: {
  userId: string | null | undefined;
  size?: number;
}) {
  const id = userId || "system";
  return (
    <span
      title={userDisplayName(id)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: userColor(id),
        color: "#fff",
        fontFamily: "var(--font-text)",
        fontWeight: 600,
        fontSize: size * 0.42,
        letterSpacing: "-0.01em",
        flexShrink: 0,
      }}
    >
      {userInitials(id)}
    </span>
  );
}

/* ── Segmented control ──────────────────────────────────────── */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm";
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
          style={size === "sm" ? { padding: "5px 11px", fontSize: 12 } : undefined}
        >
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Switch ─────────────────────────────────────────────────── */
export function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`switch ${on ? "on" : ""}`}
      style={{ appearance: "none", border: "none", padding: 0, cursor: "pointer", background: "transparent" }}
    />
  );
}

/* ── Sparkline ──────────────────────────────────────────────── */
export function Sparkline({
  data,
  color = "var(--accent)",
  softColor = "var(--accent-soft)",
  w = 260,
  h = 40,
  filled = true,
}: {
  data: number[];
  color?: string;
  softColor?: string;
  w?: number;
  h?: number;
  filled?: boolean;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2]);
  const path = "M" + pts.map((p) => p.map((n) => n.toFixed(2)).join(",")).join(" L");
  const area = path + ` L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      {filled && <path d={area} fill={softColor} />}
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Empty state ────────────────────────────────────────────── */
export function EmptyState({
  icon = "inbox",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="card fade-in"
      style={{
        padding: 48,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--bg-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--fg-tertiary)",
          marginBottom: 4,
        }}
      >
        <Icon name={icon} size={28} />
      </div>
      <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
      {body && (
        <div style={{ fontSize: 13.5, color: "var(--fg-tertiary)", maxWidth: 420, lineHeight: 1.5 }}>{body}</div>
      )}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

/* ── Mini stat cards ────────────────────────────────────────── */
export function StatCard({
  label,
  value,
  delta,
  tone,
  spark,
  accent,
}: {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "up" | "down" | "neutral" | "warn";
  spark?: number[];
  accent?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: accent || (tone === "warn" ? "var(--warning-fg)" : "var(--fg)") }}>
        {value}
      </div>
      {delta && <div className={`stat-delta ${tone === "up" ? "up" : tone === "down" ? "down" : ""}`}>{delta}</div>}
      {spark && (
        <div style={{ position: "absolute", right: 14, bottom: 12, width: 86, opacity: 0.8 }}>
          <Sparkline data={spark} w={86} h={26} color={accent || "var(--accent)"} softColor="transparent" filled={false} />
        </div>
      )}
    </div>
  );
}

/* ── Live indicator ─────────────────────────────────────────── */
export function LiveStatus({
  status = "live",
  label,
}: {
  status?: "live" | "idle" | "disconnected";
  label?: string;
}) {
  const map = {
    live: { bg: "var(--success-soft)", fg: "var(--success-fg)", dot: "var(--success)", text: label || "Live" },
    idle: { bg: "var(--bg-muted)", fg: "var(--fg-secondary)", dot: "var(--fg-tertiary)", text: label || "Idle" },
    disconnected: { bg: "var(--danger-soft)", fg: "var(--danger-fg)", dot: "var(--danger)", text: "Disconnected" },
  };
  const s = map[status];
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg }}>
      <span style={{ position: "relative", width: 7, height: 7, display: "inline-block" }}>
        <span className="badge-dot" style={{ background: s.dot, position: "absolute", inset: 0 }} />
        {status === "live" && (
          <span
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: "50%",
              border: `2px solid ${s.dot}`,
              animation: "pulse-ring 1.8s ease-out infinite",
              opacity: 0.5,
            }}
          />
        )}
      </span>
      {s.text}
    </span>
  );
}

/* ── Label/Field helpers ────────────────────────────────────── */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="label-sm" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export function SettingsCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{title}</h3>
      {desc && (
        <div style={{ fontSize: 12.5, color: "var(--fg-tertiary)", marginBottom: 14, lineHeight: 1.5 }}>{desc}</div>
      )}
      <div className="stack" style={{ gap: 12 }}>{children}</div>
    </div>
  );
}

/* ── XML syntax highlighter ─────────────────────────────────── */
function highlightXml(str: string): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "<") {
      const end = str.indexOf(">", i);
      if (end === -1) {
        out.push({ text: str.slice(i), cls: "" });
        break;
      }
      const tag = str.slice(i, end + 1);
      const m = tag.match(/^<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>$/);
      if (m) {
        out.push({ text: "<" + m[1], cls: "xml-punct" });
        out.push({ text: m[2], cls: "xml-tag" });
        const re = /\s+([A-Za-z][\w:-]*)="([^"]*)"/g;
        let am: RegExpExecArray | null;
        while ((am = re.exec(m[3])) !== null) {
          out.push({ text: " ", cls: "" });
          out.push({ text: am[1], cls: "xml-attr" });
          out.push({ text: "=", cls: "xml-punct" });
          out.push({ text: `"${am[2]}"`, cls: "xml-str" });
        }
        out.push({ text: (m[4] || "") + ">", cls: "xml-punct" });
      } else {
        out.push({ text: tag, cls: "" });
      }
      i = end + 1;
    } else {
      const next = str.indexOf("<", i);
      const chunk = next === -1 ? str.slice(i) : str.slice(i, next);
      out.push({ text: chunk, cls: "" });
      i = next === -1 ? str.length : next;
    }
  }
  return out;
}

export function XmlLine({ text }: { text: string }) {
  const tokens = highlightXml(text);
  return (
    <>
      {tokens.map((t, k) => (
        <span key={k} className={t.cls}>
          {t.text}
        </span>
      ))}
    </>
  );
}

/* ── Page masthead ──────────────────────────────────────────── */
export function Masthead({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 20,
        paddingBottom: 18,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h1 style={{ margin: 0, fontSize: 32 }}>{title}</h1>
        {subtitle && (
          <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--fg-tertiary)" }}>{subtitle}</div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}

/* ── Search shell ───────────────────────────────────────────── */
export function SearchShell({
  value,
  onChange,
  placeholder,
  right,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  right?: ReactNode;
}) {
  return (
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
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && <IconButton icon="x" onClick={() => onChange("")} />}
      {right}
    </div>
  );
}
