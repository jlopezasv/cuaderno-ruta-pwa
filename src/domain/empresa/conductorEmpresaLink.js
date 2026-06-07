import {
  ensureAuthAccessToken,
  getAuthUid,
  getSessionAuthDiagnostics,
  SB_URL,
  sbFetch,
  sbSelect,
} from "../../data/supabaseClient.js";
import { devWarn } from "../../lib/devOnlyLog.js";

/** Marcador de build — consola: `[fleet-join] rev fleet-join-v7-all-rpc` */
export const FLEET_JOIN_REV = "fleet-join-v7-all-rpc";

/** Diagnóstico temporal prod — consola: `[fleet-join-diag]` */
export const FLEET_JOIN_DIAG_REV = "join-diag-v1";

function logFleetJoinDiag(phase, payload) {
  console.warn("[fleet-join-diag]", FLEET_JOIN_DIAG_REV, phase, payload);
}

function classifyConductorEmpresaLinkRow(row) {
  if (!row) return "no_existe";
  if (row.activo === false) return "existe_activo_false";
  return "existe_activo_true";
}

async function parseSupabaseHttpError(res) {
  const text = await res.clone().text().catch(() => "");
  let parsed = {};
  try {
    parsed = JSON.parse(text || "{}");
  } catch {
    parsed = {};
  }
  return {
    status: res?.status ?? null,
    code: parsed.code ?? null,
    message: parsed.message ?? (text || null),
    details: parsed.details ?? null,
    hint: parsed.hint ?? null,
    raw: typeof text === "string" ? text.slice(0, 800) : null,
  };
}

const CE_SELECT_FULL =
  "id,empresa_id,user_id,nombre,matricula,activo,rol";
const CE_SELECT_MIN = "id,empresa_id,user_id,activo";

let fleetJoinRevLogged = false;

function isRowActiva(row) {
  return row?.activo !== false;
}

function buildConductorEmpresaUrl(uid, selectCols, extra = "") {
  const base = `user_id=eq.${uid}&select=${selectCols}`;
  return `/rest/v1/conductor_empresa?${extra ? `${base}&${extra}` : base}`;
}

async function queryConductorEmpresaRows(uid, extraFilter = "", selectCols = CE_SELECT_FULL) {
  const res = await sbFetch(buildConductorEmpresaUrl(uid, selectCols, extraFilter));
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    devWarn("[conductor_empresa] select failed", res.status, body);
    console.warn("[fleet-join] conductor_empresa HTTP", res.status, body?.slice?.(0, 160) || body);
    return { rows: [], httpStatus: res.status, body };
  }
  const rows = await res.json();
  return {
    rows: Array.isArray(rows) ? rows : [],
    httpStatus: res.status,
    body: null,
  };
}

/** Espera JWT authenticated (refresh incluido) antes de consultar RLS. */
async function resolveFleetAuthUid(uidHint = null, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    await ensureAuthAccessToken();
    const authUid = getAuthUid();
    if (authUid) return { uid: authUid, jwtReady: true };
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }
  const authUid = getAuthUid();
  const uid = authUid || uidHint || null;
  return { uid, jwtReady: !!authUid };
}

async function selectActiveConductorEmpresaRows(uid) {
  const attempts = [
    { select: CE_SELECT_FULL, extra: "or=(activo.eq.true,activo.is.null)" },
    { select: CE_SELECT_FULL, extra: "" },
    { select: CE_SELECT_MIN, extra: "" },
  ];

  for (const { select, extra } of attempts) {
    const { rows, httpStatus } = await queryConductorEmpresaRows(uid, extra, select);
    const active = rows.filter(isRowActiva);
    if (active.length) return active;
    if (httpStatus === 400) continue;
  }
  return [];
}

/**
 * Filas activas conductor ↔ empresa (JWT authenticated + auth.uid() = user_id).
 * @param {string} [uidHint] — solo si coincide con JWT sub; si no, se ignora.
 */
