import { isDemoApp } from "../../config/appEnvironment.js";
import {
  getAuthUid,
  getSessionAuthDiagnostics,
  getUserId,
  SB_KEY,
  SB_URL,
  sbFetch,
} from "../../data/supabaseClient.js";
import { resolveAuthenticatedAccessToken } from "../../data/sbSession.js";

export function logDemoEquipoJoin(phase, payload) {
  if (!isDemoApp()) return;
  console.warn("[DEMO equipo-join]", phase, payload);
}

function classifyEmpresaLookup(res, rows) {
  if (!res.ok) {
    return { resultado: "error_http", probableCausa: `HTTP ${res.status}` };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      resultado: "cero_filas",
      probableCausa: res.status === 200 ? "sin_match_o_rls_vacio" : "respuesta_vacia",
    };
  }
  return { resultado: "ok", rowCount: rows.length };
}

/** UI mostró «Ese código no existe» — correlacionar con lookup previo. */
export function diagLogJoinCodigoNoExiste({ codigoRaw, codigoNormalizado, source, emps }) {
  logDemoEquipoJoin("codigo_no_existe_ui", {
    source,
    codigo: { raw: codigoRaw, normalizado: codigoNormalizado },
    empsLength: emps?.length ?? 0,
    emps,
    nota: "fetchEmpresasByVinculoCode devolvió [] — revisar logs lookup anteriores",
  });
}

/**
 * Literal para `columna=eq.X` en PostgREST (text).
 * Códigos como DEMO-7562 requieren comillas; sin ellas → HTTP 400.
 */
