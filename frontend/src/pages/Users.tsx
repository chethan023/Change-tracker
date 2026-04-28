/**
 * Users — admin-only management screen.
 *
 * Rebuilt against the design tokens (no Tailwind editorial classes). Uses
 * `.card`, `.input`, `.btn-*`, `.badge` from `design/kit.css` and the
 * existing chrome primitives so theme + density propagate automatically.
 */
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchUsers, createUser, updateUser, deleteUser, resetUserPassword,
} from "../lib/api";
import type { User, UserRole } from "../lib/types";
import { useAuth } from "../lib/auth";
import { relTime } from "../lib/utils";
import {
  Masthead, Icon, Avatar, StatCard, IconButton,
} from "../ui/primitives";
import { toast } from "../ui/toast";
import { confirmDialog } from "../ui/confirm";

const ROLES: UserRole[] = ["admin", "editor", "viewer"];

export default function Users() {
  const qc = useQueryClient();
  const me = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => updateUser(id, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ tone: "success", title: "Role updated" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => updateUser(id, { active }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ tone: "success", title: vars.active ? "User enabled" : "User disabled" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ tone: "success", title: "User deleted" });
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    pending: users.filter((u) => u.must_change_password).length,
  }), [users]);

  return (
    <div className="fade-in">
      <Masthead
        eyebrow="Configure"
        title="Users"
        subtitle="Invite teammates, assign roles, and reset passwords."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate(true)}
          >
            <Icon name="user-plus" size={14} /> Create user
          </button>
        }
      />

      {/* Stat cards */}
      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <StatCard label="Total users" value={counts.total} />
        <StatCard label="Admins"       value={counts.admins} />
        <StatCard label="Awaiting first login" value={counts.pending} />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex", gap: 12, alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 12px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            flex: 1, maxWidth: 460,
          }}
        >
          <Icon name="search" size={14} color="var(--fg-tertiary)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or role…"
            className="input-bare"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="input input-sm"
          style={{ width: 160, fontSize: 13 }}
        >
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg-tertiary)" }}>
          {filtered.length} of {users.length}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%", minWidth: 720, borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><Td colSpan={5} center muted>Loading users…</Td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><Td colSpan={5} center muted>No users match this filter.</Td></tr>
              )}
              {filtered.map((u, i) => (
                <UserRow
                  key={u.id}
                  u={u}
                  isMe={u.id === me.userId}
                  isLast={i === filtered.length - 1}
                  onRoleChange={(role) => updateRole.mutate({ id: u.id, role })}
                  onReset={() => setResettingId(u.id)}
                  onToggleActive={() =>
                    toggleActive.mutate({ id: u.id, active: !u.active })
                  }
                  onDelete={async () => {
                    const ok = await confirmDialog({
                      title: `Delete ${u.email}?`,
                      body: "This cannot be undone. The user will lose access immediately.",
                      confirmLabel: "Delete user",
                      danger: true,
                    });
                    if (ok) remove.mutate(u.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(email) => {
            toast({
              tone: "success",
              title: `${email} created`,
              body: "They'll be required to change password on first login.",
            });
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
            toast({
              tone: "success",
              title: `Password reset for ${email}`,
              body: "They'll be required to change it on next login.",
            });
            qc.invalidateQueries({ queryKey: ["users"] });
            setResettingId(null);
          }}
        />
      )}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────

function UserRow({
  u, isMe, isLast, onRoleChange, onReset, onToggleActive, onDelete,
}: {
  u: User;
  isMe: boolean;
  isLast: boolean;
  onRoleChange: (role: string) => void;
  onReset: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <tr
      className="row-hover"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--border-subtle)" }}
    >
      <Td>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar userId={u.email} size={28} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600, color: "var(--fg)",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {u.email}
              {isMe && <YouChip />}
            </div>
          </div>
        </div>
      </Td>
      <Td>
        <select
          value={u.role}
          disabled={isMe}
          onChange={(e) => onRoleChange(e.target.value)}
          className="input input-sm"
          style={{
            width: 130, fontSize: 12.5, padding: "6px 10px",
            opacity: isMe ? 0.55 : 1, cursor: isMe ? "not-allowed" : "pointer",
          }}
          title={isMe ? "You can't change your own role" : undefined}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Td>
      <Td>
        <StatusBadge user={u} />
      </Td>
      <Td>
        <span style={{ color: "var(--fg-tertiary)" }}>
          {u.last_login ? relTime(u.last_login) : "never"}
        </span>
      </Td>
      <Td align="right">
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <IconButton
            icon="key-round"
            title="Reset password"
            onClick={onReset}
          />
          <IconButton
            icon={u.active ? "user-x" : "user-check"}
            title={
              isMe
                ? "You can't disable yourself"
                : u.active ? "Disable user" : "Enable user"
            }
            onClick={onToggleActive}
            disabled={isMe}
          />
          <IconButton
            icon="trash-2"
            title={isMe ? "You can't delete yourself" : "Delete user"}
            onClick={onDelete}
            disabled={isMe}
          />
        </div>
      </Td>
    </tr>
  );
}

function StatusBadge({ user }: { user: User }) {
  if (!user.active) {
    return (
      <span className="badge" style={{ background: "var(--bg-muted)", color: "var(--fg-secondary)" }}>
        <span className="badge-dot" style={{ background: "var(--fg-quaternary)" }} />
        Disabled
      </span>
    );
  }
  if (user.must_change_password) {
    return (
      <span className="badge" style={{ background: "var(--warning-soft)", color: "var(--warning-fg)" }}>
        <span className="badge-dot" style={{ background: "var(--warning)" }} />
        Awaiting first login
      </span>
    );
  }
  return (
    <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success-fg)" }}>
      <span className="badge-dot" style={{ background: "var(--success)" }} />
      Active
    </span>
  );
}

function YouChip() {
  return (
    <span
      style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--accent)", background: "var(--accent-soft)",
        padding: "2px 6px", borderRadius: 4,
      }}
    >
      You
    </span>
  );
}

