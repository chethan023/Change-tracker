/**
 * Inline alert banner. Used for in-page notices (form errors, deprecation
 * warnings, post-action confirmation messages). For *transient* feedback
 * use the toast layer; for blocking confirmations use confirmDialog().
 *
 * Variants are mapped onto the existing palette tokens — same colours that
 * status badges and the toast layer already use, so the surface stays
 * consistent across the app.
 */
import { ReactNode } from "react";
import { Icon, IconButton } from "./primitives";

export type AlertVariant = "success" | "error" | "warning" | "info";

interface VariantStyle {
  icon: string;
  bg: string;
  fg: string;
  border: string;
  accent: string;
}

const VARIANTS: Record<AlertVariant, VariantStyle> = {
  success: {
    icon: "circle-check",
    bg: "var(--success-soft)",
    fg: "var(--success-fg)",
    border: "var(--success)",
    accent: "var(--success)",
  },
  error: {
    icon: "circle-x",
    bg: "var(--danger-soft)",
    fg: "var(--danger-fg)",
    border: "var(--danger)",
    accent: "var(--danger)",
  },
  warning: {
    icon: "alert-triangle",
    bg: "var(--warning-soft)",
    fg: "var(--warning-fg)",
    border: "var(--warning)",
    accent: "var(--warning)",
  },
  info: {
    icon: "info",
    bg: "var(--info-soft)",
    fg: "var(--accent)",
    border: "var(--accent)",
    accent: "var(--accent)",
  },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Render an X button that calls this when clicked. */
  onDismiss?: () => void;
  /** Optional trailing slot — typically a Button for inline action. */
  action?: ReactNode;
  /** Suppress the leading icon (rare; use only when the surrounding layout already conveys tone). */
  hideIcon?: boolean;
  className?: string;
}

export function Alert({
  variant = "info",
  title,
  children,
  onDismiss,
  action,
  hideIcon,
  className,
}: AlertProps) {
  const v = VARIANTS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={className}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        background: v.bg,
        // Match the rest of the design system (cards/inputs use 10px).
        borderRadius: 10,
        // Soft tone-coloured edge — readable against both light and dark
        // backgrounds without overwhelming the surrounding content.
        border: `1px solid color-mix(in srgb, ${v.border} 30%, transparent)`,
        color: v.fg,
        fontSize: 13.5,
        lineHeight: 1.5,
      }}
    >
      {!hideIcon && (
        <Icon name={v.icon} size={18} color={v.accent} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontWeight: 600, marginBottom: children ? 2 : 0 }}>
            {title}
          </div>
        )}
        {children && (
          <div style={{ color: "inherit", opacity: title ? 0.92 : 1 }}>
            {children}
          </div>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      {onDismiss && (
        <IconButton
          icon="x"
          aria-label="Dismiss"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
