import { SB_URL, SB_KEY } from "../config/env.js";

export { SB_URL, SB_KEY };

/** TEMP: auditar JWT en REST (PostgREST auth.uid). Quitar cuando RLS esté validado. */
const SBFETCH_AUTH_DEBUG = true;

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

function tokenPreview(token) {
  if (!token || typeof token !== "string") return null;
  return token.length <= 20 ? token : `${token.slice(0, 20)}…`;
}

function logSbFetchAuthDebug(tag, { method, path, session, bearerToken, usingAnonFallback, extra }) {
  if (!SBFETCH_AUTH_DEBUG) return;
  const authHeaderValue = bearerToken ? `Bearer ${bearerToken}` : null;
  console.log("SBFETCH_AUTH_DEBUG", {
    tag,
    method,
    endpoint: path,
    authorizationHeaderPresent: !!authHeaderValue,
    authorizationUsesSessionJwt: !usingAnonFallback,
    authorizationUsesAnonKeyFallback: usingAnonFallback,
    tokenPreview: tokenPreview(bearerToken),
    sessionUserId: session?.user?.id ?? null,
    sessionExpiresAt: session?.expires_at ?? null,
    hasRefreshToken: !!session?.refresh_token,
    apikeyHeaderPresent: true,
    ...extra,
  });
}

/**
 * REST a PostgREST. Sesión en localStorage `sb_session` (no usa @supabase/supabase-js en cliente).
 * Sin access_token → Authorization = anon key → auth.uid() NULL en RLS.
 */
export async function sbFetch(path, opts = {}) {
  const session = readSbSession();
  const usingAnonFallback = !session?.access_token;
  const bearerToken = session?.access_token || SB_KEY;
  const method = String(opts.method || "GET").toUpperCase();

  logSbFetchAuthDebug("request", {
    method,
    path,
    session,
    bearerToken,
    usingAnonFallback,
    extra: {
      note: usingAnonFallback
        ? "SIN JWT de usuario: PostgREST verá rol anon (auth.uid() null)"
        : "JWT de sesión en Authorization",
    },
  });

  const headers = {
    "Content-Type": "application/json",
    apikey: SB_KEY,
    Authorization: `Bearer ${bearerToken}`,
    ...opts.headers,
  };
  const res = await fetch(`${SB_URL}${path}`, { ...opts, headers });

  if (SBFETCH_AUTH_DEBUG && !res.ok) {
    console.log("SBFETCH_AUTH_DEBUG", {
      tag: "response_error",
      method,
      endpoint: path,
      status: res.status,
      usingAnonFallback,
      sessionUserId: session?.user?.id ?? null,
    });
  }

  // Si el token ha caducado, intentar refrescar una vez
  if (res.status === 401 && session?.refresh_token) {
    logSbFetchAuthDebug("401_refresh_attempt", {
      method,
      path,
      session,
      bearerToken,
      usingAnonFallback,
      extra: { refreshTokenPreview: tokenPreview(session.refresh_token) },
    });
    try {
      const ref = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const rd = await ref.json();
      if (rd.access_token) {
        localStorage.setItem("sb_session", JSON.stringify(rd));
        const refreshedSession = readSbSession();
        logSbFetchAuthDebug("401_refresh_ok_retry", {
          method,
          path,
          session: refreshedSession,
          bearerToken: rd.access_token,
          usingAnonFallback: false,
          extra: { newSessionUserId: refreshedSession?.user?.id ?? null },
        });
        const headers2 = { ...headers, Authorization: `Bearer ${rd.access_token}` };
        return fetch(`${SB_URL}${path}`, { ...opts, headers: headers2 });
      }
      logSbFetchAuthDebug("401_refresh_no_access_token", {
        method,
        path,
        session,
        bearerToken,
        usingAnonFallback,
        extra: { refreshStatus: ref.status, refreshError: rd?.error ?? rd?.msg ?? null },
      });
    } catch (refreshErr) {
      logSbFetchAuthDebug("401_refresh_throw", {
        method,
        path,
        session,
        bearerToken,
        usingAnonFallback,
        extra: { error: String(refreshErr?.message || refreshErr) },
      });
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

// Data sync — upsert batch
export async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const res = await sbFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
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
