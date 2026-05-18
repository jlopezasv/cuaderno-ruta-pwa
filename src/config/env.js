/**
 * Configuración de entorno del cliente (Vite).
 * Obligatorio en startup: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
 * Sin fallbacks a producción — cada deploy (prod / preview / local) define su proyecto.
 */

const ENV_DOC =
  "docs/HARDENING_ENV_FASE1.md — copia .env.local.example → .env.local";

function readRequiredVite(name) {
  const raw = import.meta.env[name];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      `[Cuaderno] Falta ${name}. Define la variable en .env.local (desarrollo) ` +
        `o en Vercel → Environment Variables (Production / Preview). ${ENV_DOC}`,
    );
  }
  return raw.trim();
}

function normalizeSupabaseUrl(url) {
  const base = url.replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)) {
    throw new Error(
      `[Cuaderno] VITE_SUPABASE_URL no tiene formato válido (esperado https://<ref>.supabase.co): ${base}`,
    );
  }
  return base;
}

/** URL base del proyecto Supabase (sin barra final). */
export const SUPABASE_URL = normalizeSupabaseUrl(readRequiredVite("VITE_SUPABASE_URL"));

/** Clave anon (pública) del mismo proyecto. */
export const SUPABASE_ANON_KEY = readRequiredVite("VITE_SUPABASE_ANON_KEY");

/** Alias históricos usados por supabaseClient y módulos legacy. */
export const SB_URL = SUPABASE_URL;
export const SB_KEY = SUPABASE_ANON_KEY;

/**
 * Etiqueta de despliegue para diagnóstico (no sustituye variables Supabase).
 * - development → vite dev / preview local
 * - production → build prod (Vercel Production o preview con MODE=production)
 */
export function getClientDeployKind() {
  if (import.meta.env.DEV) return "local";
  if (import.meta.env.PROD) return "production";
  return import.meta.env.MODE || "unknown";
}

/** Referencia corta del proyecto (subdominio Supabase). */
export function getSupabaseProjectRef() {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

/** Validación explícita al arranque (también se ejecuta al importar este módulo). */
export function assertClientEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(`[Cuaderno] Configuración Supabase incompleta. ${ENV_DOC}`);
  }
}

assertClientEnv();
