import {
  estadoDecaResumen,
  formatMatriculasLabel,
  obtenerInventarioActual,
  resolveMatriculasExpediente,
  summarizeInventarioParaUi,
} from "./inventarioExpedienteModel.js";
import {
  EXPEDIENTE_ESTADO,
  formatMuelleTimer,
  getExpedienteEstado,
  getOperacionMuelleActiva,
  muelleElapsedMinutes,
} from "./operacionMuelleModel.js";
import { getTipoTransporte, tipoTransporteBadgeStyle } from "../../domain/service/tipoTransporte.js";
import { formatStockLineLabel } from "../../domain/dcdt/decaVivoStock.js";

function formatRelativeMinutes(iso) {
  if (!iso) return null;
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return `hace ${h} h`;
}

function estadoExpedienteLabel(servicio, operacion) {
  if (getExpedienteEstado(servicio) === EXPEDIENTE_ESTADO.ANULADO) return "Anulado";
  if (operacion) return "En muelle";
  const est = getExpedienteEstado(servicio);
  if (est === EXPEDIENTE_ESTADO.EN_RUTA) return "En ruta";
  if (est === EXPEDIENTE_ESTADO.FINALIZADO) return "Pendiente de cerrar";
  return "Activo";
}

/** Resumen para tarjeta al volver al panel / home. */
export function buildResumenExpedienteActivo({ servicio, stock = [], documento = null, profile = null, timeline = [] }) {
  const operacion = getOperacionMuelleActiva(servicio);
  const tipo = getTipoTransporte(servicio, profile);
  const badge = tipoTransporteBadgeStyle(tipo);
  const matriculas = resolveMatriculasExpediente(servicio, profile);
  const inv = summarizeInventarioParaUi(stock);
  const deca = estadoDecaResumen({ stock, documento, tipoTransporte: tipo, matriculas });
  const ultimoEvt = timeline?.length ? timeline[timeline.length - 1] : null;
  const lugar = operacion?.lugar_nombre || servicio?.origen || "—";
  const mercanciaLines = stock.map((l) => formatStockLineLabel(l));
  const destinosPendientes = inv.sinDestino.length > 0;
  const repartoLabel = destinosPendientes
    ? "Pendiente de reparto"
    : inv.idaConDestino.length
      ? inv.idaConDestino.map((l) => formatStockLineLabel(l)).join(" · ")
      : "Sin carga";

  return {
    estado: estadoExpedienteLabel(servicio, operacion),
    lugar,
    tipo,
    tipoLabel: badge.label,
    tipoBadge: badge,
    matriculas,
    matriculasLabel: formatMatriculasLabel(matriculas),
    entradaMuelle: operacion?.entrada_at || null,
    tiempoMuelle: operacion ? formatMuelleTimer(muelleElapsedMinutes(operacion.entrada_at)) : null,
    mercanciaLines,
    hayMercancia: stock.length > 0,
    destinosLabel: repartoLabel,
    destinosPendientes,
    deca,
    ultimaAccion: ultimoEvt?.label || null,
    ultimaAccionHace: formatRelativeMinutes(ultimoEvt?.at),
    enMuelle: !!operacion,
  };
}

/** Carga inventario + construye resumen (async). */
/** @deprecated Usar ObtenerInventarioActualQuery desde UI; se mantiene por compatibilidad interna. */
export async function loadResumenExpedienteActivo(servicio, { profile = null, timeline = [] } = {}) {
  const { stock, documento } = await obtenerInventarioActual(servicio?.id);
  return {
    stock,
    documento,
    resumen: buildResumenExpedienteActivo({ servicio, stock, documento, profile, timeline }),
  };
}