export async function fetchActiveConductorEmpresaRows(uidHint = null) {
  if (!fleetJoinRevLogged) {
    fleetJoinRevLogged = true;
    console.warn("[fleet-join] rev", FLEET_JOIN_REV);
  }

  const { uid, jwtReady } = await resolveFleetAuthUid(uidHint);
  if (!uid) {
    console.warn("[fleet-join] sin uid — no se puede leer conductor_empresa", getSessionAuthDiagnostics());
    return [];
  }
  if (!jwtReady) {
    console.warn("[fleet-join] sin JWT authenticated — RLS devolverá 0 filas", {
      uidHint: uidHint?.slice?.(0, 8) + "…",
      ...getSessionAuthDiagnostics(),
    });
    return [];
  }

  const authUid = getAuthUid();
  if (authUid && uidHint && authUid !== uidHint) {
    devWarn("[conductor_empresa] uid hint != jwt sub", { uidHint, authUid });
  }

  const rows = await selectActiveConductorEmpresaRows(uid);

  if (!rows.length) {
    console.warn("[fleet-join] 0 filas activas", {
      uid: uid.slice(0, 8) + "…",
      jwtSub: authUid?.slice?.(0, 8) + "…",
      supabaseHost: SB_URL?.replace(/^https?:\/\//, "").split("/")[0],
      jwt: true,
      auth: getSessionAuthDiagnostics(),
    });
  }

  return rows;
}

/**
 * Estado de vinculación al iniciar sesión / refrescar perfil.
 */
export async function resolveConductorEmpresaJoinState(uidHint = null) {
  const { uid, jwtReady } = await resolveFleetAuthUid(uidHint);
  if (!uid || !jwtReady) return { kind: "none" };

  const owners = await sbSelect("empresas", `owner_id=eq.${uid}&select=id,nombre`);
  if (owners?.length) {
    return {
      kind: "jefe",
      empresaId: owners[0].id,
      empresaNombre: owners[0].nombre || "Empresa",
    };
  }

  const rels = await fetchActiveConductorEmpresaRows(uid);
  if (!rels.length) return { kind: "none" };

  const rel = rels[0];
  let empresaNombre = "Empresa";
  if (rel.empresa_id) {
    const emps = await sbSelect("empresas", `id=eq.${rel.empresa_id}&select=nombre`);
    if (emps?.[0]?.nombre) empresaNombre = emps[0].nombre;
  }

  return {
    kind: "conductor",
    empresaId: rel.empresa_id,
    empresaNombre,
    rel,
  };
}

/** Mapeo a estado UI de CampoEmpresa (null = cargando, false = sin vínculo). */
export function joinStateToCampoEmpresaEstado(state) {
  if (!state) return null;
  if (state.kind === "jefe") return { esJefe: true };
  if (state.kind === "conductor") {
    return { id: state.empresaId, nombre: state.empresaNombre || "Empresa" };
  }
  return false;
}

/** Mapeo a estado UI de SetupConductorPerfil / SetupConductor. */
export function joinStateToRelEstado(state) {
  if (!state) return null;
  if (state.kind === "jefe") return { esJefe: true, nombre: state.empresaNombre };
  if (state.kind === "conductor") return { esJefe: false, nombre: state.empresaNombre || "Empresa" };
  return false;
}

/**
 * Lookup empresa por código vía RPC en todos los entornos (prod y demo).
 */
export async function lookupEmpresasByVinculoCode(rawCodigo) {
  const cod = String(rawCodigo || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!cod) return [];

  await ensureAuthAccessToken();
  logFleetJoinDiag("codigo_lookup_inicio", {
    codigo: cod,
    via: "rpc/lookup_empresa_por_codigo",
    auth_uid: getAuthUid(),
    jwt_ready: !!getAuthUid(),
  });

  const rpcRes = await sbFetch("/rest/v1/rpc/lookup_empresa_por_codigo", {
    method: "POST",
    body: JSON.stringify({ p_codigo: cod }),
  });

  if (!rpcRes.ok) {
    logFleetJoinDiag("codigo_lookup_rpc_error", {
      codigo: cod,
      supabase: await parseSupabaseHttpError(rpcRes),
      nota: rpcRes.status === 404 ? "RPC lookup_empresa_por_codigo no existe en Supabase" : null,
    });
    return [];
  }

  const rows = await rpcRes.json();
  const list = Array.isArray(rows) ? rows : [];
  logFleetJoinDiag("codigo_lookup_rpc", {
    codigo: cod,
    row_count: list.length,
    rows: list.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      codigo_equipo: r.codigo_equipo,
      codigo_corto: r.codigo_corto,
    })),
  });
  return list;
}

export function clearPendingEquipoVinculoStorage() {
  try {
    sessionStorage.removeItem("cuaderno_pending_equipo_vinculo");
  } catch {}
}

