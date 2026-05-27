/**

 * Detección de entorno demo vs producción (solo flags de build / Vercel).

 * No sustituye la separación física de proyectos Supabase/Vercel.

 */



import { guardDemoCannotUseProduction } from "../lib/demoSafety.js";

import { SUPABASE_REAL_PROJECT_REF } from "../data/supabaseConstants.js";



const APP_ENV = (import.meta.env.VITE_APP_ENV || "").trim().toLowerCase();



/** Entorno demo explícito (Vercel proyecto demo: VITE_APP_ENV=demo). */

export function isDemoApp() {

  return APP_ENV === "demo";

}



export function isProductionApp() {

  return APP_ENV === "production" || APP_ENV === "prod";

}



/** Ref. opcional del proyecto Supabase DEMO (validación positiva). */

export function getDemoSupabaseProjectRef() {

  return (import.meta.env.VITE_DEMO_SUPABASE_PROJECT_REF || "").trim();

}



export function getSupabaseUrlHost() {

  try {

    const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();

    return url ? new URL(url).host : "";

  } catch {

    return "";

  }

}



export function assertClientEnvironmentSafe() {

  const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();

  if (!url) return;



  guardDemoCannotUseProduction(url, "assertClientEnvironmentSafe");



  const demoRef = getDemoSupabaseProjectRef();

  if (isDemoApp() && demoRef && !url.includes(demoRef)) {

    throw new Error(

      `[Cuaderno DEMO] VITE_SUPABASE_URL no coincide con VITE_DEMO_SUPABASE_PROJECT_REF (${demoRef}).`,

    );

  }

}



/**
 * Registro en pantalla inicial (Crear cuenta + empresa): desbloqueado en demo dev.
 * Revertir en demo → `return false` (no afecta producción: isDemoApp() es false allí).
 */
export function isDemoPublicRegistrationAllowed() {
  return isDemoApp();
}

export function isPublicRegistrationAllowed() {
  if (isDemoApp()) {
    return isDemoPublicRegistrationAllowed();
  }
  if (import.meta.env.VITE_ALLOW_PUBLIC_SIGNUP === "1") return true;
  return true;
}



export const DEMO_LOGIN_HINT = Object.freeze({

  empresa: "demo-empresa@cuaderno.test",

  conductor: "demo-conductor@cuaderno.test",

  autonomoPro: "demo-autonomo@cuaderno.test",

  password: "DemoCuaderno2026!",

});


