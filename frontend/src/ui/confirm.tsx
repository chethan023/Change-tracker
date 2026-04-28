/**
 * Imperative confirm dialog — the design-system replacement for
 * window.confirm. Use:
 *
 *   if (await confirmDialog({ title: "Delete user?", body: "...", danger: true })) {
 *     remove.mutate(id);
 *   }
 *
 * Implemented as a single mounted layer + zustand store, mirroring the
 * pattern used by toast.tsx so callers don't need to thread state through
 * their components.
 */
import { ReactNode, useEffect, useRef } from "react";
import { create } from "zustand";
import { Icon } from "./primitives";

type Tone = "info" | "warning" | "danger";

interface ConfirmRequest {
  id: string;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual tone + button styling. `danger` makes the confirm button red. */
  tone?: Tone;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  current: ConfirmRequest | null;
  request: (r: Omit<ConfirmRequest, "id">) => void;
  resolveCurrent: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  request: (r) => {
    // If a dialog is already open we cancel it before showing the new one —
    // back-to-back confirms shouldn't stack invisibly.
    const existing = get().current;
    if (existing) existing.resolve(false);
    const id = Math.random().toString(36).slice(2);
    set({ current: { id, ...r } });
  },
  resolveCurrent: (ok) => {
    const cur = get().current;
    if (!cur) return;
    cur.resolve(ok);
    set({ current: null });
  },
}));

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** Shorthand for `tone: "danger"`. */
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().request({
      title: opts.title,
      body: opts.body,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      tone: opts.tone ?? (opts.danger ? "danger" : "info"),
      resolve,
    });
  });
}

const TONE: Record<Tone, { icon: string; color: string; btn: string }> = {
  info:    { icon: "info",            color: "var(--accent)",  btn: "btn-primary" },
  warning: { icon: "alert-triangle",  color: "var(--warning)", btn: "btn-primary" },
  danger:  { icon: "alert-triangle",  color: "var(--danger)",  btn: "btn-danger" },
};

export function ConfirmLayer() {
  const current = useConfirmStore((s) => s.current);
  const resolveCurrent = useConfirmStore((s) => s.resolveCurrent);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Esc cancels, Enter confirms — match the affordances people expect from
  // window.confirm so muscle memory carries over.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); resolveCurrent(false); }
      else if (e.key === "Enter") { e.preventDefault(); resolveCurrent(true); }
    };
    window.addEventListener("keydown", onKey);
    // Defer focus to next frame so the modal's mount animation doesn't
    // interrupt the focus ring.
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [current, resolveCurrent]);

  if (!current) return null;

  const tone = TONE[current.tone ?? "info"];

  return (
    <div
      className="modal-backdrop"
      onClick={() => resolveCurrent(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 0,
          boxShadow: "var(--shadow-lg)",
          animation: "modal-in 220ms var(--ease-spring)",
        }}
      >
        <div style={{ padding: "20px 22px 12px", display: "flex", gap: 14 }}>
          <div
            style={{
              width: 36, height: 36, flexShrink: 0,
              borderRadius: 999,
              background: `color-mix(in srgb, ${tone.color} 14%, transparent)`,
              color: tone.color,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Icon name={tone.icon} size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="confirm-title"
              style={{
                margin: 0, fontSize: 15.5, fontWeight: 600,
                color: "var(--fg)", letterSpacing: "-0.01em",
              }}
            >
              {current.title}
            </h3>
            {current.body && (
              <div
                style={{
                  marginTop: 6, fontSize: 13.5, lineHeight: 1.5,
                  color: "var(--fg-secondary)",
                }}
              >
                {current.body}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex", justifyContent: "flex-end", gap: 8,
            padding: "12px 18px 16px",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => resolveCurrent(false)}
          >
            {current.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`btn ${tone.btn} btn-sm`}
            onClick={() => resolveCurrent(true)}
          >
            {current.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
