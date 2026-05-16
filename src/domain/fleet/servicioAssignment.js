import { sbFetch } from "../../data/supabaseClient.js";
import { bootstrapOperationalFlowOnConductorAssign } from "./servicioOperationalBootstrap.js";

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
  if (servicio.estado === SERVICIO_ESTADO_PENDIENTE_ASIGNACION) return true;
  return servicioSinConductor(servicio) && servicio.estado !== "completado" && servicio.estado !== "anulado";
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

const ASSIGN_CHUNK = 40;

/** Carga servicios de flota empresa: por conductores vinculados + empresa_id. */
export async function fetchFlotaServiciosForEmpresa(sbFetchFn, empresaId, conductorUids = []) {
  const byId = new Map();
  const uids = [...new Set((conductorUids || []).filter(Boolean))];

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

/** Asigna conductor principal y pasa a estado asignado (compatible con flujo actual). */
export async function assignConductorPrincipalToServicio({
  servicioId,
  conductorId,
  servicio = null,
  conductorNombre = null,
  origen = null,
  destino = null,
  fechaInicio = null,
}) {
  if (!servicioId || !conductorId) throw new Error("Servicio o conductor no válido");

  const prevConductorId = servicio?.conductor_id ?? null;
  const wasUnassigned = !prevConductorId;

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

  let referencia = patchedServicio?.referencia ?? servicio?.referencia ?? null;
  if (wasUnassigned) {
    const base = {
      ...(servicio || {}),
      ...(patchedServicio || {}),
      id: servicioId,
      conductor_id: conductorId,
      estado: "asignado",
      referencia,
    };
    const bootRef = await bootstrapOperationalFlowOnConductorAssign({
      servicio: base,
      conductorId,
      conductorNombre,
      origen: origen || base.origen,
      destino: destino || base.destino,
      fechaInicio: fechaInicio || base.fecha_inicio,
    });
    if (bootRef) referencia = bootRef;
  }

  return { servicioId, conductorId, origen, destino, fechaInicio, referencia };
}
