import { FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../lib/api";
import AuthShell, {
  AuthError, AuthField, PwdRequirements,
} from "../ui/AuthShell";
import { Icon } from "../ui/primitives";
import type { ClientConfig } from "../lib/types";

interface Props { config?: ClientConfig; }

export default function ResetPassword({ config }: Props) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) return <Navigate to="/forgot-password" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw1 !== pw2) return setErr("Passwords don't match.");
    if (pw1.length < 12) return setErr("Password must be at least 12 characters.");
    setBusy(true);
    try {
      await resetPassword(token, pw1);
      nav("/login", { replace: true, state: { resetSuccess: true } });
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Reset failed — link may have expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      config={config}
      backLink={{ label: "Back to sign in", onClick: () => nav("/login") }}
      badgeIcon="shield-check"
      badgeTone="success"
      title="Set a new password"
      subtitle="Choose a strong password — at least 12 characters."
    >
      <form onSubmit={submit}>
        <AuthField
          label="New password"
          type="password"
          value={pw1}
          onChange={setPw1}
          autoComplete="new-password"
          minLength={12}
          autoFocus
        />
        <AuthField
          label="Confirm password"
          type="password"
          value={pw2}
          onChange={setPw2}
          autoComplete="new-password"
          minLength={12}
        />

        <PwdRequirements pwd={pw1} confirm={pw2} />

        {err && <div style={{ marginTop: 14 }}><AuthError>{err}</AuthError></div>}

        <button
          type="submit" className="btn btn-primary" disabled={busy}
          style={{
            width: "100%", justifyContent: "center",
            padding: "11px 14px", fontSize: 14, marginTop: 14,
          }}
        >
          {busy ? "Saving…" : <>Set password &amp; continue <Icon name="arrow-right" size={14} /></>}
        </button>
      </form>
    </AuthShell>
  );
}
