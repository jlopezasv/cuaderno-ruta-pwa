/**
 * Entorno serverless (api/*). Espejo de src/config/appEnvironment.js sin import.meta.
 */

import { SUPABASE_REAL_PROJECT_REF } from "./supabaseConstants.js";

function appEnv() {
  return (process.env.APP_ENV || process.env.VITE_APP_ENV || "").trim().toLowerCase();
}

export function isDemoApp() {
  return appEnv() === "demo";
}

export function getDemoSupabaseProjectRef() {
  return (process.env.DEMO_SUPABASE_PROJECT_REF || process.env.VITE_DEMO_SUPABASE_PROJECT_REF || "").trim();
}

export function assertServerEnvironmentSafe(url) {
  const u = String(url || "").trim();
  if (!u) return;

  if (u.includes(SUPABASE_REAL_PROJECT_REF) && isDemoApp()) {
    throw new Error(
      `[Cuaderno API DEMO] SUPABASE_URL apunta al proyecto REAL (${SUPABASE_REAL_PROJECT_REF}).`,
    );
  }

  const demoRef = getDemoSupabaseProjectRef();
  if (isDemoApp() && demoRef && !u.includes(demoRef)) {
    throw new Error(
      `[Cuaderno API DEMO] SUPABASE_URL no coincide con DEMO_SUPABASE_PROJECT_REF (${demoRef}).`,
    );
  }
}

export function isPublicRegistrationAllowed() {
  if (isDemoApp()) return false;
  return process.env.ALLOW_PUBLIC_SIGNUP === "1";
}
