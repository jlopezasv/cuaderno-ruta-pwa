/**
 * Cliente Supabase REST (sin @supabase/supabase-js).
 * Sin fallback: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY obligatorias (build + runtime).
 */

/** Ref. proyecto REAL — no debe usarse en Preview/demo salvo opt-in explícito. */
export const SUPABASE_REAL_PROJECT_REF = "glyexutcypmhkndvmcxd";

function viteEnv(name) {
  const raw = import.meta.env[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

function requireViteEnv(name) {
  const value = viteEnv(name);
  if (!value) {
    throw new Error(
      `[Cuaderno] Falta ${name}. Configúrala en Vercel (Preview/Production) o en .env.local. No hay credenciales embebidas.`,
    );
  }
  return value;
}

function assertSupabaseUrlAllowed(url) {
  const appEnv = (viteEnv("VITE_APP_ENV") || "").toLowerCase();
  const demoRef = viteEnv("VITE_DEMO_SUPABASE_PROJECT_REF");

  if (appEnv === "demo" && url.includes(SUPABASE_REAL_PROJECT_REF)) {
    throw new Error(
      `[Cuaderno DEMO] VITE_SUPABASE_URL apunta al proyecto REAL (${SUPABASE_REAL_PROJECT_REF}). ` +
        "Usa credenciales del proyecto Supabase DEMO en Vercel demo.",
    );
  }
  if (appEnv === "demo" && demoRef && !url.includes(demoRef)) {
    throw new Error(
      `[Cuaderno DEMO] VITE_SUPABASE_URL no coincide con VITE_DEMO_SUPABASE_PROJECT_REF (${demoRef}).`,
    );
  }
  if (!url.includes(SUPABASE_REAL_PROJECT_REF)) return;
  if (viteEnv("VITE_ALLOW_PROD_SUPABASE") === "1") return;
  throw new Error(
    `[Cuaderno] VITE_SUPABASE_URL apunta al proyecto REAL (${SUPABASE_REAL_PROJECT_REF}). ` +
      "En Preview/demo configura el proyecto DEMO. En Vercel Production usa VITE_ALLOW_PROD_SUPABASE=1.",
  );
}

const sbUrlRaw = requireViteEnv("VITE_SUPABASE_URL").replace(/\/+$/, "");
assertSupabaseUrlAllowed(sbUrlRaw);

export const SB_URL = sbUrlRaw;
export const SB_KEY = requireViteEnv("VITE_SUPABASE_ANON_KEY");

/** Host Supabase activo (solo diagnóstico en consola; no es secreto). */
export function getSupabasePublicHost() {
  try {
    return new URL(SB_URL).host;
  } catch {
    return SB_URL;
  }
}

let onSessionExpired = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

function readSbSession() {
  try {
    return JSON.parse(localStorage.getItem("sb_session") || "null");
  } catch (_) {
    return null;
  }
}

/**
 * REST a PostgREST. Sesión en localStorage `sb_session`.
 * Sin access_token → Authorization = anon key → auth.uid() NULL en RLS.
 */
export async function sbFetch(path, opts = {}) {
  const session = readSbSession();
  const bearerToken = session?.access_token || SB_KEY;

  const headers = {
    "Content-Type": "application/json",
    apikey: SB_KEY,
    Authorization: `Bearer ${bearerToken}`,
    ...opts.headers,
  };
  const res = await fetch(`${SB_URL}${path}`, { ...opts, headers });

  if (res.status === 401 && session?.refresh_token) {
    try {
      const ref = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const rd = await ref.json();
      if (rd.access_token) {
        localStorage.setItem("sb_session", JSON.stringify(rd));
        const headers2 = { ...headers, Authorization: `Bearer ${rd.access_token}` };
        return fetch(`${SB_URL}${path}`, { ...opts, headers: headers2 });
      }
    } catch {
      /* refresh falló */
    }
    localStorage.removeItem("sb_session");
    if (onSessionExpired) onSessionExpired();
  }
  return res;
}

export function getSession() {
  return readSbSession();
}

export function getUserId() {
  const s = getSession();
  return s?.user?.id || null;
}

/** JWT de sesión (para Authorization en APIs propias como /api/push). */
export function getAccessToken() {
  const s = getSession();
  return s?.access_token || null;
}

export async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const res = await sbFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  return res;
}

export async function sbSelect(table, filter = "") {
  const res = await sbFetch(`/rest/v1/${table}?${filter}`);
  if (!res.ok) return [];
  return res.json();
}

export async function sbDelete(table, id) {
  await sbFetch(`/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" });
}
