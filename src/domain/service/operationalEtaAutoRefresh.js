import { isDescargaStopTipo } from "../fleet/stopTypes.js";
import { geocodeQueryFromPlace } from "./serviceOperationalPlaces.js";
import {
  getOperationalEtaSnapshot,
  getOperationalPlanSnapshot,
} from "./serviceOperacionMeta.js";
import { getStopOperacionMeta } from "./stopOperacionMeta.js";
import { isStopOperationallyComplete } from "./serviceStops.js";
import { sortStopsByOrdenOperacional } from "./stopOperationalOrder.js";

export function getFirstPendingDescargaStop(stops) {
  const sorted = sortStopsByOrdenOperacional(stops);
  return sorted.find((s) => isDescargaStopTipo(s.tipo) && !isStopOperationallyComplete(s)) || null;
}
export function hasCompletedDescargaStop(stops) {
  return (stops || []).some((s) => isDescargaStopTipo(s.tipo) && isStopOperationallyComplete(s));
}

/** Texto de geocodificación para usar como destino en `buildOperationalPlanSnapshot`. */
export function destinoQueryFromStop(stop) {
  if (!stop) return "";
  const meta = getStopOperacionMeta(stop?.notas);
  return geocodeQueryFromPlace({
    nombre: stop.nombre,
    direccion: stop.direccion,
    codigo_postal: stop.codigo_postal || meta.codigo_postal,
    pais: stop.pais || meta.pais,
    provincia: stop.provincia || meta.provincia,
  });
}

/** Snapshot compatible con `shouldPersistOperationalEtaRefresh`. */
export function etaThrottlePrevFromServicio(servicio) {
  const op = getOperationalEtaSnapshot(servicio);
  if (op?.eta) return op;
  const plan = getOperationalPlanSnapshot(servicio);
  if (!plan?.planned_eta) return null;
  return {
    eta: plan.planned_eta,
    lat: plan.input_origin_lat,
    lon: plan.input_origin_lon,
    last_eta_refresh_at: plan.snapshot_at,
    calculated_at: plan.snapshot_at,
    servicio_id: servicio?.id ?? null,
  };
}

/**
 * ¿Debe intentarse recálculo automático hacia la primera descarga pendiente?
 * @param {string} uid — conductor actual (debe ser el principal del viaje)
 */
export function shouldAutoRefreshEtaToFirstDescarga({ servicio, stops, uid }) {
  if (!servicio?.id || !uid) return null;
  if (String(servicio.conductor_id || "") !== String(uid)) return null;
  if (hasCompletedDescargaStop(stops)) return null;
  const firstDescarga = getFirstPendingDescargaStop(stops);
  if (!firstDescarga) return null;
  const destino = destinoQueryFromStop(firstDescarga);
  if (!destino) return null;
  return { firstDescarga, destino };
}