/** POST join devolvió conflicto UNIQUE(user_id, empresa_id). */
export function isConductorEmpresaUniqueConflictResponse(res, bodyText = "") {
  if (res?.ok) return false;
  if (res?.status === 409) return true;
  try {
    const code = JSON.parse(bodyText || "{}").code;
    if (code === "23505") return true;
  } catch {}
  return /duplicate|already exists|23505|unique constraint/i.test(bodyText || "");
}

/** @deprecated Usar joinOrReactivateConductorEmpresa; solo conservado para diag. */
export function isConductorEmpresaAlreadyJoinedResponse(res, bodyText = "") {
  return res?.ok || isConductorEmpresaUniqueConflictResponse(res, bodyText);
}

async function fetchConductorEmpresaLinkRow(uid, empresaId, { logDiag = false } = {}) {
  const filter = `user_id=eq.${uid}&empresa_id=eq.${empresaId}&select=${CE_SELECT_FULL}&limit=1`;
  const res = await sbFetch(`/rest/v1/conductor_empresa?${filter}`);
  let rows = [];
  if (res.ok) {
    const data = await res.json();
    rows = Array.isArray(data) ? data : [];
  }
  const row = rows[0] || null;

  if (logDiag) {
    const entry = {
      user_id: uid,
      empresa_id: empresaId,
      consulta: `conductor_empresa?${filter}`,
      select_http_status: res.status,
      select_ok: res.ok,
      row_count: rows.length,
      resultado: classifyConductorEmpresaLinkRow(row),
      fila: row
        ? { id: row.id, user_id: row.user_id, empresa_id: row.empresa_id, activo: row.activo }
        : null,
      nota:
        res.ok && rows.length === 0
          ? "0 filas: puede ser RLS (sin permiso SELECT) o fila realmente ausente"
          : null,
    };
    if (!res.ok) {
      entry.select_error = await parseSupabaseHttpError(res);
    }
    logFleetJoinDiag("select_previo", entry);
  }

  if (!res.ok) return null;
  return row;
}

/**
 * Unión por código: INSERT nuevo, PATCH activo=true si existía inactivo, o ya unido.
 * @returns {Promise<{ ok: boolean, outcome: 'inserted'|'reactivated'|'already_joined'|'error', message?: string, res?: Response, rel?: object|null }>}
 */
