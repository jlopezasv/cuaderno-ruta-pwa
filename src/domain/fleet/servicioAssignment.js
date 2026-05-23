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
  if (servicio.estado === SERVICIO_ESTADO_PENDIENTE_ASIGNACION) return false;
  if (servicioSinConductor(servicio)) return false;
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

/** Carga servicios de flota empresa: por conductores vinculados + empresa_id. */
export async function fetchFlotaServiciosForEmpresa(sbFetchFn, empresaId, conductorUids = []) {
  const byId = new Map();
  const uids = [...new Set((conductorUids || []).filter(Boolean))];
  const ASSIGN_CHUNK = 40;

  for (let i = 0; i < uids.length; i += ASSIGN_CHUNK) {
    const slice = uids.slice(i, i + ASSIGN_CHUNK);
    const r = await sbFetchFn(
      `/rest/v1/servicios?conductor_id=in.(${slice.join(",")})&order=created_at.desc&limit=120`,
    );
    if (r.ok) {
      const rows = await r.json();
      (Array.isArray(rows) ? rows : []).forEach((s) => {
        if (s?.id) byId.set(s.id, s);
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
