/**
 * Expediente operacional — agrupa paradas y calcula tiempos con datos ya cargados (sin Supabase extra).
 */

import { getOperationalTripStartMs } from "./operationalTrip.js";
import { getServiceClient, getServiceNumber } from "./serviceIdentity.js";
import { getInicioOperacionMs } from "./stopOperacionMeta.js";
import { sortStopsByOrdenOperacional } from "./stopOperationalOrder.js";

export function operationalGroupFromStopTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "carga") return "carga";
  if (t === "descarga") return "descarga";
  if (t.includes("carga") && t.includes("descarga")) return "carga_descarga";
  return "parada_tecnica";
}

export const OPERATIONAL_GROUP_LABEL = {
  carga: "CARGA",
  descarga: "DESCARGA",
  carga_descarga: "CARGA + DESCARGA",
  parada_tecnica: "PARADA TÉCNICA",
};

function parseTs(v) {
  if (v == null || v === "") return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function sortStopsByOrden(stops) {
  return sortStopsByOrdenOperacional(stops);
}

/**
 * Incidencias de texto por stop (para bloque operacional).
 */
export function incidenciaLinesForStop(stopId, flotaEvs) {
  const arr = flotaEvs?.[stopId];
  if (!Array.isArray(arr)) return [];
  const lines = [];
  for (const ev of arr) {
    if (ev?.tipo !== "incidencia") continue;
    const txt = ev.datos?.texto || ev.nota || "";
    if (txt && String(txt).trim()) lines.push(String(txt).trim());
  }
  return lines;
}

/**
 * Métricas globales + detalle por parada (minutos donde aplica).
 */
export function computeTripOperationalMetrics(servicio, stopsRaw, nowMs = Date.now()) {
  const stops = sortStopsByOrden(stopsRaw);
  const fechaInicioMs = parseTs(servicio?.fecha_inicio);
  const opStartMs = getOperationalTripStartMs(servicio, stops);

  let endMs = nowMs;
  if (servicio?.estado === "completado") {
    let maxMs = fechaInicioMs ?? 0;
    for (const st of stops) {
      const ls = parseTs(st.hora_salida_real);
      const ll = parseTs(st.hora_llegada_real);
      if (ls != null && ls > maxMs) maxMs = ls;
      if (ll != null && ll > maxMs) maxMs = ll;
    }
    if (maxMs > (fechaInicioMs ?? 0)) endMs = maxMs;
  }

  /** Tiempo total del expediente operacional: solo tras salida del 1.º muelle de carga. */
  const tiempoTotalViajeMin =
    opStartMs != null ? Math.max(0, Math.round((endMs - opStartMs) / 60000)) : null;

  /** Conducción del viaje operacional solo tras `operational_trip_started_at` (PR-30). */
  let tiempoConduccionViajeMin = 0;
  if (opStartMs != null) {
    let prevFinMs = opStartMs;
    for (const st of stops) {
      const llegada = parseTs(st.hora_llegada_real);
      const salida = parseTs(st.hora_salida_real);
      if (llegada == null) continue;
      if (llegada < opStartMs) {
        prevFinMs = salida ?? llegada ?? prevFinMs;
        continue;
      }
      if (prevFinMs != null && llegada >= prevFinMs) {
        tiempoConduccionViajeMin += Math.round((llegada - prevFinMs) / 60000);
      }
      prevFinMs = salida ?? llegada ?? prevFinMs;
    }
  }

  let tiempoEnPlantaCargaMin = 0;
  let tiempoEnPlantaDescargaMin = 0;
  let esperaMuelleCargaMin = 0;
  let esperaMuelleDescargaMin = 0;

  const perStop = [];

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const g = operationalGroupFromStopTipo(st.tipo);
    const llegada = parseTs(st.hora_llegada_real);
    const salida = parseTs(st.hora_salida_real);
    const inicioOp = getInicioOperacionMs(st) ?? llegada;
    const tiempoEnPlantaMin =
      llegada != null && salida != null && salida >= llegada
        ? Math.round((salida - llegada) / 60000)
        : null;

    if (tiempoEnPlantaMin != null) {
      if (g === "carga" || g === "carga_descarga") tiempoEnPlantaCargaMin += tiempoEnPlantaMin;
      else if (g === "descarga") tiempoEnPlantaDescargaMin += tiempoEnPlantaMin;
    }

    let esperaAntesOperacionMin = null;
    if (llegada != null && inicioOp != null && inicioOp > llegada) {
      esperaAntesOperacionMin = Math.round((inicioOp - llegada) / 60000);
      if (g === "carga" || g === "carga_descarga") esperaMuelleCargaMin += esperaAntesOperacionMin;
      else if (g === "descarga") esperaMuelleDescargaMin += esperaAntesOperacionMin;
    }

    let trasladoPrevioMin = null;
    if (opStartMs != null) {
      if (i === 0) {
        if (llegada != null && llegada >= opStartMs) {
          trasladoPrevioMin = Math.round((llegada - opStartMs) / 60000);
        }
      } else {
        const prev = stops[i - 1];
        const prevSalida = parseTs(prev.hora_salida_real);
        if (prevSalida != null && llegada != null && llegada >= prevSalida) {
          trasladoPrevioMin = Math.round((llegada - prevSalida) / 60000);
        }
      }
    } else if (i === 0 && fechaInicioMs != null && llegada != null && llegada >= fechaInicioMs) {
      trasladoPrevioMin = Math.round((llegada - fechaInicioMs) / 60000);
    } else if (i > 0) {
      const prev = stops[i - 1];
      const prevSalida = parseTs(prev.hora_salida_real);
      if (prevSalida != null && llegada != null && llegada >= prevSalida) {
        trasladoPrevioMin = Math.round((llegada - prevSalida) / 60000);
      }
    }

    perStop.push({
      stop: st,
      group: g,
      llegadaMs: llegada,
      salidaMs: salida,
      entradaMuelleMs: llegada,
      salidaMuelleMs: salida,
      tiempoEnPlantaMin,
      trasladoPrevioMin,
      inicioOperacionMs: inicioOp,
      esperaAntesOperacionMin,
    });
  }

  return {
    tiempoTotalViajeMin,
    /** Conducción entre paradas contada solo tras inicio operacional (PR-30). */
    tiempoConduccionMin: tiempoConduccionViajeMin,
    tiempoConduccionViajeMin,
    tiempoEnPlantaCargaMin,
    tiempoEnPlantaDescargaMin,
    esperaMuelleCargaMin,
    esperaMuelleDescargaMin,
    viajeOperacionalInicioMs: opStartMs,
    perStop,
  };
}

