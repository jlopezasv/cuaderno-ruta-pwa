import { getStopOperacionMeta } from "./stopOperacionMeta.js";

function stopTipo(stop) {
  return String(stop?.tipo || "").toLowerCase();
}

function isRetornoStop(stop) {
  return getStopOperacionMeta(stop?.notas)?.es_retorno === true;
}

export function isDescargaOperacionStop(stop) {
  return stopTipo(stop) === "descarga";
}

export function isCargaOperacionStop(stop) {
  const t = stopTipo(stop);
  return t === "carga" || (t.includes("carga") && !t.includes("descarga"));
}

/** Entrada en muelle — misma lógica en carga y descarga. */
export function muelleEntradaLabel(stop) {
  if (isRetornoStop(stop)) return "Muelle retorno";
  if (isDescargaOperacionStop(stop)) return "Muelle descarga";
  if (isCargaOperacionStop(stop)) return "Muelle carga";
  return "Muelle";
}

/** Salida / fin de operación en muelle. */
export function muelleSalidaLabel(stop) {
  if (isRetornoStop(stop)) return "Salida muelle retorno";
  if (isDescargaOperacionStop(stop)) return "Salida muelle descarga";
  if (isCargaOperacionStop(stop)) return "Salida muelle carga";
  return "Salida muelle";
}

/** Alias para acciones rápidas autónomo (nueva carga en almacén). */
export function muelleCargaRapidaLabel() {
  return "Muelle carga";
}
