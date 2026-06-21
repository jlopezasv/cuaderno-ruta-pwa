import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { bootstrapOperationalFlowOnConductorAssign } from "./servicioOperationalBootstrap.js";
import { insertStopsForServicio } from "./servicioStopsInsert.js";
import { normalizeParticipacionTipo, PARTICIPACION_TIPO } from "./participacionTipo.js";

/** Servicio planificado en empresa, sin chófer aún. */
export const SERVICIO_ESTADO_PENDIENTE_ASIGNACION = "pendiente_asignacion";

/** Estados visibles en flota empresa con paradas / expediente (sin conductor). */
export const SERVICIO_ESTADOS_PLANIFICACION_EMPRESA = Object.freeze([
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
  "asignado",
  "en_curso",
]);

export function servicioSinConductor(servicio) {
  return !servicio?.conductor_id;
}

export function servicioPendienteAsignacion(servicio) {
  if (!servicio) return false;
  if (servicio.conductor_id) return false;
  if (servicio.estado === SERVICIO_ESTADO_PENDIENTE_ASIGNACION) return true;
  return (
    servicioSinConductor(servicio) &&
    servicio.estado !== "completado" &&
    servicio.estado !== "cerrado" &&
    servicio.estado !== "anulado"
  );
}

/** El conductor solo ve servicios ya asignados a su uid. */
export function servicioVisibleParaConductor(servicio, conductorUid) {
  if (!servicio?.id || !conductorUid) return false;
  if (servicioSinConductor(servicio)) return false;
  if (servicio.estado === SERVICIO_ESTADO_PENDIENTE_ASIGNACION) {
    return servicio.conductor_id === conductorUid;
  }
  return servicio.conductor_id === conductorUid;
}

/**
 * Conductor efectivo en una parada (fase 3).
 * Por defecto: servicio.conductor_id. Override futuro vía servicio_asignaciones.
 */
export function resolveConductorIdForStop(servicio, stopId, asignacionesPorStop = null) {
  if (!servicio) return null;
  const map = asignacionesPorStop || {};
  const row = stopId != null ? map[stopId] : null;
  if (row?.conductor_id) return row.conductor_id;
  return servicio.conductor_id || null;
}

function dispatchRecargarServicioActivo() {
  try {
    window.dispatchEvent(new CustomEvent("cuaderno-recargar-servicio"));
  } catch {
    /* SSR */
  }
}

function referenciaOperacionalValida(ref) {
  return ref != null && String(ref).trim() !== "" && String(ref).includes("__SRV_OP__");
}

export async function ensureServicioHasStops({
  servicioId,
  origen = null,
  destino = null,
}) {
  if (!servicioId) return;
  const existingRes = await sbFetch(`/rest/v1/stops?servicio_id=eq.${servicioId}&select=id&limit=1`);
  if (!existingRes.ok) return;
  const existingRows = await existingRes.json().catch(() => []);
  if (Array.isArray(existingRows) && existingRows.length > 0) return;

  const origenLabel = String(origen || "").trim() || "Origen";
  const destinoLabel = String(destino || "").trim() || "Destino";
  const result = await insertStopsForServicio(servicioId, [
    { orden: 1, tipo: "carga", nombre: origenLabel, direccion: null, notas: null },
    { orden: 2, tipo: "descarga", nombre: destinoLabel, direccion: null, notas: null },
  ]);
  if (!result.ok) {
    throw new Error(result.error || "No se pudieron crear paradas base para el servicio");
  }
}

