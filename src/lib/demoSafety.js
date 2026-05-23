/**
 * Guard global cliente: en demo, bloqueo de cualquier host/ref del proyecto REAL.
 */

import { isDemoApp } from "../config/appEnvironment.js";
import { SUPABASE_REAL_PROJECT_REF } from "../data/supabaseConstants.js";

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
export function guardDemoCannotUseProduction(supabaseUrl, context = "client") {
  const url = String(supabaseUrl || "").trim();
  if (!url || !isDemoApp()) return;

  if (url.includes(SUPABASE_REAL_PROJECT_REF)) {
    console.error("[DEMO SAFETY]", {
      context,
      message: "DEMO CANNOT USE PRODUCTION",
      projectRef: SUPABASE_REAL_PROJECT_REF,
      host: hostFromUrl(url),
      viteAppEnv: import.meta.env.VITE_APP_ENV || "(unset)",
    });
    throw new Error("DEMO CANNOT USE PRODUCTION");
  }
}

/**
 * @param {string} value
 * @param {string} [context]
 */
export function guardDemoCannotUseProductionInString(value, context = "client") {
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
