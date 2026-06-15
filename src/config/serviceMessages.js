import { getDemoSupabaseProjectRef, isDemoApp } from "./appEnvironment.js";

/** Chat interno por servicio: activo solo en demo hasta UAT en producción. */
export function isServiceMessagesEnabled(_servicio = null) {
  if (isDemoApp()) return true;
  const demoRef = getDemoSupabaseProjectRef();
  const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
  return !!(demoRef && url.includes(demoRef));
}
