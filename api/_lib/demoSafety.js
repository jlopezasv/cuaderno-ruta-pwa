/**
 * Guard global: en demo, bloqueo físico de cualquier URL/credencial del proyecto REAL.
 */

import { isDemoApp } from "./appEnvironment.js";
import { SUPABASE_REAL_PROJECT_REF } from "./supabaseConstants.js";

export { SUPABASE_REAL_PROJECT_REF };

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "").slice(0, 120);
  }
}

/**
 * @param {string} supabaseUrl
 * @param {string} [context]
 */
export function guardDemoCannotUseProduction(supabaseUrl, context = "server") {
  const url = String(supabaseUrl || "").trim();
  if (!url || !isDemoApp()) return;

  if (url.includes(SUPABASE_REAL_PROJECT_REF)) {
    console.error("[DEMO SAFETY]", {
      context,
      message: "DEMO CANNOT USE PRODUCTION",
      projectRef: SUPABASE_REAL_PROJECT_REF,
      host: hostFromUrl(url),
      appEnv: process.env.APP_ENV || process.env.VITE_APP_ENV || "(unset)",
    });
    throw new Error("DEMO CANNOT USE PRODUCTION");
  }
}

/**
 * Bloquea URLs de Storage/REST que apunten al ref REAL (p. ej. adjuntos en send-docs-email).
 * @param {string} value
 * @param {string} [context]
 */
export function guardDemoCannotUseProductionInString(value, context = "server") {
  const s = String(value || "").trim();
  if (!s || !isDemoApp()) return;
  if (!s.includes(SUPABASE_REAL_PROJECT_REF)) return;

  console.error("[DEMO SAFETY]", {
    context,
    message: "DEMO CANNOT USE PRODUCTION (string contains REAL ref)",
    projectRef: SUPABASE_REAL_PROJECT_REF,
    sample: s.slice(0, 200),
  });
  throw new Error("DEMO CANNOT USE PRODUCTION");
}
