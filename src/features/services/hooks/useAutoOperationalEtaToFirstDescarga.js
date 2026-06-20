import { useEffect, useRef } from "react";
import { getBrowserOperationalGps } from "../../../domain/location/browserOperationalGps.js";
import {
  etaThrottlePrevFromServicio,
  shouldAutoRefreshEtaToFirstDescarga,
} from "../../../domain/service/operationalEtaAutoRefresh.js";
import { shouldPersistOperationalEtaRefresh } from "../../../domain/service/operationalEtaRefreshPolicy.js";

/** Comprobación ligera entre ticks (throttle real: 15 min / 15 km en operationalEtaRefreshPolicy). */
const TICK_MS = 3 * 60 * 1000;
const INITIAL_DELAY_MS = 8000;

function uniqueServiciosFromItems(items) {
  const map = new Map();
  for (const item of items || []) {
    const id = item?.servicio?.id;
    if (!id || map.has(id)) continue;
    map.set(id, { servicio: item.servicio, stops: item.stops || [] });
  }
  return [...map.values()];
}

/**
 * Recálculo silencioso de ETA/plan hacia la primera descarga pendiente mientras la pantalla está montada.
 * @param {Function} recalculateRoute — `recalculateOperationalRouteFromCurrentGps`
 */
export function useAutoOperationalEtaToFirstDescarga({
  uid,
  norma,
  items,
  recalculateRoute,
  enabled = true,
}) {
  const inFlightRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!enabled || !uid || typeof recalculateRoute !== "function") return undefined;

    let cancelled = false;

    async function tick() {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const servicios = uniqueServiciosFromItems(itemsRef.current);
        for (const { servicio, stops } of servicios) {
          if (cancelled) break;
          const target = shouldAutoRefreshEtaToFirstDescarga({ servicio, stops, uid });
          if (!target) continue;

          const gps = await getBrowserOperationalGps();
          if (!gps || cancelled) continue;

          const decision = shouldPersistOperationalEtaRefresh({
            prev: etaThrottlePrevFromServicio(servicio),
            point: gps,
            servicioId: servicio.id,
            activeStopId: target.firstDescarga.id,
          });
          if (!decision.should) continue;

          try {
            await recalculateRoute({
              servicio,
              norma,
              destino: target.destino,
              silent: true,
            });
          } catch {
            /* recálculo automático: sin feedback al conductor */
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    const initial = setTimeout(() => void tick(), INITIAL_DELAY_MS);
    const interval = setInterval(() => void tick(), TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [uid, norma, recalculateRoute, enabled]);
}
