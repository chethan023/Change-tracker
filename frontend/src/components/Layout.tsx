import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LogOut, LayoutGrid, Activity, Bell, Package, Users as UsersIcon } from "lucide-react";
import type { ClientConfig } from "../lib/types";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import ThemeToggle from "./ThemeToggle";

interface Props { config?: ClientConfig; }

const baseNavItems = [
  { to: "/", label: "Changes", icon: LayoutGrid, end: true, adminOnly: false },
  { to: "/products", label: "Products", icon: Package, end: false, adminOnly: false },
  { to: "/snapshots", label: "Ingests", icon: Activity, end: false, adminOnly: false },
  { to: "/notifications", label: "Alerts", icon: Bell, end: false, adminOnly: false },
  { to: "/users", label: "Users", icon: UsersIcon, end: false, adminOnly: true },
];

export default function Layout({ config }: Props) {
  const nav = useNavigate();
  const { email, role, logout } = useAuth();
  const isAdmin = role === "admin";
  const navItems = baseNavItems.filter((n) => !n.adminOnly || isAdmin);

  const handleLogout = () => { logout(); nav("/login"); };

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* ── Editorial Masthead ─────────────────────────────────── */}
      <header className="border-b-2 border-ink bg-paper">
        <div className="max-w-[1600px] mx-auto px-6">
          {/* Top strip — date + user */}
          <div className="flex justify-between items-center py-2 text-xs font-mono uppercase tracking-wider text-ink/60 border-b border-ink/10">
            <span>Vol. 1 — Ingested changes from STIBO STEP</span>
            <span className="flex items-center gap-3">
              <span>{email} · <span className="text-amber-900">{role}</span></span>
              <ThemeToggle compact />
              <button onClick={handleLogout}
                aria-label="Sign out"
                className="flex items-center gap-1 hover:text-ink transition">
                <LogOut size={12} aria-hidden /> sign out
              </button>
            </span>
          </div>

          {/* Masthead */}
          <div className="flex items-end justify-between py-5">
            <div>
              <h1 className="font-serif text-4xl tracking-tight font-semibold text-ink leading-none">
                {config?.client_name || "Change Tracker"}
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                PIM Change Tracker / established 2024 / STEPXML driven
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-sage pulse-dot" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink/60">
                live ingest
              </span>
            </div>
          </div>

          <div className="ticker-line" />

          {/* Navigation */}
          <nav aria-label="Primary" className="flex gap-0 overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end || false}
                className={({ isActive }) => cn(
                  "group px-5 py-3 font-mono text-xs uppercase tracking-widest border-r border-ink/10 flex items-center gap-2 transition whitespace-nowrap",
                  isActive
                    ? "bg-ink text-paper"
                    : "text-ink/60 hover:text-ink hover:bg-ink/5"
                )}
              >
                <Icon size={14} aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-ink/10 mt-8 py-4">
        <div className="max-w-[1600px] mx-auto px-6 font-mono text-[10px] uppercase tracking-widest text-ink/40">
          {config?.client_name || "Change Tracker"} · schema: stibosystems.com/step
        </div>
      </footer>
    </div>
  );
}
