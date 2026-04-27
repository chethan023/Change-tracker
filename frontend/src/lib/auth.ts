import { create } from "zustand";

interface AuthState {
  token: string | null;
  userId: number | null;
  email: string | null;
  role: string | null;
  mustChangePassword: boolean;
  setAuth: (t: string, id: number, email: string, role: string, mustChange: boolean) => void;
  clearMustChangePassword: () => void;
  logout: () => void;
  isAuthed: () => boolean;
  isAdmin: () => boolean;
  isEditor: () => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem("ct_token"),
  userId: Number(localStorage.getItem("ct_user_id")) || null,
  email: localStorage.getItem("ct_email"),
  role: localStorage.getItem("ct_role"),
  mustChangePassword: localStorage.getItem("ct_must_change") === "1",

  setAuth: (token, userId, email, role, mustChange) => {
    localStorage.setItem("ct_token", token);
    localStorage.setItem("ct_user_id", String(userId));
    localStorage.setItem("ct_email", email);
    localStorage.setItem("ct_role", role);
    localStorage.setItem("ct_must_change", mustChange ? "1" : "0");
    set({ token, userId, email, role, mustChangePassword: mustChange });
  },

  clearMustChangePassword: () => {
    localStorage.setItem("ct_must_change", "0");
    set({ mustChangePassword: false });
  },

  logout: () => {
    // Fire-and-forget server-side revocation; we don't await so logout
    // is instant even if the network is slow.
    import("./api").then((m) => m.logout()).catch(() => { /* noop */ });
    ["ct_token", "ct_user_id", "ct_email", "ct_role", "ct_must_change"]
      .forEach((k) => localStorage.removeItem(k));
    set({ token: null, userId: null, email: null, role: null, mustChangePassword: false });
  },

  isAuthed: () => Boolean(get().token),
  isAdmin: () => get().role === "admin",
  isEditor: () => {
    const r = get().role;
    return r === "admin" || r === "editor" || r === "steward";
  },
}));

// Multi-tab session sync: a login or logout in another tab updates this one.
// localStorage `storage` events fire only in *other* tabs (not the originating one),
// which is exactly the behaviour we want.
if (typeof window !== "undefined") {
  const AUTH_KEYS = new Set([
    "ct_token", "ct_user_id", "ct_email", "ct_role", "ct_must_change",
  ]);
  window.addEventListener("storage", (e) => {
    if (!e.key || !AUTH_KEYS.has(e.key)) return;
    useAuth.setState({
      token: localStorage.getItem("ct_token"),
      userId: Number(localStorage.getItem("ct_user_id")) || null,
      email: localStorage.getItem("ct_email"),
      role: localStorage.getItem("ct_role"),
      mustChangePassword: localStorage.getItem("ct_must_change") === "1",
    });
  });
}