/** Carga servicios de flota empresa: solo filas con empresa_id del tenant (no autónomo propio). */
export async function fetchFlotaServiciosForEmpresa(sbFetchFn, empresaId, conductorUids = []) {
  const byId = new Map();
  const uids = [...new Set((conductorUids || []).filter(Boolean))];
  const ASSIGN_CHUNK = 40;
  const tenantId = empresaId ? String(empresaId) : "";

  for (let i = 0; i < uids.length; i += ASSIGN_CHUNK) {
    const slice = uids.slice(i, i + ASSIGN_CHUNK);
    if (!tenantId) continue;
    const r = await sbFetchFn(
      `/rest/v1/servicios?conductor_id=in.(${slice.join(",")})&empresa_id=eq.${tenantId}&order=created_at.desc&limit=120`,
    );
    if (r.ok) {
      const rows = await r.json();
      (Array.isArray(rows) ? rows : []).forEach((s) => {
        if (s?.id && String(s.empresa_id || "") === tenantId) byId.set(s.id, s);
      });
    }
  }

  if (empresaId) {
    const r = await sbFetchFn(
      `/rest/v1/servicios?empresa_id=eq.${empresaId}&order=created_at.desc&limit=120`,
    );
    if (r.ok) {
      const rows = await r.json();
      (Array.isArray(rows) ? rows : []).forEach((s) => {
        if (s?.id) byId.set(s.id, s);
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

/**
 * Asigna conductor principal y pasa a estado asignado.
 *
 * Persistencia de `referencia` (__SRV_OP__):
 * 1) Bootstrap PATCH solo `referencia` (servicio sin conductor en BD).
 * 2) PATCH `conductor_id` + `estado` sin tocar `referencia`.
 * 3) Si el servidor devuelve referencia null, reintento PATCH solo referencia.
 */
export async function assignConductorPrincipalToServicio({
  servicioId,
  conductorId,
  servicio = null,
  conductorNombre = null,
  origen = null,
  destino = null,
  fechaInicio = null,
  /** Si true, no crea paradas base (el caller insertará paradas justo después). */
  skipEnsureStops = false,
}) {
  if (!servicioId || !conductorId) throw new Error("Servicio o conductor no válido");

  const prevConductorId = servicio?.conductor_id ?? null;
  const wasUnassigned = !prevConductorId;
  let referencia = servicio?.referencia ?? null;
  let bootstrapResultado = { skipped: true, reason: wasUnassigned ? null : "already_had_conductor" };

  if (wasUnassigned) {
    const base = {
      ...(servicio || {}),
      id: servicioId,
      conductor_id: null,
      estado: SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
      referencia,
    };
    referencia = await bootstrapOperationalFlowOnConductorAssign({
      servicio: base,
      conductorId,
      conductorNombre,
      origen: origen || base.origen,
      destino: destino || base.destino,
      fechaInicio: fechaInicio || base.fecha_inicio,
      persist: true,
      dispatchRecarga: false,
    });
    bootstrapResultado = { skipped: false, referenciaLength: String(referencia).length };
    if (!referenciaOperacionalValida(referencia)) {
      throw new Error("No se pudo guardar la referencia operativa del servicio (bootstrap)");
    }
  }

  if (!skipEnsureStops) {
    await ensureServicioHasStops({
      servicioId,
      origen: origen || servicio?.origen || null,
      destino: destino || servicio?.destino || null,
    });
  }

  const patch = {
    conductor_id: conductorId,
    estado: "asignado",
  };
  const r = await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `PATCH servicio ${r.status}`);
  }

  const patchedRows = await r.json().catch(() => null);
  const patchedServicio = Array.isArray(patchedRows) ? patchedRows[0] : patchedRows;
  if (!patchedServicio?.id) {
    throw new Error("Asignación no aplicada: el servicio no se actualizó (revisa permisos RLS)");
  }

  if (referenciaOperacionalValida(patchedServicio.referencia)) {
    referencia = patchedServicio.referencia;
  } else if (wasUnassigned && referenciaOperacionalValida(referencia)) {
    const refRes = await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ referencia }),
    });
    if (!refRes.ok) {
      const t = await refRes.text().catch(() => "");
      throw new Error(t || "No se pudo restaurar referencia operativa tras asignar conductor");
    }
    const refRows = await refRes.json().catch(() => null);
    const refRow = Array.isArray(refRows) ? refRows[0] : refRows;
    if (referenciaOperacionalValida(refRow?.referencia)) {
      referencia = refRow.referencia;
    }
  }

  if (wasUnassigned && !referenciaOperacionalValida(referencia)) {
    throw new Error("Asignación incompleta: referencia operativa no persistida");
  }

  const asignacionBody = {
    servicio_id: servicioId,
    conductor_id: conductorId,
    stop_id: null,
    tipo_asignacion: "principal",
    participacion_tipo: PARTICIPACION_TIPO.TODO,
  };

  await sbFetch("/rest/v1/servicio_asignaciones", {
    method: "POST",
    body: JSON.stringify(asignacionBody),
  }).catch(() => {});

  await sbFetch("/rest/v1/asignaciones", {
    method: "POST",
    body: JSON.stringify({
      servicio_id: servicioId,
      conductor_id: conductorId,
      tipo: "principal",
      estado: "activa",
    }),
  }).catch(() => {});

  if (wasUnassigned) dispatchRecargarServicioActivo();

  return { servicioId, conductorId, origen, destino, fechaInicio, referencia, bootstrapResultado };
}