export function buildTripSummaryText({
  servicio,
  nombreConductor,
  stopsSorted,
  metrics,
  totalIncidencias,
  fmtDur,
}) {
  const line = (s) => s;
  const o = servicio?.origen || "—";
  const d = servicio?.destino || "—";
  const serviceNumber = getServiceNumber(servicio);
  const cliente = getServiceClient(servicio);
  const ref = serviceNumber ? ` · Servicio ${serviceNumber}` : "";
  const cond = nombreConductor(servicio?.conductor_id) || "—";
  const inicioOp =
    metrics.viajeOperacionalInicioMs != null
      ? new Date(metrics.viajeOperacionalInicioMs).toLocaleString("es-ES", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const blocks = [
    line(`Resumen del viaje (operacional)`),
    line(`Ruta: ${o} → ${d}${ref}`),
    line(`Cliente: ${cliente || "—"}`),
    line(`Conductor: ${cond}`),
    line(`Estado: ${servicio?.estado || "—"}`),
    line(`Inicio viaje operacional: ${inicioOp || "— (pulsa «Iniciar viaje operacional»)"}`),
    "",
    line(
      `Tiempo total viaje (aprox.): ${metrics.tiempoTotalViajeMin != null ? fmtDur(metrics.tiempoTotalViajeMin) : "—"}`
    ),
    line(`Conducción operacional (tras inicio viaje): ${fmtDur(metrics.tiempoConduccionMin)}`),
    line(`Tiempo en planta — cargas: ${fmtDur(metrics.tiempoEnPlantaCargaMin)}`),
    line(`Tiempo en planta — descargas: ${fmtDur(metrics.tiempoEnPlantaDescargaMin)}`),
    line(`Espera muelle — cargas: ${fmtDur(metrics.esperaMuelleCargaMin)}`),
    line(`Espera muelle — descargas: ${fmtDur(metrics.esperaMuelleDescargaMin)}`),
    line(`Incidencias registradas: ${totalIncidencias}`),
    "",
    line("Paradas:"),
    ...sortStopsByOrden(stopsSorted).map((st, idx) => {
      const g = OPERATIONAL_GROUP_LABEL[operationalGroupFromStopTipo(st.tipo)] || st.tipo;
      const nm = st.nombre || `Parada ${idx + 1}`;
      return line(`  ${st.orden ?? idx + 1}. [${g}] ${nm}`);
    }),
  ];
  return blocks.join("\n");
}
