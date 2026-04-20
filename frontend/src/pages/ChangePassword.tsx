import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function ChangePassword() {
  const nav = useNavigate();
  const { email, mustChangePassword, clearMustChangePassword, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 12) {
      setErr("New password must be at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    if (next === current) {
      setErr("New password must differ from current password.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      clearMustChangePassword();
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative z-10 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 dark:text-ink/60">
            No. 02 — Security
          </p>
          <h1 className="font-serif text-4xl font-semibold leading-none mt-1 text-ink">
            Change your password
          </h1>
          <div className="ticker-line mt-3 w-24" />
          {mustChangePassword && (
            <p className="mt-4 font-mono text-xs text-amber-900 dark:text-amber">
              Your account requires a password change before you can continue.
            </p>
          )}
          <p className="mt-2 font-mono text-[11px] text-ink/60 dark:text-ink/70">
            Signed in as {email}
          </p>
        </div>

        <form onSubmit={submit} className="bg-surface border-2 border-ink p-8 shadow-sharp">
          <div className="space-y-6">
            <Field label="Current password" value={current} setValue={setCurrent} type="password" />
            <Field label="New password (min 12 chars)" value={next} setValue={setNext} type="password" />
            <Field label="Confirm new password" value={confirm} setValue={setConfirm} type="password" />

            {err && (
              <div className="border-l-2 border-rose px-3 py-2 bg-rose-50 font-mono text-xs text-rose">
                {err}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit" disabled={busy}
                className="flex-1 bg-ink text-paper font-mono text-sm uppercase tracking-widest py-3 hover:bg-brand transition disabled:opacity-50"
              >
                {busy ? "Saving…" : "Update password →"}
              </button>
              <button
                type="button"
                onClick={() => { logout(); nav("/login"); }}
                className="font-mono text-[11px] uppercase tracking-widest text-ink/60 hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, setValue, type,
}: {
  label: string; value: string; setValue: (v: string) => void; type: string;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60 dark:text-ink/70 block mb-2">
        {label}
      </label>
      <input
        type={type} value={value} onChange={(e) => setValue(e.target.value)}
        className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-2 text-lg bg-transparent font-mono text-ink"
        required
      />
    </div>
  );
}
