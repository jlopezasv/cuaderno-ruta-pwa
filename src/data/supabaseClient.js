/**

 * Cliente Supabase REST (sin @supabase/supabase-js).

 * Sin fallback: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY obligatorias (build + runtime).

 */



import { isDemoApp } from "../config/appEnvironment.js";

import { guardDemoCannotUseProduction } from "../lib/demoSafety.js";

import { SUPABASE_REAL_PROJECT_REF } from "./supabaseConstants.js";

import {
  getSessionAuthDiagnostics,
  hasSbSessionRecord,
  isUsableAccessToken,
  jwtSubFromToken,
  normalizeGoTrueSession,
  persistSbSession,
  refreshSbSession,
  resolveAuthenticatedAccessToken,
} from "./sbSession.js";

export {
  getSessionAuthDiagnostics,
  jwtSubFromToken,
  persistSbSession,
} from "./sbSession.js";



export { SUPABASE_REAL_PROJECT_REF };



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

  guardDemoCannotUseProduction(url, "supabaseClient.module");



  const demoRef = viteEnv("VITE_DEMO_SUPABASE_PROJECT_REF");



  if (isDemoApp() && demoRef && !url.includes(demoRef)) {

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

  return normalizeGoTrueSession(readSbSessionRaw());

}

function readSbSessionRaw() {

  try {

    return JSON.parse(localStorage.getItem("sb_session") || "null");

  } catch (_) {

    return null;

  }

}

function clearSbSession() {

  localStorage.removeItem("sb_session");

}



/**

 * REST a PostgREST. Sesión en localStorage `sb_session`.

 * Sin access_token → Authorization = anon key → auth.uid() NULL en RLS.

 */

export async function sbFetch(path, opts = {}) {

  guardDemoCannotUseProduction(SB_URL, `sbFetch:${path.split("?")[0]}`);

  const hadSession = hasSbSessionRecord();
  let bearerToken = await resolveAuthenticatedAccessToken(SB_URL, SB_KEY);

  if (!bearerToken) {
    if (hadSession) {
      clearSbSession();
      if (onSessionExpired) onSessionExpired();
    }
    bearerToken = SB_KEY;
  }

  const headers = {

    "Content-Type": "application/json",

    apikey: SB_KEY,

    Authorization: `Bearer ${bearerToken}`,

    ...opts.headers,

  };

  const res = await fetch(`${SB_URL}${path}`, { ...opts, headers });

  if (res.status === 401 && bearerToken !== SB_KEY) {
    const session = readSbSession();
    if (session?.refresh_token) {
      try {
        guardDemoCannotUseProduction(SB_URL, "sbFetch:auth/refresh");
        const refreshed = await refreshSbSession(SB_URL, SB_KEY, session.refresh_token);
        const token2 =
          refreshed?.access_token && isUsableAccessToken(refreshed.access_token)
            ? refreshed.access_token
            : null;
        if (token2) {
          const headers2 = { ...headers, Authorization: `Bearer ${token2}` };
          return fetch(`${SB_URL}${path}`, { ...opts, headers: headers2 });
        }
      } catch {
        /* refresh falló */
      }
    }
    clearSbSession();
    if (onSessionExpired) onSessionExpired();
  }

  return res;

}



export function getSession() {

  return readSbSession();

}



export function getUserId() {

  const uid = getAuthUid();

  if (uid) return uid;

  return getSession()?.user?.id || null;

}



/** auth.uid() en Postgres ≈ JWT `sub` (rol authenticated). Sin fallback silencioso. */

export function getAuthUid() {

  const token = getAccessToken();

  return jwtSubFromToken(token);

}



/** JWT de sesión usable en Authorization (null si no hay JWT authenticated). */

export function getAccessToken() {

  const token = getSession()?.access_token || null;

  if (!token || !isUsableAccessToken(token)) return null;

  return token;

}



/** Token en storage aunque esté expirado (p. ej. antes de refresh). */

export function getStoredAccessToken() {

  return getSession()?.access_token || null;

}



export function hasValidAuthSession() {

  const session = readSbSession();

  if (session?.access_token && isUsableAccessToken(session.access_token)) return true;

  return !!session?.refresh_token;

}



/** Refresca si hace falta y devuelve JWT authenticated para API/RLS. */

export async function ensureAuthAccessToken() {

  return resolveAuthenticatedAccessToken(SB_URL, SB_KEY);

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


