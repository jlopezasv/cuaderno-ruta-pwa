import {
  SERVICIO_ESTADO_CERRADO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_EN_CURSO,
} from "../fleet/serviceStatus.js";
import { countCompletedStops } from "./serviceStops.js";
import { getServicioOperacionMeta, mergeReferenciaOperacional } from "./serviceOperacionMeta.js";

/** Cierre documental del viaje (meta en `referencia`, separado de muelles). */
export function getExpedienteCierre(servicio) {
  const cierre = getServicioOperacionMeta(servicio)?.expediente_cierre;
  return cierre && typeof cierre === "object" ? cierre : null;
}

export function isServicioExpedienteCerrado(servicio) {
  if (!servicio) return false;
  if (String(servicio.estado || "").toLowerCase() === SERVICIO_ESTADO_CERRADO) return true;
  return !!getExpedienteCierre(servicio)?.closed_at;
}

/** Todas las paradas con salida de muelle (operativa terminada). */
export function isOperativaMuellesCompletada(stops) {
  const list = Array.isArray(stops) ? stops : [];
  if (!list.length) return false;
  return list.every((s) => s.estado === "completado" || !!s.hora_salida_real);
}

/**
 * Operativa hecha pero expediente aún sin cerrar (firma + comentario).
 */
export function needsExpedienteClosure(servicio, stops) {
  if (!servicio?.id || isServicioExpedienteCerrado(servicio)) return false;
  if (!isOperativaMuellesCompletada(stops)) return false;
  const st = String(servicio.estado || "").toLowerCase();
  return st === SERVICIO_ESTADO_COMPLETADO || st === SERVICIO_ESTADO_EN_CURSO;
}

export function operativaProgressLabel(stops) {
  const total = Array.isArray(stops) ? stops.length : 0;
  const done = countCompletedStops(stops);
  if (!total) return null;
  return `${done}/${total} paradas`;
}

export function buildExpedienteCierreMetaPatch({
  comentario = "",
  firmaUrl = null,
  conductorId = null,
  conductorNombre = null,
  geo = null,
  closedAt = new Date().toISOString(),
} = {}) {
  return {
    expediente_cierre: {
      closed_at: closedAt,
      comentario: String(comentario || "").trim() || null,
      firma_url: firmaUrl || null,
      conductor_id: conductorId || null,
      conductor_nombre: conductorNombre || null,
      geo: geo && Number.isFinite(Number(geo.lat)) ? geo : null,
    },
  };
}

export function mergeReferenciaConCierre(referencia, patch) {
  return mergeReferenciaOperacional(referencia, patch);
}
