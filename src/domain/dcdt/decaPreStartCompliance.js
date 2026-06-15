import { getOperationalTripStartedAt } from "../service/serviceOperacionMeta.js";

/**
 * Inicio efectivo del servicio (DeCA — debe existir el PDF antes de este momento).
 *
 * Señales usadas (en orden para la marca temporal):
 * 1. referencia → __SRV_OP__.operational_trip_started_at (bootstrap / asignación)
 * 2. servicios.fecha_inicio (planificado)
 * 3. servicios.updated_at (solo si estado ya es en_curso|completado|cerrado y faltan las anteriores)
 *
 * Detección de «ya iniciado» (aviso, sin bloqueo):
 * - servicios.estado ∈ {en_curso, completado, cerrado}
 * - O servicios.fecha_inicio ≤ ahora (aunque siga asignado)
 */
const ESTADOS_INICIADO = new Set(["en_curso", "completado", "cerrado"]);

export function hasDecaPdfGenerado(dcdt) {
  if (!dcdt) return false;
  if (dcdt.pdfGeneradoAt && dcdt.datos?.pdf_storage_path) return true;
  const hasStorage = !!(dcdt.datos?.pdf_storage_path || dcdt.datos?.pdf_archivo_url);
  const hasPublicDeCa = !!(dcdt.datos?.deca_public_id && dcdt.datos?.deca_download_url);
  return hasStorage && (dcdt.pdfGeneradoAt || dcdt.datos?.pdf_generado_en || hasPublicDeCa);
}

export function isServicioInicioEfectivoAlcanzado(servicio, nowMs = Date.now()) {
  if (!servicio) return false;
  const estado = String(servicio.estado || "").toLowerCase();
  if (ESTADOS_INICIADO.has(estado)) return true;

  const fechaInicio = servicio.fecha_inicio;
  if (fechaInicio) {
    const fiMs = Date.parse(String(fechaInicio));
    if (Number.isFinite(fiMs) && fiMs <= nowMs) return true;
  }

  return false;
}

/** ISO del inicio efectivo (para logs / flag deca_pre_start_gap). */
export function resolveServicioInicioEfectivoAt(servicio, nowMs = Date.now()) {
  if (!servicio || !isServicioInicioEfectivoAlcanzado(servicio, nowMs)) return null;

  const trip = getOperationalTripStartedAt(servicio);
  if (trip) return trip;

  const fechaInicio = servicio.fecha_inicio;
  if (fechaInicio) {
    const fiMs = Date.parse(String(fechaInicio));
    if (Number.isFinite(fiMs) && fiMs <= nowMs) return String(fechaInicio);
  }

  const estado = String(servicio.estado || "").toLowerCase();
  if (ESTADOS_INICIADO.has(estado) && servicio.updated_at) {
    return String(servicio.updated_at);
  }

  return null;
}

export function shouldWarnDecaMissingBeforeStart({ servicio, dcdt }) {
  if (!servicio?.id || !dcdt) return false;
  if (!isServicioInicioEfectivoAlcanzado(servicio)) return false;
  return !hasDecaPdfGenerado(dcdt);
}

export function buildDecaPreStartGapMeta(servicio) {
  return {
    detected_at: new Date().toISOString(),
    servicio_estado: String(servicio?.estado || ""),
    inicio_efectivo_at: resolveServicioInicioEfectivoAt(servicio),
    motivo: "servicio_iniciado_sin_pdf_deca",
  };
}
