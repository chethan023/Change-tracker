import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchConfig } from "./lib/api";
import { useAuth } from "./lib/auth";
import { useTheme, applyTheme } from "./lib/theme";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import Snapshots from "./pages/Snapshots";
import Notifications from "./pages/Notifications";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Users from "./pages/Users";
import Layout from "./components/Layout";

function Guard({ children }: { children: JSX.Element }) {
  const authed = useAuth((s) => s.isAuthed());
  const mustChange = useAuth((s) => s.mustChangePassword);
  const loc = useLocation();
  if (!authed) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (mustChange) return <Navigate to="/change-password" replace />;
  return children;
}

function AdminGuard({ children }: { children: JSX.Element }) {
  const isAdmin = useAuth((s) => s.isAdmin());
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function ChangePasswordGuard({ children }: { children: JSX.Element }) {
  const authed = useAuth((s) => s.isAuthed());
  const loc = useLocation();
  if (!authed) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

export default function App() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  const theme = useTheme((s) => s.theme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    if (config?.primary_colour) {
      document.documentElement.style.setProperty("--brand-colour", config.primary_colour);
    }
    if (config?.client_name) {
      document.title = `${config.client_name} — Change Tracker`;
    }
  }, [config]);

  return (
    <Routes>
      <Route path="/login" element={<Login config={config} />} />
      <Route
        path="/change-password"
        element={<ChangePasswordGuard><ChangePassword /></ChangePasswordGuard>}
      />
      <Route
        element={
          <Guard>
            <Layout config={config} />
          </Guard>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/snapshots" element={<Snapshots />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/users" element={<AdminGuard><Users /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
