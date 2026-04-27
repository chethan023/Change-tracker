import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon, IconButton, Avatar, Kbd, LiveStatus } from "./primitives";
import { useTheme, applyTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useAppShell } from "./shell";
import {
  fetchSnapshots, fetchProducts, fetchUsers,
  fetchNotificationRules, fetchChanges,
} from "../lib/api";
import { relTime } from "../lib/utils";
import type { ClientConfig } from "../lib/types";

type Tab = {
  to: string;
  label: string;
  icon: string;
  group: "Monitor" | "Library" | "Configure";
  end?: boolean;
  adminOnly?: boolean;
};

const TABS: Tab[] = [
  { to: "/",             label: "Dashboard",  icon: "layout-dashboard", end: true, group: "Monitor" },
  { to: "/changes",      label: "All changes", icon: "list",            group: "Monitor" },
  { to: "/snapshots",    label: "Ingests",     icon: "archive",         group: "Monitor" },
  { to: "/notifications",label: "Alerts",      icon: "bell",            group: "Monitor" },
  { to: "/products",     label: "Products",    icon: "package",         group: "Library" },
  { to: "/users",        label: "Team",        icon: "shield",          group: "Configure", adminOnly: true },
  { to: "/settings",     label: "Settings",    icon: "settings",        group: "Configure" },
];

function useLastIngest() {
  const { data } = useQuery({
    queryKey: ["snapshots", "latest"],
    queryFn: fetchSnapshots,
    refetchInterval: 60_000,
  });
  if (!data || data.length === 0) return null;
  return data[0];
}

/** Safely extract the hostname from a URL string. Returns null on any parse error. */
function safeHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export function TopNav({ config }: { config?: ClientConfig }) {
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const openCommand = useAppShell((s) => s.openCommand);
  const latest = useLastIngest();

  useEffect(() => { applyTheme(theme); }, [theme]);

  const liveLabel = latest
    ? `Live · last payload ${relTime(latest.received_at)}`
    : "Idle · no payloads";

  return (
    <header className="topnav nav-blur">
      <Link
        to="/"
        aria-label="Go to dashboard"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          textDecoration: "none", color: "inherit",
          padding: "4px 6px", margin: "-4px -6px",
          borderRadius: 8,
          transition: "background 140ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-muted)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {config?.logo_url ? (
          <img
            src={config.logo_url}
            alt={config.client_name}
            style={{ height: 18, width: "auto" }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 14, height: 14, borderRadius: "50%",
              background: config?.primary_colour || "var(--accent)",
            }}
          />
        )}
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600, fontSize: 16,
            letterSpacing: "-0.015em",
            color: "var(--fg)",
          }}
        >
          {config?.client_name || "Client"}
        </span>
        <span style={{ width: 1, height: 14, background: "var(--border)" }} />
        <span style={{ fontSize: 13, color: "var(--fg-secondary)" }}>Change Tracker</span>
      </Link>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={openCommand}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 14px 7px 12px",
            border: "1px solid var(--border)",
            background: "var(--bg-muted)",
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: "var(--font-text)",
            fontSize: 13,
            color: "var(--fg-tertiary)",
            minWidth: 220,
          }}
        >
          <Icon name="search" size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>Jump to…</span>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>
        <LiveStatus status={latest ? "live" : "idle"} label={liveLabel} />
        <IconButton
          icon={theme === "dark" ? "sun" : "moon"}
          title="Toggle theme"
          onClick={toggleTheme}
        />
        <UserMenu />
      </div>
    </header>
  );
}

