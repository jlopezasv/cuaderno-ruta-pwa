/**
 * Configuración Supabase para Vercel Serverless (api/*).
 * Sin URLs ni anon keys por defecto — cada entorno define SUPABASE_URL y SUPABASE_ANON_KEY.
 */

let cached = null;

function missingVars() {
  const m = [];
  const url = (process.env.SUPABASE_URL || "").trim();
  const anon = (process.env.SUPABASE_ANON_KEY || "").trim();
  if (!url) m.push("SUPABASE_URL");
  if (!anon) m.push("SUPABASE_ANON_KEY");
  return m;
}

/**
 * @returns {{ url: string, anonKey: string, serviceRoleKey: string }}
 */
export function getSupabaseServerEnv() {
  if (cached) return cached;

  const missing = missingVars();
  if (missing.length) {
    throw new Error(
      `[Cuaderno API] Variables obligatorias no definidas: ${missing.join(", ")}. ` +
        "Configúralas en Vercel (Production = REAL, Preview = DEMO) o en .env.local para `vercel dev`. " +
        "Ver docs/HARDENING_ENV_FASE1.md",
    );
  }

  const url = process.env.SUPABASE_URL.trim().replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY.trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  cached = { url, anonKey, serviceRoleKey };
  return cached;
}

/** Service role — obligatoria solo para operaciones admin/archivado. */
export function getSupabaseServiceRoleKey() {
  const { serviceRoleKey } = getSupabaseServerEnv();
  if (!serviceRoleKey) {
    throw new Error(
      "[Cuaderno API] SUPABASE_SERVICE_ROLE_KEY no definida (requerida para esta operación).",
    );
  }
  return serviceRoleKey;
}

/** Invalida caché (tests). */
export function resetSupabaseServerEnvCache() {
  cached = null;
}