// ── Table cells ──────────────────────────────────────────────────────

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "12px 16px",
        fontSize: 11, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--fg-tertiary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children, colSpan, align = "left", center, muted,
}: {
  children: React.ReactNode;
  colSpan?: number;
  align?: "left" | "right";
  center?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: center ? "center" : align,
        padding: "12px 16px",
        verticalAlign: "middle",
        color: muted ? "var(--fg-tertiary)" : "var(--fg)",
      }}
    >
      {children}
    </td>
  );
}

// ── Modals ───────────────────────────────────────────────────────────

function ModalShell({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%", maxWidth: 460,
          background: "var(--bg-elevated)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
            {title}
          </h2>
          <IconButton icon="x" title="Close" onClick={onClose} />
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalField({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span
        style={{
          display: "block", marginBottom: 6,
          fontSize: 11.5, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.04em",
          color: "var(--fg-secondary)",
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            display: "block", marginTop: 6,
            fontSize: 11.5, color: "var(--fg-tertiary)", lineHeight: 1.5,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function ModalError({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        background: "var(--danger-soft)", color: "var(--danger-fg)",
        borderRadius: 8, fontSize: 12.5,
        marginBottom: 12,
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      <Icon name="alert-circle" size={13} /> {children}
    </div>
  );
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
      <form onSubmit={submit}>
        <ModalField label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required autoFocus
            placeholder="name@example.com"
          />
        </ModalField>
        <ModalField
          label="Temporary password (min 12 chars)"
          hint="Share with the user securely — they'll be forced to change on first login."
        >
          <input
            className="input mono"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required minLength={12}
          />
        </ModalField>
        <ModalField label="Role">
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </ModalField>
        {err && <ModalError>{err}</ModalError>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ResetPasswordModal({
  userId, userEmail, onClose, onReset,
}: {
  userId: number;
  userEmail: string;
  onClose: () => void;
  onReset: (email: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 12) {
      setErr("Password must be at least 12 characters.");
      return;
    }
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
      <form onSubmit={submit}>
        <ModalField
          label="New temporary password (min 12 chars)"
          hint="The user will be required to change it on next login."
        >
          <input
            className="input mono"
            type="text"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required minLength={12} autoFocus
          />
        </ModalField>
        {err && <ModalError>{err}</ModalError>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
