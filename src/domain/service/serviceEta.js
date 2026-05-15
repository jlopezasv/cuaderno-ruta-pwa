import { geocode, getRoute, buildPlan, TRUCK_KMH } from "../route/routePlanning.js";
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
 * @param {number} [params.truckSpeedKmh] — km/h para legs OSRM; por defecto TRUCK_KMH (80), o convive con `operational_plan.velocidad` si se pasa explícito.
 * @returns {Promise<{ eta: string, label: string, confidence: 'high'|'medium'|'low', remaining_km: number, remaining_mins: number }|null>}
 */
export async function getServiceEta({
  service,
  stops,
  norma,
  currentPosition,
  operationalTripStarted = true,
  /** Alineado con planificador / snapshot (`operational_plan.velocidad`). Por defecto 80. */
  truckSpeedKmh,
}) {
  try {
    if (!service?.origen?.trim() || !service?.destino?.trim()) return null;

    const speed =
      truckSpeedKmh != null && Number.isFinite(Number(truckSpeedKmh))
        ? Math.min(100, Math.max(60, Math.round(Number(truckSpeedKmh))))
        : TRUCK_KMH;

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
        const leg = await getRoute(cursor, pt, speed);
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
      const lastLeg = await getRoute(cursor, dest, speed);
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
    const remaining_km = Math.round(totalKm * 10) / 10;
    const remaining_mins = Math.max(0, Math.round(totalMins));

    return {
      eta: arrival.toISOString(),
      label,
      confidence,
      remaining_km,
      remaining_mins,
    };
  } catch {
    return null;
  }
}
