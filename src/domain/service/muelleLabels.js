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

/** Entrada en muelle — textos explícitos (nunca genérico «Entrada en muelle»). */
export function muelleEntradaLabel(stop) {
  if (isRetornoStop(stop)) return "Entrada muelle retorno";
  if (isDescargaOperacionStop(stop)) return "Entrada muelle descarga";
  if (isCargaOperacionStop(stop)) return "Entrada muelle carga";
  return "Entrada muelle";
}

/** Salida / fin de operación en muelle. */
export function muelleSalidaLabel(stop) {
  if (isRetornoStop(stop)) return "Salida muelle retorno";
  if (isDescargaOperacionStop(stop)) return "Salida muelle descarga";
  if (isCargaOperacionStop(stop)) return "Salida muelle carga";
  return "Salida muelle";
}

/** Alias acciones rápidas autónomo. */
export function muelleCargaRapidaLabel() {
  return "Entrada muelle carga";
}
