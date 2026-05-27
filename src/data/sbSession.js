/**
 * Sesión GoTrue en localStorage `sb_session` — normalización, JWT y refresh.
 * Sin importar supabaseClient.js (evita dependencia circular).
 */

function readSbSessionRaw() {
  try {
    return JSON.parse(localStorage.getItem("sb_session") || "null");
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

/** JWT de usuario (rol authenticated + sub). No comprueba expiración. */
export function isAuthenticatedJwt(token) {
  const payload = decodeJwtPayload(token);
  return payload?.role === "authenticated" && !!payload?.sub;
}

/** JWT usable en PostgREST (authenticated, sub, no expirado). */
export function isUsableAccessToken(token, skewSec = 30) {
  if (!isAuthenticatedJwt(token)) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 < payload.exp - skewSec;
}

export function jwtSubFromToken(token) {
  const payload = decodeJwtPayload(token);
  return payload?.role === "authenticated" && payload?.sub ? payload.sub : null;
}

/**
 * Forma canónica GoTrue en localStorage.
 * Nunca inferir sesión autenticada solo por `user` sin access_token JWT válido.
 */
export function normalizeGoTrueSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const access_token =
    typeof raw.access_token === "string" && raw.access_token.trim()
      ? raw.access_token.trim()
      : null;
  const refresh_token =
    typeof raw.refresh_token === "string" && raw.refresh_token.trim()
      ? raw.refresh_token.trim()
      : null;
  const payload = access_token ? decodeJwtPayload(access_token) : null;
  const sub = jwtSubFromToken(access_token);
  let user = raw.user && typeof raw.user === "object" ? raw.user : null;
  if (sub) {
    user = user?.id === sub ? user : { ...(user || {}), id: sub };
  }
  const expires_at =
    raw.expires_at ??
    (payload?.exp ? payload.exp * 1000 : null) ??
    (raw.expires_in ? Date.now() + Number(raw.expires_in) * 1000 : null);

  return {
    access_token,
    refresh_token,
    token_type: raw.token_type || "bearer",
    expires_in: raw.expires_in ?? null,
    expires_at,
    user,
  };
}

export function persistSbSession(tokenResponse) {
  const prev = normalizeGoTrueSession(readSbSessionRaw());
  const merged = normalizeGoTrueSession({
    ...prev,
    ...tokenResponse,
    user: tokenResponse?.user ?? prev?.user,
  });
  if (!merged) {
    localStorage.removeItem("sb_session");
    return null;
  }
  localStorage.setItem("sb_session", JSON.stringify(merged));
  return merged;
}

export async function refreshSbSession(sbUrl, sbKey, refreshToken) {
  if (!refreshToken || !sbUrl || !sbKey) return null;
  const ref = await fetch(`${sbUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: sbKey },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  let rd = null;
  try {
    rd = await ref.json();
  } catch {
    return null;
  }
  if (!ref.ok || !rd?.access_token) return null;
  return persistSbSession(rd);
}

/**
 * Bearer JWT authenticated para PostgREST. Refresca si hace falta.
 * @returns {Promise<string|null>}
 */
export async function resolveAuthenticatedAccessToken(
  sbUrl,
  sbKey,
  session = null,
) {
  const s = normalizeGoTrueSession(session || readSbSessionRaw());
  if (!s) return null;

  if (s.access_token && isUsableAccessToken(s.access_token)) {
    return s.access_token;
  }

  if (s.refresh_token) {
    const refreshed = await refreshSbSession(sbUrl, sbKey, s.refresh_token);
    if (refreshed?.access_token && isUsableAccessToken(refreshed.access_token)) {
      return refreshed.access_token;
    }
  }

  return null;
}

/** @returns {boolean} Hay indicios de sesión (aunque el JWT esté roto). */
export function hasSbSessionRecord() {
  const s = readSbSessionRaw();
  return !!(s?.access_token || s?.refresh_token || s?.user?.id);
}

export function getSessionAuthDiagnostics() {
  const raw = readSbSessionRaw();
  const normalized = normalizeGoTrueSession(raw);
  const token = normalized?.access_token || null;
  const payload = token ? decodeJwtPayload(token) : null;
  return {
    hasSessionRecord: hasSbSessionRecord(),
    hasAccessToken: !!token,
    hasRefreshToken: !!normalized?.refresh_token,
    jwtRole: payload?.role ?? null,
    jwtSub: payload?.sub ?? null,
    jwtExp: payload?.exp ?? null,
    jwtExpIso: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
    jwtExpired: payload?.exp ? Date.now() / 1000 >= payload.exp : null,
    isAuthenticatedJwt: isAuthenticatedJwt(token),
    isUsableAccessToken: isUsableAccessToken(token),
    sessionUserId: normalized?.user?.id ?? null,
    subMatchesSessionUser:
      payload?.sub && normalized?.user?.id
        ? payload.sub === normalized.user.id
        : null,
    wouldSendAnonKey: !token || !isUsableAccessToken(token),
  };
}
