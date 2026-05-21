import { SB_URL, SB_KEY, sbFetch } from "./supabaseClient";
import { clearAuthContext } from "./authContext";
import { isPublicRegistrationAllowed } from "../config/appEnvironment.js";
import { guardDemoCannotUseProduction } from "../lib/demoSafety.js";

export { getSession, getUserId } from "./supabaseClient";

function assertAuthTargetSafe(context) {
  guardDemoCannotUseProduction(SB_URL, context);
}

export async function signUp(email, password) {
  assertAuthTargetSafe("auth:signup");
  if (!isPublicRegistrationAllowed()) {
    throw new Error(
      "El registro libre está desactivado en este entorno. Usa las cuentas demo o contacta con soporte.",
    );
  }
  const res = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || d.msg || "Error al registrarse");
  if (d.access_token) {
    localStorage.setItem("sb_session", JSON.stringify(d));
  }
  return d;
}

export async function signIn(email, password) {
  assertAuthTargetSafe("auth:signIn");
  clearAuthContext();
  localStorage.removeItem("sb_session");
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || d.msg || "Email o contraseña incorrectos");
  clearAuthContext();
  const dark = localStorage.getItem("dark");
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k !== "dark") keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  if (dark) localStorage.setItem("dark", dark);
  localStorage.setItem("sb_session", JSON.stringify(d));
  return d;
}

export async function resetPassword(email) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset_password", admin_uid: "public", email }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Error al enviar email");
  return d;
}

export async function signOut() {
  await sbFetch("/auth/v1/logout", { method: "POST" }).catch(() => {});
  clearAuthContext();
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !["dark", "sb_session"].includes(k)) keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem("sb_session");
}

export async function refreshSession() {
  assertAuthTargetSafe("auth:refresh");
  const session = JSON.parse(localStorage.getItem("sb_session") || "null");
  if (!session?.refresh_token) return null;
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const d = await res.json();
  if (d.access_token) {
    localStorage.setItem("sb_session", JSON.stringify(d));
    return d;
  }
  return null;
}
