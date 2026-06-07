import { isDemoApp } from "../../config/appEnvironment.js";
import { SB_URL, sbFetch } from "../../data/supabaseClient.js";

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
 * SELECT empresas por código (misma lógica que fetchEmpresasByVinculoCode) con trazas DEMO.
 */
export async function diagFetchEmpresasByVinculoCode(cod) {
  const eqText = postgrestEqText(cod);
  const attempts = [
    { columna: "codigo_equipo", filter: `codigo_equipo=eq.${eqText}` },
    { columna: "codigo_corto", filter: `codigo_corto=eq.${eqText}` },
  ];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(cod) && cod.length === 36) {
    attempts.push({ columna: "id", filter: `id=eq.${cod}` });
  }

  const attemptSummaries = [];

  for (const { columna, filter } of attempts) {
    const queryPath = `/rest/v1/empresas?${filter}&select=id,nombre,codigo_equipo,codigo_corto`;
    const res = await sbFetch(queryPath);
    let responseJson = null;
    let responseText = null;
    try {
      responseText = await res.clone().text();
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = responseText;
    }
    const rows = res.ok && Array.isArray(responseJson) ? responseJson : [];
    const eqFragment = filter.split("&")[0] || filter;
    const diagnostico = classifyEmpresaLookup(res, rows);

    const payload = {
      codigo: {
        normalizado: cod,
        valorEnviadoEnEq: eqText,
        eqLiteral: eqFragment,
        urlUsaComillas: eqFragment.includes('eq."') || eqFragment.includes('eq.%22'),
        urlSinComillas: eqFragment.includes("eq.") && !eqFragment.includes('eq."'),
      },
      columna,
      query: {
        path: queryPath,
        fullUrl: `${SB_URL}${queryPath}`,
        filter,
        metodo: "GET",
      },
      response: {
        httpStatus: res.status,
        ok: res.ok,
        statusText: res.statusText,
      },
      responseJson,
      error: res.ok ? null : extractSupabaseErrorBody(responseJson, res.status),
      diagnostico,
      rowCount: rows.length,
      empresa: rows[0]
        ? {
            empresa_id: rows[0].id,
            nombre: rows[0].nombre,
            codigo_equipo: rows[0].codigo_equipo,
            codigo_corto: rows[0].codigo_corto,
          }
        : null,
    };

    logDemoEquipoJoin("lookup", payload);
    attemptSummaries.push({ columna, ...diagnostico, httpStatus: res.status });

    if (rows.length) {
      logDemoEquipoJoin("lookup_ok", { codigo: cod, columna, empresa: payload.empresa });
      return rows;
    }
  }

  const soloRls =
    attemptSummaries.length > 0 &&
    attemptSummaries.every(
      (a) => a.resultado === "cero_filas" && a.httpStatus === 200,
    );
  logDemoEquipoJoin("lookup_agotado", {
    codigo: cod,
    intentos: attemptSummaries,
    veredicto: soloRls
      ? "RLS_probable (HTTP 200 + 0 filas en todos los intentos)"
      : "revisar intentos (error_http o sin sesión)",
    nota: "Ningún intento devolvió filas — ver logs lookup anteriores",
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
