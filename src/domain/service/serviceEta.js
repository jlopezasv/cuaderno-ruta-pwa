import { geocode, getRoute, buildPlan } from "../route/routePlanning.js";
import { formatOperationalEtaLabel } from "./etaFormatter.js";

/**
 * Paradas relevantes para ETA: en curso solo pendientes/llegados;
 * asignado incluye todas ordenadas.
 */
function stopsForEta(stops, serviceEstado) {
  const sorted = [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (serviceEstado === "en_curso") {
    return sorted.filter((s) => s.estado !== "completado");
  }
  return sorted;
}

function resolveConfidence(routeReals, skippedStops) {
  if (!routeReals.length) return "low";
  const allReal = routeReals.every(Boolean);
  if (allReal && !skippedStops) return "high";
  if (skippedStops) return "medium";
  return allReal ? "high" : "medium";
}

/**
 * ETA operacional usando el mismo motor que Ruta/MapTab (getRoute + buildPlan).
 * Devuelve null si no hay datos suficientes o falla el cálculo (no lanza).
 *
 * @param {object} params
 * @param {{ origen?: string, destino?: string, estado?: string, fecha_inicio?: string }} params.service
 * @param {Array} params.stops
 * @param {object|null} params.norma — mismo objeto que calcNorma (opcional)
 * @param {{ lat: number, lon: number }|null} params.currentPosition
 * @param {boolean} [params.operationalTripStarted=true] — si es false en servicio en_curso, ETA planificada (sin GPS vivo).
 * @returns {Promise<{ eta: string, label: string, confidence: 'high'|'medium'|'low' }|null>}
 */
export async function getServiceEta({
  service,
  stops,
  norma,
  currentPosition,
  operationalTripStarted = true,
}) {
  try {
    if (!service?.origen?.trim() || !service?.destino?.trim()) return null;

    const gpsOk =
      currentPosition &&
      typeof currentPosition.lat === "number" &&
      typeof currentPosition.lon === "number" &&
      !Number.isNaN(currentPosition.lat) &&
      !Number.isNaN(currentPosition.lon);

    const useLiveGps =
      service.estado === "en_curso" ? operationalTripStarted && gpsOk : false;

    let from;
    if (useLiveGps) {
      from = {
        lat: currentPosition.lat,
        lon: currentPosition.lon,
        name: "Posición actual",
      };
    } else {
      from = await geocode(service.origen.trim());
    }

    const relevant = stopsForEta(stops, service.estado);
    let cursor = from;
    let totalKm = 0;
    let totalMins = 0;
    const routeReals = [];
    let skippedStops = false;
    for (const st of relevant) {
      const q = `${st.direccion || ""}`.trim() || `${st.nombre || ""}`.trim();
      if (!q) continue;
      try {
        const pt = await geocode(q);
        const leg = await getRoute(cursor, pt);
        totalKm += leg.km;
        totalMins += leg.mins;
        routeReals.push(leg.real);
        cursor = pt;
      } catch {
        skippedStops = true;
      }
    }

    try {
      const dest = await geocode(service.destino.trim());
      const lastLeg = await getRoute(cursor, dest);
      totalKm += lastLeg.km;
      totalMins += lastLeg.mins;
      routeReals.push(lastLeg.real);
    } catch {
      skippedStops = true;
      if (totalMins <= 0) return null;
    }

    const planStart =
      service.estado === "en_curso"
        ? operationalTripStarted
          ? new Date()
          : service.fecha_inicio
            ? new Date(service.fecha_inicio)
            : new Date()
        : service.fecha_inicio
          ? new Date(service.fecha_inicio)
          : new Date();

    const plan = buildPlan(totalMins, norma || null, {
      contUsed: norma?.cont,
      dayUsed: norma?.todayDrive,
      weekUsed: norma?.weekDrive,
      extUsed: norma?.extUsed,
      start: planStart,
      km: totalKm,
    });

    const arrival = plan.arrival instanceof Date ? plan.arrival : new Date(plan.arrival);
    if (Number.isNaN(arrival.getTime())) return null;

    const label = formatOperationalEtaLabel(arrival) || "Sin ETA";
    const confidence = resolveConfidence(routeReals, skippedStops);

    return {
      eta: arrival.toISOString(),
      label,
      confidence,
    };
  } catch {
    return null;
  }
}