/**
 * Lee los conductor_id ya asignados a un servicio (principal + colaboradores)
 * desde servicio_asignaciones. Multi-Conductor V1.
 * @param {string} servicioId
 * @returns {Promise<string[]>} ids únicos
 */
export async function fetchServicioConductorIds(servicioId) {
  if (!servicioId) return [];
  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id`,
  );
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return [...new Set((Array.isArray(rows) ? rows : []).map((x) => x?.conductor_id).filter(Boolean))];
}

/**
 * Lee participacion_tipo por conductor en un servicio (demo).
 * @returns {Promise<Record<string,string>>} conductor_id → participacion_tipo
 */
export async function fetchParticipacionTipoByConductorForServicio(servicioId) {
  if (!servicioId) return {};
  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,participacion_tipo`,
  );
  if (!r.ok) return {};
  const rows = await r.json().catch(() => []);
  const map = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (row?.conductor_id) map[row.conductor_id] = normalizeParticipacionTipo(row.participacion_tipo);
  });
  return map;
}

/**
 * @param {string} servicioId
 * @param {Record<string,string>} participacionTipoByConductorId
 */
export async function patchParticipacionTiposForServicio(servicioId, participacionTipoByConductorId = {}) {
  if (!servicioId) return;
  const entries = Object.entries(participacionTipoByConductorId || {}).filter(([cid]) => cid);
  for (const [conductorId, rawTipo] of entries) {
    const participacion_tipo = normalizeParticipacionTipo(rawTipo);
    await sbFetch(
      `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&conductor_id=eq.${conductorId}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ participacion_tipo }),
      },
    ).catch(() => {});
  }
}

/**
 * Sincroniza los conductores COLABORADORES de un servicio (multi-conductor V1).
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.participacionTipoByConductorId]
 */
export async function syncServicioColaboradores(
  servicioId,
  principalId,
  colaboradorIds,
  opts = {},
) {
  if (!servicioId) return { added: [], removed: [] };
  const participacionTipoByConductorId = opts.participacionTipoByConductorId || {};
  const desired = [...new Set((colaboradorIds || []).filter((id) => id && id !== principalId))];

  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,tipo_asignacion`,
  );
  const rows = r.ok ? await r.json().catch(() => []) : [];
  const existing = Array.isArray(rows) ? rows : [];
  const existingColabIds = new Set(
    existing
      .filter((x) => x?.conductor_id && x.conductor_id !== principalId)
      .map((x) => x.conductor_id),
  );

  const added = desired.filter((id) => !existingColabIds.has(id));
  for (const id of added) {
    await sbFetch("/rest/v1/servicio_asignaciones", {
      method: "POST",
      body: JSON.stringify({
        servicio_id: servicioId,
        conductor_id: id,
        stop_id: null,
        tipo_asignacion: "colaborador",
        participacion_tipo: normalizeParticipacionTipo(participacionTipoByConductorId[id]),
      }),
    }).catch(() => {});
  }

  const removed = [...existingColabIds].filter((id) => !desired.includes(id));
  for (const id of removed) {
    await sbFetch(
      `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&conductor_id=eq.${id}&tipo_asignacion=eq.colaborador`,
      { method: "DELETE" },
    ).catch(() => {});
  }

  return { added, removed };
}

/**
 * FASE 2A — Lee las participaciones (filas servicio_asignaciones) de un servicio.
 * @param {string} servicioId
 * @returns {Promise<Array<{conductor_id:string,tipo_asignacion:string,estado_participacion:string}>>}
 */
export async function fetchParticipacionServicio(servicioId) {
  if (!servicioId) return [];
  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,tipo_asignacion,estado_participacion,stop_id`,
  );
  if (r.ok) {
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }
  // Migración FASE 2A aún no aplicada: reintentar sin la columna nueva (para que el conteo siga funcionando).
  const r2 = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,tipo_asignacion`,
  ).catch(() => null);
  if (r2 && r2.ok) {
    const rows = await r2.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

/**
 * FASE 2A — Finaliza la participación de UN conductor sin cerrar el servicio.
 * Solo toca su fila en servicio_asignaciones (estado_participacion='finalizado').
 * NO modifica servicios.estado ni la cola global del resto de conductores.
 * @param {string} servicioId
 * @param {string} conductorId
 * @returns {Promise<{ok:boolean}>}
 */
/**
 * FASE 2B — Marca participación activa y fija inicio si aún no existe (sin tocar FASE 2A fetch).
 */
export async function marcarParticipacionActiva(servicioId, conductorId) {
  if (!servicioId || !conductorId) return { ok: false };
  const now = new Date().toISOString();
  const patch = { estado_participacion: "activo", fecha_inicio_participacion: now };
  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&conductor_id=eq.${conductorId}&fecha_inicio_participacion=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  ).catch(() => null);
  if (r?.ok) {
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) return { ok: true };
  }
  await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&conductor_id=eq.${conductorId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado_participacion: "activo" }),
    },
  ).catch(() => null);
  return { ok: true };
}

