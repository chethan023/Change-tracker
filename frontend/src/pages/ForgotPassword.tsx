import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword } from "../lib/api";
import AuthShell, {
  AuthField, AuthNote,
} from "../ui/AuthShell";
import { Icon } from "../ui/primitives";
import type { ClientConfig } from "../lib/types";

interface Props { config?: ClientConfig; }

export default function ForgotPassword({ config }: Props) {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await forgotPassword(email);
      setDevUrl(res.reset_url ?? null);
    } finally {
      setBusy(false);
      setDone(true);
    }
  }

  return (
    <AuthShell
      config={config}
      backLink={{ label: "Back to sign in", onClick: () => nav("/login") }}
      badgeIcon="key"
      badgeTone="info"
      title="Forgot your password?"
      subtitle={
        <>
          We'll email you a single-use reset link, valid for{" "}
          <strong style={{ color: "var(--fg)" }}>30 minutes</strong>.
        </>
      }
    >
      {done ? (
        <>
          <AuthNote tone="success">
            If that email is registered, a reset link is on its way.
          </AuthNote>
          {devUrl && (
            // SMTP isn't configured server-side — surface the link directly so
            // a local admin can hand it out manually.
            <AuthNote tone="warning">
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Dev mode — SMTP off</div>
              <a href={devUrl} className="mono" style={{ wordBreak: "break-all" }}>
                {devUrl}
              </a>
            </AuthNote>
          )}
        </>
      ) : (
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
          <button
            type="submit" className="btn btn-primary" disabled={busy}
            style={{
              width: "100%", justifyContent: "center",
              padding: "11px 14px", fontSize: 14, marginTop: 6,
            }}
          >
            {busy ? "Sending…" : <>Send reset link <Icon name="arrow-right" size={14} /></>}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
