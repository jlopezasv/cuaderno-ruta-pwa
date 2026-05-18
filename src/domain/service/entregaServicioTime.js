import { operationalGroupFromStopTipo, sortStopsByOrden } from "./tripOperationalDossier.js";

export const ENTREGA_SERVICIO_TYPE = "entrega_servicio";
export const ENTREGA_SERVICIO_TITLE = "Entrega servicio";

/** Salida del último muelle de descarga (`hora_salida_real`). */
export function resolveSalidaMuelleDescargaFromStops(stops) {
  const sorted = sortStopsByOrden(stops);
  if (!sorted.length) return null;

  let lastUnload = null;
  for (const stop of sorted) {
    const group = operationalGroupFromStopTipo(stop.tipo);
    if (group !== "descarga" && group !== "carga_descarga") continue;
    if (stop.hora_salida_real) lastUnload = stop;
  }
  if (!lastUnload?.hora_salida_real) return null;

  return {
    ts: lastUnload.hora_salida_real,
    stopId: lastUnload.id,
    stopName: String(lastUnload.nombre || "").trim() || null,
  };
}

export function formatEntregaServicioClock(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function entregaServicioEstadoLabel(stops) {
  const salida = resolveSalidaMuelleDescargaFromStops(stops);
  const hora = formatEntregaServicioClock(salida?.ts);
  return hora ? `${ENTREGA_SERVICIO_TITLE} · ${hora}` : ENTREGA_SERVICIO_TITLE;
}
