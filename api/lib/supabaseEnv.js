/**
 * Supabase en Vercel Serverless (api/*).
 * Sin fallback: SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY vía entorno.
 */

/** Ref. proyecto REAL — no debe usarse en Preview/demo salvo opt-in explícito. */
export const SUPABASE_REAL_PROJECT_REF = "glyexutcypmhkndvmcxd";

let cached = null;

function requireProcessEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(
      `[Cuaderno API] Falta ${name}. Configúrala en Vercel (mismo proyecto que VITE_* del entorno). No hay credenciales embebidas.`,
    );
  }
  return value;
}

function assertSupabaseUrlAllowed(url) {
  if (!url.includes(SUPABASE_REAL_PROJECT_REF)) return;
  if (process.env.ALLOW_PROD_SUPABASE === "1") return;
  throw new Error(
    `[Cuaderno API] SUPABASE_URL apunta al proyecto REAL (${SUPABASE_REAL_PROJECT_REF}). ` +
      "En Preview/demo configura el proyecto DEMO. En Vercel Production usa ALLOW_PROD_SUPABASE=1.",
  );
}

/**
 * @returns {{ url: string, anonKey: string, serviceRoleKey: string }}
 */
export function getSupabaseServerEnv() {
  if (cached) return cached;

  const url = requireProcessEnv("SUPABASE_URL").replace(/\/+$/, "");
  assertSupabaseUrlAllowed(url);
  const anonKey = requireProcessEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  cached = { url, anonKey, serviceRoleKey };
  return cached;
}

export function getSupabaseServiceRoleKey() {
  const { serviceRoleKey } = getSupabaseServerEnv();
  if (!serviceRoleKey) {
    throw new Error(
      "[Cuaderno API] SUPABASE_SERVICE_ROLE_KEY no definida (requerida para esta operación).",
    );
  }
  return serviceRoleKey;
}

export function resetSupabaseServerEnvCache() {
  cached = null;
}
