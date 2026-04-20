import { FormEvent, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { login } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ClientConfig } from "../lib/types";

interface Props { config?: ClientConfig; }

export default function Login({ config }: Props) {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await login(email, password);
      setAuth(res.access_token, res.user_id, res.email, res.role, res.must_change_password);
      if (res.must_change_password) {
        nav("/change-password", { replace: true });
      } else {
        nav(loc.state?.from?.pathname || "/", { replace: true });
      }
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative z-10 p-6">
      <div className="w-full max-w-md">
        {/* Big editorial number over the form */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50">No. 01</p>
            <h1 className="font-serif text-5xl font-semibold leading-none mt-1">
              {config?.client_name || "Change Tracker"}
            </h1>
            <div className="ticker-line mt-3 w-24" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
            sign in
          </span>
        </div>

        <form onSubmit={submit} className="bg-surface border-2 border-ink p-8 shadow-sharp">
          <div className="space-y-6">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60 block mb-2">
                Email
              </label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-2 text-lg bg-transparent"
                required
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60 block mb-2">
                Password
              </label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-2 text-lg bg-transparent font-mono"
                required
              />
            </div>

            {err && (
              <div className="border-l-2 border-rose px-3 py-2 bg-rose-50 font-mono text-xs text-rose">
                {err}
              </div>
            )}

            <button
              type="submit" disabled={busy}
              className="w-full bg-ink text-paper font-mono text-sm uppercase tracking-widest py-3 hover:bg-brand transition disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
