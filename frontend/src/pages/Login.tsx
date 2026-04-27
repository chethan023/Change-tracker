import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { useAuth } from "../lib/auth";
import AuthShell, {
  AuthError, AuthField, AuthLinkButton,
} from "../ui/AuthShell";
import { Icon } from "../ui/primitives";
import type { ClientConfig } from "../lib/types";

interface Props { config?: ClientConfig; }

export default function Login({ config }: Props) {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const setAuth = useAuth((s) => s.setAuth);
  const authed = useAuth((s) => s.isAuthed());
  const mustChange = useAuth((s) => s.mustChangePassword);

  if (authed && !mustChange) {
    return <Navigate to={loc.state?.from?.pathname || "/"} replace />;
  }
  if (authed && mustChange) {
    return <Navigate to="/change-password" replace />;
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      setAuth(res.access_token, res.user_id, res.email, res.role, res.must_change_password);
      nav(
        res.must_change_password ? "/change-password" : (loc.state?.from?.pathname || "/"),
        { replace: true },
      );
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      config={config}
      title="Sign in"
      subtitle="Welcome back. Enter your tenant credentials."
    >
      <form onSubmit={submit}>
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@example.com"
          autoComplete="email"
          autoFocus
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          rightSlot={
            <AuthLinkButton onClick={() => nav("/forgot-password")}>
              Forgot?
            </AuthLinkButton>
          }
        />
        {err && <AuthError>{err}</AuthError>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy}
          style={{
            width: "100%", justifyContent: "center",
            padding: "11px 14px", fontSize: 14, marginTop: 6,
          }}
        >
          {busy ? "Signing in…" : <>Sign in <Icon name="arrow-right" size={14} /></>}
        </button>
      </form>
    </AuthShell>
  );
}
