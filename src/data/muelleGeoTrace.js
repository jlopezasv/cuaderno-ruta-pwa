/** Trazas demo para depurar GPS en eventos de muelle. */

import { isDemoApp } from "../config/appEnvironment.js";
import { getStopOperacionMeta } from "../domain/service/stopOperacionMeta.js";
import { formatDriverGeoTimelineLines } from "../domain/service/operationalGeo.js";

export function traceMuelleGeo(eventType, stage, payload = {}) {
  if (!isDemoApp()) return;
  console.log("[GPS muelle]", {
    eventType: eventType || null,
    stage,
    ...payload,
  });
}

export function traceMuelleGeoFromStop(eventType, stage, stop) {
  if (!isDemoApp() || !stop) return;
  const meta = getStopOperacionMeta(stop.notas);
  traceMuelleGeo(eventType, stage, {
    stopId: stop.id,
    entrada_geo: meta.entrada_geo ?? null,
    salida_geo: meta.salida_geo ?? null,
    timelineEntrada: formatDriverGeoTimelineLines(meta.entrada_geo),
    timelineSalida: formatDriverGeoTimelineLines(meta.salida_geo),
    notasTail: String(stop.notas || "").slice(-160),
  });
}
