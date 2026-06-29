import { getServicioOperacionMeta } from "../../domain/service/serviceOperacionMeta.js";

export const EXPEDIENTE_ESTADO = Object.freeze({
  BORRADOR: "borrador",
  ACTIVO: "activo",
  EN_MUELLE: "en_muelle",
  EN_RUTA: "en_ruta",
  FINALIZADO: "finalizado",
  ANULADO: "anulado",
});

export const MUELLE_ESTADO = Object.freeze({
  ABIERTA: "abierta",
  CERRADA: "cerrada",
  ANULADA: "anulada",
});

export const TIPO_PREVISTO = Object.freeze({
  CARGA: "carga",
  DESCARGA: "descarga",
  CARGA_DESCARGA: "carga_descarga",
  RETORNO: "retorno",
  DEVOLUCION: "devolucion",
  INDEFINIDO: "indefinido",
});

export const TIPO_PREVISTO_LABELS = {
  carga: "Carga",
  descarga: "Descarga",
  carga_descarga: "Carga + descarga",
  retorno: "Retorno / envases",
  devolucion: "Devolución",
  indefinido: "No lo sé todavía",
};

export function getExpedienteEstado(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  return String(meta.expediente_estado || EXPEDIENTE_ESTADO.ACTIVO).toLowerCase();
}

export function isExpedienteAnulado(servicio) {
  return getExpedienteEstado(servicio) === EXPEDIENTE_ESTADO.ANULADO;
}

/** Operación de muelle abierta (contenedor principal del expediente). */
export function getOperacionMuelleActiva(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  const op = meta.operacion_muelle_activa;
  if (!op || typeof op !== "object") return null;
  if (String(op.estado || "").toLowerCase() !== MUELLE_ESTADO.ABIERTA) return null;
  return op;
}

export function getHistorialOperacionesMuelle(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  return Array.isArray(meta.historial_operaciones_muelle) ? meta.historial_operaciones_muelle : [];
}

export function muelleElapsedMinutes(entradaAt) {
  if (!entradaAt) return 0;
  const ms = Date.now() - new Date(entradaAt).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

export function formatMuelleTimer(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function countMovimientosEnMuelle(op) {
  return Array.isArray(op?.movimientos) ? op.movimientos.length : 0;
}

export function summarizeMovimientos(movimientos = []) {
  const counts = { carga: 0, descarga: 0, retorno: 0, devolucion: 0, incidencia: 0 };
  for (const m of movimientos) {
    const t = String(m.tipo || "").toLowerCase();
    if (counts[t] != null) counts[t] += 1;
  }
  return counts;
}

export function mapMovimientoToDecaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "carga") return "CARGA";
  if (t === "descarga") return "DESCARGA";
  if (t === "retorno") return "CARGA_RETORNO";
  if (t === "devolucion") return "DEVOLUCION";
  if (t === "incidencia") return "INCIDENCIA_MERCANCIA";
  return "AJUSTE_MANUAL";
}
