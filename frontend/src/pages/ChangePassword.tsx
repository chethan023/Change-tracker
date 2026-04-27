import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../lib/api";
import { useAuth } from "../lib/auth";
import AuthShell, {
  AuthError, AuthField, AuthNote, PwdRequirements, SigningInAs,
} from "../ui/AuthShell";
import { Icon } from "../ui/primitives";

export default function ChangePassword() {
  const nav = useNavigate();
  const email = useAuth((s) => s.email);
  const mustChange = useAuth((s) => s.mustChangePassword);
  const clearMustChangePassword = useAuth((s) => s.clearMustChangePassword);
  const logout = useAuth((s) => s.logout);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 12) return setErr("Password must be at least 12 characters.");
    if (next !== confirm) return setErr("Passwords don't match.");
    if (next === current) return setErr("New password must differ from current password.");
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
    <AuthShell
      badgeIcon={mustChange ? "shield-alert" : "key-round"}
      badgeTone={mustChange ? "warning" : "info"}
      title={mustChange ? "Set a new password" : "Change your password"}
      subtitle={
        mustChange
          ? "You're signing in with a temporary password. Choose a permanent password to continue."
          : "Pick something you haven't used here before."
      }
    >
      <form onSubmit={submit}>
        {email && <SigningInAs email={email} />}
        {mustChange && (
          <AuthNote tone="warning">
            Your account requires a password change before you can continue.
          </AuthNote>
        )}

        <AuthField
          label="Current password"
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          autoFocus
        />
        <AuthField
          label="New password"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          minLength={12}
        />
        <AuthField
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={12}
        />

        <PwdRequirements pwd={next} confirm={confirm} />

        {err && <div style={{ marginTop: 14 }}><AuthError>{err}</AuthError></div>}

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            type="submit" className="btn btn-primary" disabled={busy}
            style={{ flex: 1, justifyContent: "center", padding: "11px 14px", fontSize: 14 }}
          >
            {busy
              ? "Saving…"
              : <>Set password &amp; continue <Icon name="arrow-right" size={14} /></>}
          </button>
          <button
            type="button" className="btn btn-ghost"
            onClick={() => { logout(); nav("/login"); }}
          >
            Sign out
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
