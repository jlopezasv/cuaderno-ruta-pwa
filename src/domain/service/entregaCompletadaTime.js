import { operationalGroupFromStopTipo, sortStopsByOrden } from "./tripOperationalDossier.js";

/**
 * Salida real del último muelle de descarga (hora_salida_real).
 * @returns {{ ts: string, stopId: string, stopName: string }|null}
 */
export function resolveSalidaMuelleDescargaFromStops(stops) {
  const sorted = sortStopsByOrden(stops);
  if (!sorted.length) return null;

  let lastUnload = null;
  for (const stop of sorted) {
    const group = operationalGroupFromStopTipo(stop.tipo);
    if (group !== "descarga" && group !== "carga_descarga") continue;
    const salida = stop.hora_salida_real || null;
    if (salida) lastUnload = stop;
  }
  if (!lastUnload?.hora_salida_real) return null;

  return {
    ts: lastUnload.hora_salida_real,
    stopId: lastUnload.id,
    stopName: String(lastUnload.nombre || "").trim() || null,
  };
}

export function formatEntregaCompletadaClock(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** «Entrega completada · 11:43» o solo «Entrega completada». */
export function entregaCompletadaEstadoLabel(stops) {
  const salida = resolveSalidaMuelleDescargaFromStops(stops);
  const hora = formatEntregaCompletadaClock(salida?.ts);
  return hora ? `Entrega completada · ${hora}` : "Entrega completada";
}
