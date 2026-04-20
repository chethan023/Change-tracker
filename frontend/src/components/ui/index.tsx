import React from "react";
import { cn } from "../../lib/utils";
import { Loader2, Inbox } from "lucide-react";

/* ── Button ────────────────────────────────────────────────── */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 font-mono uppercase tracking-widest " +
  "border-2 transition select-none disabled:opacity-40 disabled:cursor-not-allowed";

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-ink bg-ink text-paper hover:bg-brand hover:border-brand hover:text-paper",
  secondary:
    "border-ink bg-surface text-ink shadow-sharp hover:shadow-none " +
    "hover:translate-x-1 hover:translate-y-1 hover:bg-ink hover:text-paper",
  ghost:
    "border-transparent bg-transparent text-ink/70 hover:text-ink hover:bg-ink/5",
  danger:
    "border-rose bg-rose/10 text-rose hover:bg-rose hover:text-paper",
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-[10px]",
  md: "px-3 py-1.5 text-xs",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], className)}
      {...rest}
    >
      {loading && <Loader2 size={12} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

/* ── Card ──────────────────────────────────────────────────── */
export function Card({
  className,
  children,
  padded = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        "border-2 border-ink bg-surface shadow-sharp",
        padded && "p-4",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Input ─────────────────────────────────────────────────── */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leading?: React.ReactNode;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ leading, label, id, className, ...rest }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block font-mono text-[10px] uppercase tracking-widest text-ink/60 mb-1"
          >
            {label}
          </label>
        )}
        <div className="flex items-center gap-2 border-2 border-ink bg-surface px-3 py-2 shadow-sharp focus-within:shadow-none focus-within:translate-x-1 focus-within:translate-y-1 transition">
          {leading && <span className="text-ink/50 shrink-0">{leading}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "flex-1 bg-transparent outline-none font-mono text-sm text-ink placeholder:text-ink/40",
              className
            )}
            {...rest}
          />
        </div>
      </div>
    );
  }
);
Input.displayName = "Input";

/* ── Select ────────────────────────────────────────────────── */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, id, className, children, ...rest }, ref) => {
    const autoId = React.useId();
    const selId = id || autoId;
    return (
      <div className="inline-flex flex-col">
        {label && (
          <label
            htmlFor={selId}
            className="font-mono text-[10px] uppercase tracking-widest text-ink/60 mb-1"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selId}
          className={cn(
            "border-2 border-ink bg-surface text-ink px-2 py-1 font-mono text-xs",
            className
          )}
          {...rest}
        >
          {children}
        </select>
      </div>
    );
  }
);
Select.displayName = "Select";

/* ── Spinner ───────────────────────────────────────────────── */
export function Spinner({ size = 16, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-2 text-ink/60">
      <Loader2 size={size} className="animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ── Skeleton primitives ───────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} />;
}

export function TableSkeleton({
  rows = 6,
  cols = 5,
}: { rows?: number; cols?: number }) {
  return (
    <div className="border-2 border-ink bg-surface shadow-sharp">
      <div className="border-b-2 border-ink bg-ink/5 px-3 py-2 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-24" />
        ))}
      </div>
      <div className="divide-y divide-ink/10">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-3 py-2.5 flex gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-3", c === 0 ? "w-40" : "w-24")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────── */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-2 border-dashed border-ink/30 bg-surface/40 p-10 text-center",
        className
      )}
      role="status"
    >
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center border-2 border-ink/30 text-ink/50">
        {icon ?? <Inbox size={18} aria-hidden />}
      </div>
      <div className="font-serif text-xl text-ink">{title}</div>
      {description && (
        <p className="mt-1 font-mono text-xs text-ink/60 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  );
}

/* ── Error state ───────────────────────────────────────────── */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-2 border-rose bg-rose/10 p-4 font-mono text-xs text-rose"
    >
      <div className="font-serif text-lg not-italic mb-1">{title}</div>
      {description && <p className="text-rose/90">{description}</p>}
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry} className="mt-3">
          retry
        </Button>
      )}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeCls = { md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];

  return (
    <div
      className="fixed inset-0 bg-paper/70 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-surface border-2 border-ink shadow-sharp w-full max-h-[85vh] flex flex-col",
          sizeCls
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="p-4 border-b-2 border-ink">
            {title && (
              <h3 className="font-serif text-2xl font-semibold text-ink">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 font-mono text-xs text-ink/60">{description}</p>
            )}
          </div>
        )}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
