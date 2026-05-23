/**
 * Diagnóstico temporal — auth en uploads Storage.
 * Filtrar consola: STORAGE_AUTH_DIAG
 * Quitar cuando se resuelva el 400.
 */

import { SB_KEY, getAccessToken, getSession, getUserId } from "./supabaseClient";

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function classifyBearer(token) {
  if (!token) return "missing";
  if (token === SB_KEY) return "anon_key_literal";
  const payload = decodeJwtPayload(token);
  if (!payload) return "opaque_non_jwt";
  if (payload.role === "anon") return "anon_jwt";
  if (payload.role === "authenticated") return "user_jwt";
  return `jwt_role_${payload.role ?? "unknown"}`;
}

/**
 * Equivalente conceptual a getStorageToken() — no existe en el proyecto.
 * Devuelve metadatos del token que usa uploadBlobToStorage (sin exponer el JWT).
 */
export function getStorageTokenDiag() {
  const session = getSession();
  const accessToken = getAccessToken();
  const uid = getUserId();
  const payload = accessToken ? decodeJwtPayload(accessToken) : null;
  const bearerKind = classifyBearer(accessToken);
  const sbFetchBearer = session?.access_token || SB_KEY;

  return {
    /** No hay getStorageToken(); upload usa getAccessToken(). */
    storageUploadUses: "getAccessToken() → session.access_token",
    getStorageTokenExists: false,
    getAccessToken: {
      present: !!accessToken,
      length: accessToken?.length ?? 0,
      bearerKind,
    },
    session: {
      present: !!session,
      hasUser: !!session?.user,
      uid: uid ?? null,
      hasAccessToken: !!session?.access_token,
      accessTokenMatchesGetAccessToken: session?.access_token === accessToken,
    },
  /** auth.uid() en Postgres ≈ JWT sub con rol authenticated */
    authUidProxy: {
      wouldExist: bearerKind === "user_jwt" && !!payload?.sub,
      jwtSub: payload?.sub ?? null,
      uidMatchesJwtSub: uid && payload?.sub ? uid === payload.sub : null,
    },
    jwt: payload
      ? {
          role: payload.role ?? null,
          sub: payload.sub ?? null,
          exp: payload.exp ?? null,
          expIso: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
          expired: payload.exp ? Date.now() / 1000 > payload.exp : null,
        }
      : null,
    headersOnStoragePost: {
      Authorization: accessToken ? "Bearer <session.access_token>" : "Bearer <none>",
      apikey: "SB_KEY (VITE_SUPABASE_ANON_KEY, siempre)",
    },
    sbFetchComparison: {
      bearer: session?.access_token ? "session.access_token" : "anon_fallback (SB_KEY)",
      note: "sbFetch cae a anon si no hay sesión; Storage upload NO (requireStorageAuth lanza antes)",
      sameTokenAsStorageUpload: accessToken === sbFetchBearer,
    },
    anonKeyLength: SB_KEY?.length ?? 0,
  };
}

export function logStorageAuthDiag(context = "storage") {
  const diag = getStorageTokenDiag();
  console.warn("[STORAGE_AUTH_DIAG]", context, diag);
  return diag;
}