export const SOLE_ACTIVE_CONDUCTOR_ERROR =
  "No puedes hacer esto: eres el único conductor asignado a este servicio";

export const STOP_DROP_ORPHAN_ERROR =
  "No puedes soltar esta parada: nadie más quedaría asignado a ella. Pide a tráfico que asigne otro conductor primero, o complétala tú mismo.";

async function parseSupabaseErrorResponse(response) {
  const body = await response.text().catch(() => "");
  if (!body) return "Error desconocido";
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.message || parsed?.error || parsed?.details;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  } catch {
    /* body no JSON */
  }
  return body.trim() || "Error desconocido";
}

async function callGuardedParticipacionRpc(rpcName, payload) {
  const r = await sbFetch(`/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!r) throw new Error("Sin conexión");
  if (!r.ok) {
    throw new Error(await parseSupabaseErrorResponse(r));
  }
  return { ok: true };
}

/** Conductores con participación activa en el servicio (no finalizada a nivel viaje). */
export async function fetchActiveConductorIdsForServicio(servicioId) {
  if (!servicioId) return new Set();
  const active = new Set();
  const wholeFinalized = new Set();

  const sr = await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}&select=conductor_id`).catch(() => null);
  if (sr?.ok) {
    const rows = await sr.json().catch(() => []);
    const principalId = Array.isArray(rows) ? rows[0]?.conductor_id : null;
    if (principalId) active.add(principalId);
  }

  const ar = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,estado_participacion,stop_id`,
  ).catch(() => null);
  if (ar?.ok) {
    const rows = await ar.json().catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const cid = row?.conductor_id;
      if (!cid) continue;
      active.add(cid);
      const est = String(row.estado_participacion || "").toLowerCase();
      if (est === "finalizado" && !row.stop_id) wholeFinalized.add(cid);
    }
  }

  for (const cid of wholeFinalized) active.delete(cid);
  return active;
}

/** Resumen de participación para UI (Tab Servicio / anti-huérfano). */
export async function fetchParticipacionResumenServicio(servicioId) {
  const activeIds = await fetchActiveConductorIdsForServicio(servicioId);
  const ar = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,stop_id`,
  ).catch(() => null);
  const allIds = new Set(activeIds);
  if (ar?.ok) {
    const rows = await ar.json().catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.conductor_id) allIds.add(row.conductor_id);
    }
  }
  const sr = await sbFetch(`/rest/v1/servicios?id=eq.${servicioId}&select=conductor_id`).catch(() => null);
  if (sr?.ok) {
    const rows = await sr.json().catch(() => []);
    const principalId = Array.isArray(rows) ? rows[0]?.conductor_id : null;
    if (principalId) allIds.add(principalId);
  }
  return {
    total: allIds.size || 1,
    activos: activeIds.size || (allIds.size ? 1 : 0),
    activeIds,
  };
}

