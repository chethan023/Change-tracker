import { create } from "zustand";
import { Icon } from "./primitives";

export interface Toast {
  id: string;
  tone?: "success" | "error" | "info";
  title: string;
  body?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 3400);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(t: Omit<Toast, "id">) {
  useToasts.getState().push(t);
}

export function ToastLayer() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toast-layer">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Icon
            name={t.tone === "success" ? "circle-check" : t.tone === "error" ? "circle-x" : "info"}
            size={18}
            color={
              t.tone === "success"
                ? "var(--success)"
                : t.tone === "error"
                ? "var(--danger)"
                : "var(--accent)"
            }
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t.title}</div>
            {t.body && <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