function nameFromEmail(email: string | null): string {
  if (!email) return "Account";
  const local = email.split("@")[0] || email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return local;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function UserMenu() {
  const navigate = useNavigate();
  const email = useAuth((s) => s.email);
  const role = useAuth((s) => s.role);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate("/login");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={email || undefined}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "3px 10px 3px 3px",
          background: open ? "var(--bg-muted)" : "transparent",
          border: "1px solid transparent",
          borderRadius: 999,
          cursor: "pointer",
          transition: "background 140ms",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "var(--bg-muted)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
      >
        <Avatar userId={email || "user"} size={28} />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, maxWidth: 120 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {nameFromEmail(email)}
          </span>
          {role && (
            <span style={{ fontSize: 11, color: "var(--fg-tertiary)", textTransform: "capitalize" }}>
              {role}
            </span>
          )}
        </span>
        <Icon name="chevron-down" size={14} color="var(--fg-tertiary)" />
      </button>

      {open && (
        <div
          role="menu"
          className="ct-user-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            boxShadow: "var(--shadow-popover)",
            padding: 6,
            zIndex: 50,
            transformOrigin: "top right",
            animation: "ct-menu-in 140ms var(--ease-out, cubic-bezier(0,0,0.2,1))",
          }}
        >
          <div style={{ padding: "10px 12px 12px" }}>
            <div style={{ fontSize: 11, color: "var(--fg-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {email || "—"}
            </div>
            {role && (
              <div style={{ fontSize: 11.5, color: "var(--fg-tertiary)", marginTop: 2, textTransform: "capitalize" }}>
                {role}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 4px 6px" }} />

          <MenuItem icon="settings" label="Settings" onClick={() => { setOpen(false); navigate("/settings"); }} />

          <div style={{ height: 1, background: "var(--border-subtle)", margin: "6px 4px" }} />

          <MenuItem icon="log-out" label="Sign out" tone="danger" onClick={handleSignOut} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon, label, onClick, tone,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%",
        padding: "8px 10px",
        background: "transparent", border: "none",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-text)",
        fontSize: 13,
        color: tone === "danger" ? "var(--danger)" : "var(--fg)",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = tone === "danger"
          ? "var(--danger-soft)"
          : "var(--bg-muted)";
      }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Icon name={icon} size={14} color="currentColor" />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

export function Sidebar({ config }: { config?: ClientConfig }) {
  const isAdmin = useAuth((s) => s.isAdmin());
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const groups = ["Monitor", "Library", "Configure"] as const;
  const counts = useNavCounts(isAdmin);
  const stepHost = safeHost(config?.step_base_url);

  return (
    <aside className="sidebar">
      {groups.map((g, gi) => {
        const items = visibleTabs.filter((t) => t.group === g);
        if (items.length === 0) return null;
        return (
          <Fragment key={g}>
            <div className="sidebar-section-label" style={{ paddingTop: gi === 0 ? 0 : 14 }}>
              {g}
            </div>
            {items.map((t) => {
              const count = counts[t.to];
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <Icon name={t.icon} size={16} />
                  <span style={{ flex: 1 }}>{t.label}</span>
                  {typeof count === "number" && (
                    <NavCount n={count} />
                  )}
                </NavLink>
              );
            })}
          </Fragment>
        );
      })}

      <div style={{ marginTop: "auto", paddingTop: 20 }}>
        <div
          style={{
            padding: 12,
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            background: "var(--bg-muted)",
            fontSize: 11.5,
            color: "var(--fg-secondary)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Icon
              name="plug"
              size={13}
              color={stepHost ? "var(--success)" : "var(--fg-tertiary)"}
            />
            <span style={{ fontWeight: 600, color: "var(--fg)" }}>
              {stepHost ? "STEP connected" : "STEP not configured"}
            </span>
          </div>
          <div style={{ color: "var(--fg-tertiary)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stepHost || "Connect STEP in Settings"}
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavCount({ n }: { n: number }) {
  return (
    <span
      className="tabular"
      style={{
        fontSize: 11, fontWeight: 600,
        padding: "1px 7px",
        borderRadius: 999,
        background: "var(--bg-muted)",
        color: "var(--fg-tertiary)",
        minWidth: 20, textAlign: "center",
      }}
    >
      {n > 999 ? "999+" : n}
    </span>
  );
}

function useNavCounts(isAdmin: boolean): Record<string, number | undefined> {
  const STALE = 5 * 60_000;

  const changes = useQuery({
    queryKey: ["changes", "nav-count"],
    queryFn: () => fetchChanges({ page: 1, page_size: 1 }),
    staleTime: STALE,
  });
  const snapshots = useQuery({
    queryKey: ["snapshots"],
    queryFn: fetchSnapshots,
    staleTime: STALE,
  });
  const rules = useQuery({
    queryKey: ["notification-rules"],
    queryFn: fetchNotificationRules,
    staleTime: STALE,
  });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: STALE,
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    enabled: isAdmin,
    staleTime: STALE,
  });

  return {
    "/":              changes.data?.total   ?? undefined,
    "/changes":       changes.data?.total   ?? undefined,
    "/snapshots":     snapshots.data?.length,
    "/notifications": rules.data?.length,
    "/products":      products.data?.length,
    "/users":         users.data?.length,
    "/settings":      undefined,
  };
}
