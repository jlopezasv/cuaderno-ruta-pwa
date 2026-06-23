import { SB_URL, SB_KEY, sbFetch, persistSbSession } from "./supabaseClient";

import { refreshSbSession } from "./sbSession.js";

import { clearAuthContext } from "./authContext";

import { isPublicRegistrationAllowed } from "../config/appEnvironment.js";

import { guardDemoCannotUseProduction } from "../lib/demoSafety.js";

import { demoDevError, demoDevLog, demoDevWarn, isDemoDevUnlocked } from "../lib/demoDevUnlock.js";



export { getSession, getUserId } from "./supabaseClient";



function assertAuthTargetSafe(context) {

  guardDemoCannotUseProduction(SB_URL, context);

}



function authErrorMessage(d, fallback) {

  const raw =

    d?.error_description ||

    d?.error?.message ||

    d?.msg ||

    (typeof d?.error === "string" ? d.error : null) ||

    fallback;

  if (typeof raw === "string" && /email not confirmed/i.test(raw)) {

    return "Debes confirmar el email. En demo: Supabase → Auth → desactiva «Confirm email».";

  }

  return raw;

}



export async function signUp(email, password, options = {}) {

  assertAuthTargetSafe("auth:signup");

  if (!isPublicRegistrationAllowed()) {

    throw new Error(

      "El registro libre está desactivado en este entorno. Usa las cuentas demo o contacta con soporte.",

    );

  }



  const signupUrl = `${SB_URL}/auth/v1/signup`;

  if (isDemoDevUnlocked()) {

    demoDevLog("signUp →", signupUrl, "email:", email);

    demoDevLog("VITE_SUPABASE_URL:", (import.meta.env.VITE_SUPABASE_URL || "").trim() || "(vacío)");

  }

  const signupBody = { email, password };
  const meta = {};
  if (options.nombre) meta.nombre = options.nombre;
  if (options.telefono) meta.telefono = options.telefono;
  if (Object.keys(meta).length) signupBody.data = meta;



  const res = await fetch(signupUrl, {

    method: "POST",

    headers: { "Content-Type": "application/json", apikey: SB_KEY },

    body: JSON.stringify(signupBody),

  });



  let d;

  try {

    d = await res.json();

  } catch (parseErr) {

    demoDevError("signUp JSON parse:", parseErr);

    throw parseErr;

  }



  if (isDemoDevUnlocked()) {

    demoDevLog("signUp HTTP", res.status, "ok:", res.ok, "body:", d);

  }



  if (!res.ok) {

    const msg = authErrorMessage(d, `Error al registrarse (HTTP ${res.status})`);

    demoDevError("signUp falló:", { status: res.status, body: d });

    throw new Error(msg);

  }

  if (d.error) {

    throw new Error(authErrorMessage(d, "Error al registrarse"));

  }



  if (d.access_token) {

    persistSbSession(d);

  } else if (isDemoDevUnlocked()) {

    demoDevWarn(

      "signUp sin access_token; se intentará signIn. user:",

      d.user?.id ?? d.id ?? "(ninguno)",

    );

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

  if (isDemoDevUnlocked()) {

    demoDevLog("signIn HTTP", res.status, "ok:", res.ok, "user:", d.user?.id);

  }

  if (!res.ok || d.error) {

    const msg = authErrorMessage(d, "Email o contraseña incorrectos");

    demoDevError("signIn falló:", { status: res.status, body: d });

    throw new Error(msg);

  }

  clearAuthContext();

  const dark = localStorage.getItem("dark");

  const keysToRemove = [];

  for (let i = 0; i < localStorage.length; i++) {

    const k = localStorage.key(i);

    if (k && k !== "dark") keysToRemove.push(k);

  }

  keysToRemove.forEach((k) => localStorage.removeItem(k));

  if (dark) localStorage.setItem("dark", dark);

  persistSbSession(d);

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



/** Verifica contraseña actual y actualiza a la nueva (sesión activa). */
export async function changePasswordWithVerification({ email, currentPassword, newPassword, accessToken }) {
  assertAuthTargetSafe("auth:changePassword");
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm) throw new Error("No se pudo obtener el email de la sesión");
  if (!currentPassword) throw new Error("Indica la contraseña actual");
  if (!newPassword || newPassword.length < 6) throw new Error("La nueva contraseña debe tener al menos 6 caracteres");

  const verifyRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY },
    body: JSON.stringify({ email: emailNorm, password: currentPassword }),
  });
  const verifyData = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    throw new Error(authErrorMessage(verifyData, "La contraseña actual no es correcta"));
  }

  const bearer = accessToken || verifyData.access_token;
  if (!bearer) throw new Error("Sesión no válida");

  const updateRes = await fetch(`${SB_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ password: newPassword }),
  });
  const updateData = await updateRes.json().catch(() => ({}));
  if (!updateRes.ok) {
    throw new Error(authErrorMessage(updateData, "No se pudo cambiar la contraseña"));
  }

  if (verifyData.access_token) {
    persistSbSession(verifyData);
  }

  return updateData;
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

  const refreshed = await refreshSbSession(SB_URL, SB_KEY, session.refresh_token);

  return refreshed;

}