export function postgrestEqText(value) {
  const s = String(value ?? "").trim();
  if (!s) return '""';
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Marcador de build — visible en consola para confirmar bundle desplegado. */
export const DEMO_EQUIPO_JOIN_AUTH_LOG_REV = "rpc-v1";

/** Misma resolución de Bearer que sbFetch (JWT usuario vs anon key). Solo DEMO. */
async function snapshotDemoEquipoJoinAuth() {
  const diagnostics = getSessionAuthDiagnostics();
  const resolvedBearer = await resolveAuthenticatedAccessToken(SB_URL, SB_KEY);
  const authorizationBearerUserJwt = !!(
    resolvedBearer && resolvedBearer !== SB_KEY
  );
  return {
    supabaseUrl: SB_URL,
    sessionExists: diagnostics.hasSessionRecord,
    userId: getUserId(),
    authUid: getAuthUid(),
    accessTokenExists: diagnostics.hasAccessToken,
    accessTokenUsable: diagnostics.isUsableAccessToken,
    authorizationHeaderPresent: true,
    authorizationBearerUserJwt,
    authorizationBearerAnonKey: !authorizationBearerUserJwt,
    jwtRole: diagnostics.jwtRole,
    jwtSub: diagnostics.jwtSub,
    sessionUserId: diagnostics.sessionUserId,
    jwtExpired: diagnostics.jwtExpired,
    wouldSendAnonKey: diagnostics.wouldSendAnonKey,
    diagnosticoAuth:
      !diagnostics.hasSessionRecord || !authorizationBearerUserJwt
        ? "sin_sesion_authenticated — auth.uid() será NULL en RLS"
        : "sesion_authenticated_ok",
  };
}

/**
 * Log plano ANTES del lookup — punto de entrada fetchEmpresasByVinculoCode (solo DEMO).
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function logDemoEquipoJoinAuthContext(cod) {
  if (!isDemoApp()) return null;
  const snap = await snapshotDemoEquipoJoinAuth();
  const payload = {
    logRev: DEMO_EQUIPO_JOIN_AUTH_LOG_REV,
    codigo: cod,
    supabaseUrl: snap.supabaseUrl,
    sessionExists: snap.sessionExists,
    userId: snap.userId,
    authUid: snap.authUid,
    accessTokenExists: snap.accessTokenExists,
    authorizationBearerUserJwt: snap.authorizationBearerUserJwt,
  };
  console.warn("[DEMO equipo-join] auth_context", payload);
  return snap;
}

export function extractSupabaseErrorBody(body, httpStatus) {
  if (!body || typeof body !== "object") {
    return { message: `HTTP ${httpStatus}`, code: null, details: null, hint: null };
  }
  return {
    message: body.message || null,
    code: body.code || null,
    details: body.details || null,
    hint: body.hint || null,
  };
}

/**
 * Lookup empresa por código en DEMO vía RPC SECURITY DEFINER (sin RLS directa en empresas).
 */
export async function diagFetchEmpresasByVinculoCode(cod, authSnapshot = null) {
  const auth =
    authSnapshot && typeof authSnapshot === "object"
      ? authSnapshot
      : await snapshotDemoEquipoJoinAuth();

  const rpcPath = "/rest/v1/rpc/lookup_empresa_por_codigo";
  const res = await sbFetch(rpcPath, {
    method: "POST",
    body: JSON.stringify({ p_codigo: cod }),
  });
  let responseJson = null;
  let responseText = null;
  try {
    responseText = await res.clone().text();
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = responseText;
  }
  const rows = res.ok && Array.isArray(responseJson) ? responseJson : [];
  const diagnostico = classifyEmpresaLookup(res, rows);
  const empresa = rows[0]
    ? {
        empresa_id: rows[0].id,
        nombre: rows[0].nombre,
        codigo_equipo: rows[0].codigo_equipo,
        codigo_corto: rows[0].codigo_corto,
      }
    : null;

  logDemoEquipoJoin("lookup_rpc", {
    auth,
    codigo: { normalizado: cod, p_codigo: cod },
    query: {
      path: rpcPath,
      fullUrl: `${SB_URL}${rpcPath}`,
      metodo: "POST",
      funcion: "lookup_empresa_por_codigo",
    },
    response: {
      status: res.status,
      httpStatus: res.status,
      ok: res.ok,
      statusText: res.statusText,
    },
    responseJson,
    error: res.ok ? null : extractSupabaseErrorBody(responseJson, res.status),
    diagnostico,
    rowCount: rows.length,
    empresa,
  });

  if (rows.length) {
    logDemoEquipoJoin("lookup_ok", { codigo: cod, via: "rpc", empresa });
    return rows;
  }

  const sinAuth = !auth.sessionExists || !auth.authorizationBearerUserJwt;
  logDemoEquipoJoin("lookup_agotado", {
    codigo: cod,
    auth,
    via: "rpc",
    veredicto: sinAuth
      ? "sin_sesion_authenticated — RPC requiere JWT"
      : res.ok
        ? "rpc_sin_match — código no encontrado en empresas"
        : "error_http_rpc",
    nota: sinAuth
      ? "sessionExists=false o Authorization Bearer sin JWT usuario"
      : "lookup_empresa_por_codigo devolvió []",
  });
  return [];
}

/** Trazas POST conductor_empresa + verificación SELECT posterior. */
export async function diagAfterConductorEmpresaJoin(res, { codigoRaw, codigoNormalizado, uid, emp, payload, source }) {
  let body = null;
  let insertRepresentation = null;
  try {
    const cloned = res.clone();
    const text = await cloned.text();
    if (text) {
      try {
        body = JSON.parse(text);
        insertRepresentation = Array.isArray(body) ? body : [body];
      } catch {
        body = text;
      }
    }
  } catch {
    body = null;
  }

  const supabaseError = res.ok ? null : extractSupabaseErrorBody(typeof body === "object" ? body : null, res.status);

  logDemoEquipoJoin("conductor_empresa_insert", {
    source,
    codigoIntroducido: codigoRaw,
    codigoNormalizado,
    empresa_id: emp?.id ?? null,
    empresaNombre: emp?.nombre ?? null,
    userId: uid,
    httpStatus: res.status,
    ok: res.ok,
    payload,
    insertRepresentation,
    supabaseError,
    supabaseBody: res.ok ? insertRepresentation : body,
  });

  if (!emp?.id || !uid) return;

  const verifyFilter = `user_id=eq.${uid}&empresa_id=eq.${emp.id}&select=id,user_id,empresa_id,rol,activo,nombre,matricula,created_at`;
  const verifyUrl = `/rest/v1/conductor_empresa?${verifyFilter}`;
  const verifyRes = await sbFetch(verifyUrl);
  let verifyBody = null;
  try {
    verifyBody = await verifyRes.json();
  } catch {
    verifyBody = null;
  }
  const verifyRows = verifyRes.ok && Array.isArray(verifyBody) ? verifyBody : [];

  logDemoEquipoJoin("conductor_empresa_verify_after", {
    source,
    empresa_id: emp.id,
    userId: uid,
    verifyFilter,
    httpStatus: verifyRes.status,
    rowCount: verifyRows.length,
    filas: verifyRows,
    filaExiste: verifyRows.length > 0,
    supabaseError: verifyRes.ok ? null : extractSupabaseErrorBody(verifyBody, verifyRes.status),
  });
}

export function diagLogConductoresListResult(empresaId, { rawRels, afterProfileFilter, fetchMeta, source }) {
  logDemoEquipoJoin("conductores_list", {
    source,
    empresa_id: empresaId,
    consulta: `conductor_empresa?empresa_id=eq.${empresaId}&activo=eq.true`,
    rawConductorEmpresaCount: rawRels?.length ?? 0,
    rawUserIds: (rawRels || []).map((r) => r.user_id).filter(Boolean),
    visibleEnListaCount: afterProfileFilter?.length ?? 0,
    ocultosPorArchivo: Math.max(0, (rawRels?.length ?? 0) - (afterProfileFilter?.length ?? 0)),
    fetchMeta: fetchMeta || null,
  });
}