export function isConductorUltimoActivoEnServicio(activeIds, conductorId) {
  if (!conductorId) return false;
  const set = activeIds instanceof Set ? activeIds : new Set(activeIds || []);
  return set.size <= 1 && set.has(conductorId);
}

export async function assertNotSoleActiveConductor(servicioId, conductorId) {
  if (!servicioId || !conductorId) return;
  const active = await fetchActiveConductorIdsForServicio(servicioId);
  if (active.size <= 1 && active.has(conductorId)) {
    throw new Error(SOLE_ACTIVE_CONDUCTOR_ERROR);
  }
}

/** Paradas que el conductor ha soltado (stop_id con participación finalizada). */
export async function fetchConductorDroppedStopIds(servicioId, conductorId) {
  if (!servicioId || !conductorId) return new Set();
  const ar = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&conductor_id=eq.${conductorId}&stop_id=not.is.null&estado_participacion=eq.finalizado&select=stop_id`,
  ).catch(() => null);
  if (!ar?.ok) return new Set();
  const rows = await ar.json().catch(() => []);
  const out = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.stop_id) out.add(row.stop_id);
  }
  return out;
}

export async function fetchAllConductorDroppedStopIds(conductorId) {
  if (!conductorId) return new Map();
  const ar = await sbFetch(
    `/rest/v1/servicio_asignaciones?conductor_id=eq.${conductorId}&stop_id=not.is.null&estado_participacion=eq.finalizado&select=servicio_id,stop_id`,
  ).catch(() => null);
  if (!ar?.ok) return new Map();
  const rows = await ar.json().catch(() => []);
  const byServicio = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const sid = row?.servicio_id;
    const stopId = row?.stop_id;
    if (!sid || !stopId) continue;
    if (!byServicio.has(sid)) byServicio.set(sid, new Set());
    byServicio.get(sid).add(stopId);
  }
  return byServicio;
}

/** Quita una parada concreta de la lista del conductor (RPC atómica con anti-huérfana). */
export async function soltarParadaConductor(servicioId, conductorId, stopId) {
  if (!servicioId || !conductorId || !stopId) throw new Error("Datos incompletos");
  return callGuardedParticipacionRpc("soltar_parada_conductor_guarded", {
    p_servicio_id: servicioId,
    p_conductor_id: conductorId,
    p_stop_id: stopId,
    p_apply_participacion_tipo_filter: isDemoApp(),
  });
}

/** Finaliza participación del conductor (RPC atómica; valida cada parada pendiente visible). */
export async function finalizarParticipacionConductor(servicioId, conductorId) {
  if (!servicioId || !conductorId) throw new Error("Datos incompletos");
  return callGuardedParticipacionRpc("finalizar_participacion_conductor_guarded", {
    p_servicio_id: servicioId,
    p_conductor_id: conductorId,
    p_apply_participacion_tipo_filter: isDemoApp(),
  });
}
