/** Trazas demo obligatorias para GPS en eventos de muelle. */

import { isDemoApp } from "../config/appEnvironment.js";
import { getStopOperacionMeta } from "../domain/service/stopOperacionMeta.js";
import { formatDriverGeoTimelineLines, formatExpedienteUbicacionLine } from "../domain/service/operationalGeo.js";

/** @param {"before request"|"result"|"payload before save"|"supabase update result"|"stop after save"|"timeline event built"} stage */
export function logMuelleGps(stage, payload = {}) {
  if (!isDemoApp()) return;
  console.log(`[MUELLE GPS] ${stage}`, payload);
}

export function logMuelleGpsTimelineFromStop(eventType, stop, extra = {}) {
  if (!isDemoApp() || !stop) return;
  const meta = getStopOperacionMeta(stop.notasOperacion ?? stop.notas);
  const isEntrada = eventType === "entrada_muelle";
  const geo = isEntrada ? meta.entrada_geo : meta.salida_geo;
  logMuelleGps("timeline event built", {
    eventType,
    stopId: stop.id,
    geo,
    driverLines: formatDriverGeoTimelineLines(geo),
    expedienteLine: formatExpedienteUbicacionLine(geo),
    ...extra,
  });
}
