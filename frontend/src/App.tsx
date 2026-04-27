import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Component, lazy, ReactNode, Suspense, useEffect } from "react";
import { fetchConfig } from "./lib/api";
import { useAuth } from "./lib/auth";
import { useTheme, applyTheme, applyBrandColour } from "./lib/theme";
import { useAppShell } from "./ui/shell";
import { TopNav, Sidebar } from "./ui/Chrome";
import DiffViewer from "./ui/DiffViewer";
import CommandPalette from "./ui/CommandPalette";
import { ToastLayer } from "./ui/toast";
import Login from "./pages/Login";
import type { ClientConfig } from "./lib/types";

// Authed routes are split out of the initial bundle — cuts first-paint on
// /login by ~40-60% since login users never need dashboard chunks.
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword  = lazy(() => import("./pages/ResetPassword"));
const Dashboard      = lazy(() => import("./pages/Dashboard"));
const Changes        = lazy(() => import("./pages/Changes"));
const Snapshots      = lazy(() => import("./pages/Snapshots"));
const Notifications  = lazy(() => import("./pages/Notifications"));
const Products       = lazy(() => import("./pages/Products"));
const ProductDetail  = lazy(() => import("./pages/ProductDetail"));
const Settings       = lazy(() => import("./pages/Settings"));
const Users          = lazy(() => import("./pages/Users"));

function RouteFallback() {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--fg-tertiary)" }}>
      <span className="spinner" style={{ marginRight: 8 }} /> Loading…
    </div>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────
// Catches render errors so a single broken page doesn't white-screen the app.

interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 48, textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "var(--danger-soft)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}
          >
            ⚠️
          </div>
          <h2 style={{ margin: 0, fontSize: 20, color: "var(--fg)" }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-tertiary)", maxWidth: 360, lineHeight: 1.5 }}>
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Route guards ──────────────────────────────────────────────────────

function Guard({ children }: { children: React.ReactElement }) {
  const authed = useAuth((s) => s.isAuthed());
  const mustChange = useAuth((s) => s.mustChangePassword);
  const loc = useLocation();
  if (!authed) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (mustChange) return <Navigate to="/change-password" replace />;
  return children;
}

function AdminGuard({ children }: { children: React.ReactElement }) {
  const isAdmin = useAuth((s) => s.isAdmin());
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function ChangePasswordGuard({ children }: { children: React.ReactElement }) {
  const authed = useAuth((s) => s.isAuthed());
  const loc = useLocation();
  if (!authed) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

// ── App shell ─────────────────────────────────────────────────────────

function AppShell({ config }: { config?: ClientConfig }) {
  const openCommand = useAppShell((s) => s.openCommand);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommand();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openCommand]);

  return (
    <div className="app">
      <TopNav config={config} />
      <Sidebar config={config} />
      <main className="main fade-in">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <DiffViewer />
      <CommandPalette />
      <ToastLayer />
    </div>
  );
}

export default function App() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const theme = useTheme((s) => s.theme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    applyBrandColour(config?.primary_colour);
    document.title = config?.client_name
      ? `${config.client_name} — Change Tracker`
      : "Change Tracker";
  }, [config]);

  return (
    <Routes>
      <Route path="/login" element={<Login config={config} />} />
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ForgotPassword config={config} />
          </Suspense>
        }
      />
      <Route
        path="/reset-password"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ResetPassword config={config} />
          </Suspense>
        }
      />
      <Route
        path="/change-password"
        element={
          <ChangePasswordGuard>
            <Suspense fallback={<RouteFallback />}>
              <ChangePassword />
            </Suspense>
          </ChangePasswordGuard>
        }
      />
      <Route
        element={
          <Guard>
            <AppShell config={config} />
          </Guard>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<AdminGuard><Users /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
