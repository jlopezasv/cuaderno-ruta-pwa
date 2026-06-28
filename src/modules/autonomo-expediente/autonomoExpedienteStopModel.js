import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";

export const CARGA_ESTADO = Object.freeze({
  /** Parada creada (almacén elegido) pero aún sin hora de entrada en muelle. */
  PENDIENTE_ENTRADA: "pendiente_entrada",
  EN_MUELLE: "en_muelle",
  COMPLETADA: "completada",
});

export function getCargaOperacionMeta(stop) {
  return getStopOperacionMeta(stop?.notas);
}

export function getCargaEstado(stop) {
  const meta = getCargaOperacionMeta(stop);
  const st = String(meta.carga_estado || "").toLowerCase();
  if (st === CARGA_ESTADO.COMPLETADA) return CARGA_ESTADO.COMPLETADA;
  if (st === CARGA_ESTADO.EN_MUELLE) return CARGA_ESTADO.EN_MUELLE;
  if (st === CARGA_ESTADO.PENDIENTE_ENTRADA) return CARGA_ESTADO.PENDIENTE_ENTRADA;
  // Legacy: paradas con entrada_at pero sin carga_estado explícito
  if (meta.entrada_at && !meta.salida_at) return CARGA_ESTADO.EN_MUELLE;
  if (meta.carga_registrada_at && !meta.entrada_at) return CARGA_ESTADO.PENDIENTE_ENTRADA;
  return null;
}

export function isCargaPendienteEntrada(stop) {
  return getCargaEstado(stop) === CARGA_ESTADO.PENDIENTE_ENTRADA;
}

export function isCargaTerminada(stop) {
  return getCargaEstado(stop) === CARGA_ESTADO.COMPLETADA;
}

export function isCargaEnMuelle(stop) {
  return getCargaEstado(stop) === CARGA_ESTADO.EN_MUELLE;
}

export function getDestinoOperacionMeta(stop) {
  return getStopOperacionMeta(stop?.notas);
}

export function isDestinoEntregado(stop) {
  return String(getDestinoOperacionMeta(stop).destino_estado || "").toLowerCase() === "entregado";
}

export function formatMuelleDuration(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function computeMuelleMinutes(entradaAt, salidaAt) {
  if (!entradaAt || !salidaAt) return null;
  const a = new Date(entradaAt).getTime();
  const b = new Date(salidaAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 60000);
}

export function getCargaMuelleResumen(stop) {
  const meta = getCargaOperacionMeta(stop);
  const min = meta.tiempo_muelle_min ?? computeMuelleMinutes(meta.entrada_at, meta.salida_at);
  return {
    entradaAt: meta.entrada_at || null,
    salidaAt: meta.salida_at || null,
    minutos: min,
    label: formatMuelleDuration(min),
  };
}

export function getDestinoTiempoResumen(stop) {
  const meta = getDestinoOperacionMeta(stop);
  const min = meta.tiempo_destino_min ?? computeMuelleMinutes(meta.entrada_at, meta.salida_at);
  return {
    entradaAt: meta.entrada_at || null,
    salidaAt: meta.salida_at || null,
    minutos: min,
    label: formatMuelleDuration(min),
  };
}

export function cargaMercanciaFromMeta(stop) {
  const m = getCargaOperacionMeta(stop).mercancia;
  return m && typeof m === "object" ? m : {};
}

export function isRetornoCarga(stop) {
  return getCargaOperacionMeta(stop).es_retorno === true;
}
