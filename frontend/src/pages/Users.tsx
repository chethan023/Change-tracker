import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, KeyRound, UserPlus, X, Check } from "lucide-react";
import {
  fetchUsers, createUser, updateUser, deleteUser, resetUserPassword,
} from "../lib/api";
import type { User, UserRole } from "../lib/types";
import { useAuth } from "../lib/auth";
import { cn, relTime } from "../lib/utils";

const ROLES: UserRole[] = ["admin", "editor", "viewer"];

export default function Users() {
  const qc = useQueryClient();
  const me = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => updateUser(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => updateUser(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <>
      <section className="mb-6 flex items-end justify-between border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 dark:text-ink/60">
            administration
          </p>
          <h1 className="font-serif text-4xl font-semibold text-ink leading-none mt-1">
            User Management
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-4 py-2 hover:bg-brand transition"
        >
          <UserPlus size={14} /> New user
        </button>
      </section>

      {banner && (
        <div className="mb-4 border-l-2 border-sage bg-sage-50 px-3 py-2 font-mono text-xs text-sage flex items-center justify-between">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)}><X size={14} /></button>
        </div>
      )}

      {isLoading ? (
        <div className="font-mono text-xs text-ink/60">Loading users…</div>
      ) : (
        <div className="bg-surface border-2 border-ink shadow-sharp overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="bg-ink/5 border-b border-ink/10 text-ink/60 dark:text-ink/70 uppercase tracking-wider text-[10px]">
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Must Change PW</Th>
                <Th>Last login</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-ink/10 hover:bg-ink/5">
                  <Td>
                    <span className="text-ink">{u.email}</span>
                    {u.id === me.userId && (
                      <span className="ml-2 text-[10px] text-amber-900 dark:text-amber">(you)</span>
                    )}
                  </Td>
                  <Td>
                    <select
                      value={u.role}
                      disabled={u.id === me.userId}
                      onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value })}
                      className="bg-transparent text-ink border border-ink/20 px-2 py-1 font-mono text-xs disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-surface text-ink">{r}</option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <button
                      disabled={u.id === me.userId}
                      onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}
                      className={cn(
                        "px-2 py-1 border font-mono text-[10px] uppercase tracking-wider",
                        u.active
                          ? "border-sage text-sage"
                          : "border-ink/30 text-ink/50",
                        "disabled:opacity-50"
                      )}
                    >
                      {u.active ? "active" : "disabled"}
                    </button>
                  </Td>
                  <Td>
                    {u.must_change_password ? (
                      <span className="text-amber-900 dark:text-amber">yes</span>
                    ) : (
                      <span className="text-ink/40">no</span>
                    )}
                  </Td>
                  <Td className="text-ink/70">
                    {u.last_login ? relTime(u.last_login) : "never"}
                  </Td>
                  <Td className="text-right">
                    <button
                      onClick={() => setResettingId(u.id)}
                      className="inline-flex items-center gap-1 text-ink/60 hover:text-ink px-2"
                      title="Reset password"
                    >
                      <KeyRound size={12} /> reset
                    </button>
                    <button
                      disabled={u.id === me.userId}
                      onClick={() => {
                        if (confirm(`Delete ${u.email}? This cannot be undone.`)) {
                          remove.mutate(u.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-rose hover:text-rose-900 px-2 disabled:opacity-30"
                      title="Delete user"
                    >
                      <Trash2 size={12} /> delete
                    </button>
                  </Td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><Td colSpan={6} className="text-center text-ink/50 py-6">No users</Td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(email) => {
            setBanner(`User ${email} created. They'll be required to change password on first login.`);
            qc.invalidateQueries({ queryKey: ["users"] });
            setShowCreate(false);
          }}
        />
      )}

      {resettingId !== null && (
        <ResetPasswordModal
          userId={resettingId}
          userEmail={users.find((u) => u.id === resettingId)?.email || ""}
          onClose={() => setResettingId(null)}
          onReset={(email) => {
            setBanner(`Password reset for ${email}. They'll be required to change it on next login.`);
            qc.invalidateQueries({ queryKey: ["users"] });
            setResettingId(null);
          }}
        />
      )}
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("text-left px-4 py-2", className)}>{children}</th>;
}
function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-4 py-3", className)}>{children}</td>;
}

function CreateUserModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 12) {
      setErr("Temporary password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      const u = await createUser({ email, password, role });
      onCreated(u.email);
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Create user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <ModalField label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-2 bg-transparent text-ink font-mono" />
        </ModalField>
        <ModalField label="Temporary password (min 12 chars)">
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
            required className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-2 bg-transparent text-ink font-mono" />
          <p className="mt-1 font-mono text-[10px] text-ink/50 dark:text-ink/60">
            Share with user securely — they will be forced to change on first login.
          </p>
        </ModalField>
        <ModalField label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full border border-ink/20 px-3 py-2 bg-transparent text-ink font-mono">
            {ROLES.map((r) => (
              <option key={r} value={r} className="bg-surface text-ink">{r}</option>
            ))}
          </select>
        </ModalField>
        {err && (
          <div className="border-l-2 border-rose px-3 py-2 bg-rose-50 font-mono text-xs text-rose">
            {err}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="font-mono text-xs uppercase tracking-widest text-ink/60 hover:text-ink px-3">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="bg-ink text-paper font-mono text-xs uppercase tracking-widest px-4 py-2 hover:bg-brand disabled:opacity-50 inline-flex items-center gap-2">
            <Check size={12} /> {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ResetPasswordModal({
  userId, userEmail, onClose, onReset,
}: {
  userId: number; userEmail: string;
  onClose: () => void;
  onReset: (email: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 12) { setErr("Password must be at least 12 characters."); return; }
    setBusy(true);
    try {
      await resetUserPassword(userId, pw);
      onReset(userEmail);
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Reset password — ${userEmail}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <ModalField label="New temporary password (min 12 chars)">
          <input type="text" value={pw} onChange={(e) => setPw(e.target.value)}
            required className="w-full border-b-2 border-ink/20 focus:border-ink outline-none py-2 bg-transparent text-ink font-mono" />
          <p className="mt-1 font-mono text-[10px] text-ink/50 dark:text-ink/60">
            The user will be required to change it on next login.
          </p>
        </ModalField>
        {err && (
          <div className="border-l-2 border-rose px-3 py-2 bg-rose-50 font-mono text-xs text-rose">
            {err}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="font-mono text-xs uppercase tracking-widest text-ink/60 hover:text-ink px-3">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="bg-ink text-paper font-mono text-xs uppercase tracking-widest px-4 py-2 hover:bg-brand disabled:opacity-50">
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/40 dark:bg-black/70">
      <div className="w-full max-w-md bg-surface border-2 border-ink shadow-sharp">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60 dark:text-ink/70 block mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}
