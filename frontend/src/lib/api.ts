import axios from "axios";
import type {
  ChangeListResponse, ChangeRecord, FilterOptions,
  Snapshot, ClientConfig, User, NotificationRule,
  NotificationFilterOptions,
  Product, ProductDetail,
} from "./types";

const API_ROOT = (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "") + "/api/v1";

export const api = axios.create({ baseURL: API_ROOT });

// Attach JWT from localStorage on every request
api.interceptors.request.use((cfg) => {
  const tok = localStorage.getItem("ct_token");
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

// Routes that are reachable without a session — never bounce them to /login.
const PUBLIC_PATHS = new Set([
  "/login", "/forgot-password", "/reset-password",
]);

// Redirect on 401 (not authed) or 403 password_change_required
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    if (status === 401 && !PUBLIC_PATHS.has(location.pathname)) {
      localStorage.removeItem("ct_token");
      location.href = "/login";
    } else if (
      status === 403 &&
      detail === "password_change_required" &&
      !location.pathname.endsWith("/change-password")
    ) {
      location.href = "/change-password";
    }
    return Promise.reject(err);
  }
);

// ── endpoints ─────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  return data as {
    access_token: string; user_id: number; email: string; role: string;
    must_change_password: boolean;
  };
}

export async function changePassword(current_password: string, new_password: string) {
  await api.post("/auth/change-password", { current_password, new_password });
}

export async function forgotPassword(email: string): Promise<{ message: string; reset_url?: string | null }> {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(token: string, new_password: string) {
  await api.post("/auth/reset-password", { token, new_password });
}

export async function logout() {
  // Server-side revocation. Errors are swallowed so local state is always cleared.
  try { await api.post("/auth/logout"); } catch { /* noop */ }
}

export async function fetchConfig(): Promise<ClientConfig> {
  const { data } = await api.get("/config");
  return data;
}

export async function updateConfig(body: Partial<ClientConfig>): Promise<ClientConfig> {
  // Try PATCH first; fall back to PUT if a proxy/gateway in front of the
  // API blocks PATCH (manifests as a 405 Method Not Allowed in the UI).
  try {
    const { data } = await api.patch("/config", body);
    return data;
  } catch (err: any) {
    if (err?.response?.status === 405) {
      const { data } = await api.put("/config", body);
      return data;
    }
    throw err;
  }
}

export async function fetchSecurityPolicies(): Promise<import("./types").SecurityPolicies> {
  const { data } = await api.get("/admin/policies");
  return data;
}

export async function fetchIngestCredentials(): Promise<import("./types").IngestCredentials> {
  const { data } = await api.get("/admin/ingest-credentials");
  return data;
}

export async function rotateIngestCredentials(): Promise<import("./types").IngestCredentials> {
  const { data } = await api.post("/admin/ingest-credentials/rotate");
  return data;
}

export async function runRetention(body: {
  change_records_days?: number;
  raw_xml_days?: number;
}): Promise<import("./types").RetentionRunResult> {
  const { data } = await api.post("/admin/retention/run", body);
  return data;
}

export async function resetAllChanges(): Promise<void> {
  // Backend requires X-Confirm header — we set it explicitly so a client
  // can't fire-and-forget; accidental calls without the header 400.
  await api.post("/admin/reset-changes", {}, {
    headers: { "X-Confirm": "DELETE-ALL-CHANGES" },
  });
}

export async function fetchChanges(
  params: Record<string, any>,
  signal?: AbortSignal,
) {
  const { data } = await api.get<ChangeListResponse>("/changes", { params, signal });
  return data;
}

export async function fetchChange(id: number): Promise<ChangeRecord> {
  const { data } = await api.get(`/changes/${id}`);
  return data;
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const { data } = await api.get("/filters/options");
  return data;
}

export async function fetchSnapshots(): Promise<Snapshot[]> {
  const { data } = await api.get("/snapshots");
  return data;
}

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get("/users");
  return data;
}

export async function createUser(body: {
  email: string; password: string; role: string; step_user_id?: string;
}): Promise<User> {
  const { data } = await api.post("/users", body);
  return data;
}

export async function updateUser(
  id: number,
  body: { role?: string; active?: boolean; step_user_id?: string }
): Promise<User> {
  const { data } = await api.patch(`/users/${id}`, body);
  return data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function resetUserPassword(id: number, new_password: string): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { new_password });
}

export async function fetchNotificationRules(): Promise<NotificationRule[]> {
  const { data } = await api.get("/notifications");
  return data;
}

export async function createNotificationRule(body: Partial<NotificationRule>) {
  const { data } = await api.post("/notifications", body);
  return data as NotificationRule;
}

export async function deleteNotificationRule(id: number) {
  await api.delete(`/notifications/${id}`);
}

export async function fetchNotificationFilterOptions(
  changeElementTypes: string[] = []
): Promise<NotificationFilterOptions> {
  const params = new URLSearchParams();
  for (const t of changeElementTypes) params.append("change_element_types", t);
  const qs = params.toString();
  const { data } = await api.get(
    `/notifications/filter-options${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get("/products");
  return data;
}

export async function fetchProduct(id: string): Promise<ProductDetail> {
  const { data } = await api.get(`/products/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchProductTimeline(id: string): Promise<ChangeRecord[]> {
  const { data } = await api.get(`/products/${encodeURIComponent(id)}/timeline`);
  return data;
}

export function exportCsvUrl(params: Record<string, any>) {
  const q = new URLSearchParams(params).toString();
  const tok = localStorage.getItem("ct_token");
  // We include token in query for the direct-download flow (since <a href> can't set headers)
  return `${API_ROOT}/export/csv?${q}${tok ? `&_t=${tok}` : ""}`;
}