export async function joinOrReactivateConductorEmpresa({
  uid: uidHint,
  empresaId,
  nombre = "Conductor",
  matricula = "",
  rol = "conductor",
  _diagDepth = 0,
}) {
  const { uid, jwtReady } = await resolveFleetAuthUid(uidHint);

  logFleetJoinDiag("inicio", {
    user_id: uid,
    user_id_hint: uidHint ?? null,
    auth_uid_jwt: getAuthUid(),
    jwt_ready: jwtReady,
    empresa_id: empresaId,
    diag_depth: _diagDepth,
    auth: getSessionAuthDiagnostics(),
  });

  if (!uid || !jwtReady) {
    logFleetJoinDiag("abort", {
      motivo: "sin_uid_o_sin_jwt",
      user_id: uid,
      jwt_ready: jwtReady,
    });
    return { ok: false, outcome: "error", message: "Inicia sesión para continuar" };
  }
  if (!empresaId) {
    logFleetJoinDiag("abort", { motivo: "empresa_id_vacio", user_id: uid });
    return { ok: false, outcome: "error", message: "Empresa no válida" };
  }

  const profileFields = {
    nombre: nombre || "Conductor",
    matricula: matricula || "",
    rol,
    activo: true,
  };

  const existing = await fetchConductorEmpresaLinkRow(uid, empresaId, { logDiag: true });
  if (existing) {
    if (existing.activo !== false) {
      logFleetJoinDiag("accion", {
        user_id: uid,
        empresa_id: empresaId,
        accion: "ninguna",
        motivo: "existe_activo_true",
        resultado: "existe_activo_true",
      });
      return {
        ok: true,
        outcome: "already_joined",
        message: "Ya estás unido a esta empresa.",
        rel: existing,
        res: { ok: true, status: 200 },
      };
    }

    logFleetJoinDiag("accion", {
      user_id: uid,
      empresa_id: empresaId,
      accion: "UPDATE activo=true",
      conductor_empresa_id: existing.id,
      payload: profileFields,
      resultado_previo: "existe_activo_false",
    });

    const res = await sbFetch(`/rest/v1/conductor_empresa?id=eq.${existing.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(profileFields),
    });

    if (!res.ok) {
      const supabaseError = await parseSupabaseHttpError(res);
      logFleetJoinDiag("error", {
        user_id: uid,
        empresa_id: empresaId,
        accion: "UPDATE activo=true",
        supabase: supabaseError,
      });
      return { ok: false, outcome: "error", res };
    }

    const body = await res.json();
    const rel = Array.isArray(body) ? body[0] : body;
    logFleetJoinDiag("ok", {
      user_id: uid,
      empresa_id: empresaId,
      accion: "UPDATE activo=true",
      outcome: "reactivated",
      fila: rel,
    });
    return { ok: true, outcome: "reactivated", rel, res };
  }

  const insertPayload = { user_id: uid, empresa_id: empresaId, ...profileFields };

  logFleetJoinDiag("accion", {
    user_id: uid,
    empresa_id: empresaId,
    accion: "INSERT",
    payload: insertPayload,
    resultado_previo: "no_existe",
  });

  const res = await sbFetch("/rest/v1/conductor_empresa", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(insertPayload),
  });

  if (res.ok) {
    const body = await res.json();
    const rel = Array.isArray(body) ? body[0] : body;
    logFleetJoinDiag("ok", {
      user_id: uid,
      empresa_id: empresaId,
      accion: "INSERT",
      outcome: "inserted",
      fila: rel,
    });
    return { ok: true, outcome: "inserted", rel, res };
  }

  const supabaseError = await parseSupabaseHttpError(res);
  logFleetJoinDiag("error", {
    user_id: uid,
    empresa_id: empresaId,
    accion: "INSERT",
    supabase: supabaseError,
  });

  const resText = supabaseError.raw || "";
  if (isConductorEmpresaUniqueConflictResponse(res, resText)) {
    logFleetJoinDiag("reintento", {
      user_id: uid,
      empresa_id: empresaId,
      motivo: "INSERT_conflict_409_o_23505",
      supabase: supabaseError,
    });
    const raced = await fetchConductorEmpresaLinkRow(uid, empresaId, { logDiag: true });
    if (raced) {
      return joinOrReactivateConductorEmpresa({
        uid,
        empresaId,
        nombre,
        matricula,
        rol,
        _diagDepth: _diagDepth + 1,
      });
    }
    logFleetJoinDiag("reintento_abort", {
      user_id: uid,
      empresa_id: empresaId,
      motivo: "conflict_pero_select_siguiente_vacio",
      nota: "fila existe en BD pero SELECT no visible (RLS?)",
    });
  }

  return { ok: false, outcome: "error", res, resText };
}

/**
 * Tras join OK: reconsulta conductor_empresa, reconstruye estado UI (sin resetear a null).
 * @param {object} [opts.empresa] — fila empresas del código
 * @param {object} [opts.joinRel] — fila devuelta por joinOrReactivateConductorEmpresa
 */
export async function refreshFleetJoinClientState(uidHint = null, { empresa = null, joinRel = null } = {}) {
  await ensureAuthAccessToken();
  const uid = getAuthUid() || uidHint;
  if (!uid) {
    return { uid: null, state: { kind: "none" }, mapped: false, rels: [], hasFleetLink: false };
  }

  let rels = [];
  for (let i = 0; i < 5; i++) {
    rels = await fetchActiveConductorEmpresaRows(uid);
    if (rels.length) break;
    if (i < 4) await new Promise((r) => setTimeout(r, 180 * (i + 1)));
  }

  let state;
  if (rels.length) {
    state = await resolveConductorEmpresaJoinState(uid);
  } else if (empresa?.id) {
    state = buildConductorJoinStateFromEmpresa(empresa, joinRel);
  } else {
    state = { kind: "none" };
  }

  const mapped = joinStateToCampoEmpresaEstado(state);
  const hasFleetLink =
    rels.length > 0 ||
    state.kind === "conductor" ||
    (joinRel && joinRel.activo !== false);

  logFleetJoinDiag("refresh_post_join", {
    user_id: uid,
    empresa_id: empresa?.id ?? joinRel?.empresa_id ?? null,
    rels_count: rels.length,
    state_kind: state.kind,
    mapped_id: mapped?.id ?? null,
    hasFleetLink,
  });

  return { uid, state, mapped, rels, hasFleetLink };
}

/** Tras 409 / fila en BD: estado UI aunque el SELECT RLS falle momentáneamente. */
export function buildConductorJoinStateFromEmpresa(emp, rel = null) {
  if (!emp?.id) return { kind: "none" };
  return {
    kind: "conductor",
    empresaId: emp.id,
    empresaNombre: emp.nombre || "Empresa",
    rel,
  };
}
