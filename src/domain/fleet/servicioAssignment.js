import { sbFetch } from "../../data/supabaseClient.js";
import { bootstrapOperationalFlowOnConductorAssign } from "./servicioOperationalBootstrap.js";
import { insertStopsForServicio } from "./servicioStopsInsert.js";

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
 * Sincroniza los conductores COLABORADORES de un servicio (multi-conductor V1).
 * NO toca el conductor principal (servicios.conductor_id) ni el estado ni la cola FIFO.
 * Inserta filas servicio_asignaciones (tipo 'colaborador') para los nuevos y elimina
 * las filas 'colaborador' que ya no estén seleccionadas.
 * @param {string} servicioId
 * @param {string|null} principalId — conductor principal (nunca se añade/elimina aquí)
 * @param {string[]} colaboradorIds — conductores adicionales deseados
 * @returns {Promise<{added:string[],removed:string[]}>}
 */
export async function syncServicioColaboradores(servicioId, principalId, colaboradorIds) {
  if (!servicioId) return { added: [], removed: [] };
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
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,tipo_asignacion,estado_participacion`,
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

export async function finalizarParticipacionConductor(servicioId, conductorId) {
  if (!servicioId || !conductorId) return { ok: false };
  const now = new Date().toISOString();
  const patch = { estado_participacion: "finalizado", fecha_fin_participacion: now };
  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&conductor_id=eq.${conductorId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  ).catch(() => null);
  if (r && r.ok) {
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) return { ok: true };
  }
  // Servicio legacy sin fila para este conductor: crear una ya finalizada.
  const ins = await sbFetch("/rest/v1/servicio_asignaciones", {
    method: "POST",
    body: JSON.stringify({
      servicio_id: servicioId,
      conductor_id: conductorId,
      stop_id: null,
      tipo_asignacion: "colaborador",
      estado_participacion: "finalizado",
      fecha_fin_participacion: now,
    }),
  }).catch(() => null);
  return { ok: !!(ins && ins.ok) };
}
