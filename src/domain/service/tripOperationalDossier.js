/**
 * Expediente operacional — agrupa paradas y calcula tiempos con datos ya cargados (sin Supabase extra).
 */

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
  return [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
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
  const startMs = parseTs(servicio?.fecha_inicio);

  let endMs = nowMs;
  if (servicio?.estado === "completado") {
    let maxMs = startMs ?? 0;
    for (const st of stops) {
      const ls = parseTs(st.hora_salida_real);
      const ll = parseTs(st.hora_llegada_real);
      if (ls != null && ls > maxMs) maxMs = ls;
      if (ll != null && ll > maxMs) maxMs = ll;
    }
    if (maxMs > (startMs ?? 0)) endMs = maxMs;
  }

  const tiempoTotalViajeMin =
    startMs != null ? Math.max(0, Math.round((endMs - startMs) / 60000)) : null;

  let tiempoConduccionMin = 0;
  let prevFinMs = startMs;
  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const llegada = parseTs(st.hora_llegada_real);
    if (prevFinMs != null && llegada != null && llegada >= prevFinMs) {
      tiempoConduccionMin += Math.round((llegada - prevFinMs) / 60000);
    }
    const salida = parseTs(st.hora_salida_real);
    prevFinMs = salida ?? llegada ?? prevFinMs;
  }

  let tiempoEnPlantaCargaMin = 0;
  let tiempoEnPlantaDescargaMin = 0;

  const perStop = [];

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const g = operationalGroupFromStopTipo(st.tipo);
    const llegada = parseTs(st.hora_llegada_real);
    const salida = parseTs(st.hora_salida_real);
    const tiempoEnPlantaMin =
      llegada != null && salida != null && salida >= llegada
        ? Math.round((salida - llegada) / 60000)
        : null;

    if (tiempoEnPlantaMin != null) {
      if (g === "carga" || g === "carga_descarga") tiempoEnPlantaCargaMin += tiempoEnPlantaMin;
      else if (g === "descarga") tiempoEnPlantaDescargaMin += tiempoEnPlantaMin;
    }

    let trasladoPrevioMin = null;
    if (i === 0 && startMs != null && llegada != null && llegada >= startMs) {
      trasladoPrevioMin = Math.round((llegada - startMs) / 60000);
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
      tiempoEnPlantaMin,
      trasladoPrevioMin,
      inicioOperacionMs: llegada,
    });
  }

  return {
    tiempoTotalViajeMin,
    tiempoConduccionMin,
    tiempoEnPlantaCargaMin,
    tiempoEnPlantaDescargaMin,
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
  const ref = servicio?.referencia ? ` · Ref ${servicio.referencia}` : "";
  const cond = nombreConductor(servicio?.conductor_id) || "—";
  const blocks = [
    line(`Ruta: ${o} → ${d}${ref}`),
    line(`Conductor: ${cond}`),
    line(`Estado: ${servicio?.estado || "—"}`),
    "",
    line(
      `Tiempo total viaje (aprox.): ${metrics.tiempoTotalViajeMin != null ? fmtDur(metrics.tiempoTotalViajeMin) : "—"}`
    ),
    line(`Tiempo conducción estimado (entre registros): ${fmtDur(metrics.tiempoConduccionMin)}`),
    line(`Tiempo en planta — cargas: ${fmtDur(metrics.tiempoEnPlantaCargaMin)}`),
    line(`Tiempo en planta — descargas: ${fmtDur(metrics.tiempoEnPlantaDescargaMin)}`),
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
