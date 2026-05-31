import { getOperationalTripStartMs } from "../service/operationalTrip.js";
import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";

export function parseOperativoTs(v) {
  if (v == null || v === "") return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function sortStopsOperativos(stops) {
  return [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function stopShortLabel(stop) {
  const g = operationalGroupFromStopTipo(stop?.tipo);
  const name = String(stop?.nombre || stop?.direccion || "").trim();
  if (name) return name;
  if (g === "carga") return "Carga";
  if (g === "descarga") return "Descarga";
  if (g === "carga_descarga") return "Carga/descarga";
  return `Parada ${stop?.orden ?? ""}`.trim();
}

/**
 * @typedef {object} TramoOperativo
 * @property {string} id
 * @property {'servicio_inicio'|'traslado'|'en_planta'|'traslado_abierto'|'en_planta_abierto'} kind
 * @property {string} label
 * @property {number} fromMs
 * @property {number} toMs
 * @property {number} durationMs
 * @property {string|null} [stopId]
 * @property {boolean} [abierto]
 */

/**
 * Construye tramos entre hitos operativos (inicio servicio, entrada/salida muelle).
 * Recorta cada tramo a [windowStartMs, windowEndMs].
 */
export function buildTramosOperativos(servicio, stopsRaw, windowStartMs, windowEndMs, nowMs = Date.now()) {
  const windowStart = Number.isFinite(windowStartMs) ? windowStartMs : nowMs;
  const windowEnd = Math.min(
    Number.isFinite(windowEndMs) ? windowEndMs : nowMs,
    nowMs,
  );
  if (windowEnd <= windowStart) return [];

  const stops = sortStopsOperativos(stopsRaw);
  const tramos = [];

  const push = (partial) => {
    const fromMs = Math.max(partial.fromMs, windowStart);
    const toMs = Math.min(partial.toMs ?? nowMs, windowEnd, nowMs);
    if (toMs <= fromMs) return;
    tramos.push({
      id: partial.id,
      kind: partial.kind,
      label: partial.label,
      fromMs,
      toMs,
      durationMs: toMs - fromMs,
      stopId: partial.stopId ?? null,
      abierto: !!partial.abierto && toMs >= nowMs - 1000,
    });
  };

  const fechaInicioMs = parseOperativoTs(servicio?.fecha_inicio);
  const opStartMs = getOperationalTripStartMs(servicio, stops) ?? fechaInicioMs;

  if (fechaInicioMs != null && fechaInicioMs < windowEnd) {
    const firstLlegada = stops.map((s) => parseOperativoTs(s.hora_llegada_real)).find((t) => t != null);
    const endPre =
      firstLlegada != null && firstLlegada > fechaInicioMs ? firstLlegada : null;
    if (endPre == null && servicio?.estado === "en_curso") {
      push({
        id: "pre-primera-entrada",
        kind: "servicio_inicio",
        label: "Inicio servicio → 1.ª entrada muelle",
        fromMs: fechaInicioMs,
        toMs: nowMs,
        abierto: true,
      });
    } else if (endPre != null) {
      push({
        id: "pre-primera-entrada",
        kind: "servicio_inicio",
        label: "Inicio servicio → 1.ª entrada muelle",
        fromMs: fechaInicioMs,
        toMs: endPre,
      });
    }
  }

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const llegada = parseOperativoTs(st.hora_llegada_real);
    const salida = parseOperativoTs(st.hora_salida_real);
    const label = stopShortLabel(st);

    if (llegada != null) {
      const finPlanta = salida ?? nowMs;
      push({
        id: `planta-${st.id}`,
        kind: salida ? "en_planta" : "en_planta_abierto",
        label: `En planta · ${label}`,
        fromMs: llegada,
        toMs: finPlanta,
        stopId: st.id,
        abierto: !salida,
      });
    }

    if (salida != null) {
      const next = stops[i + 1];
      const nextLlegada = next ? parseOperativoTs(next.hora_llegada_real) : null;
      if (nextLlegada != null && nextLlegada >= salida) {
        push({
          id: `traslado-${st.id}-${next?.id || i + 1}`,
          kind: "traslado",
          label: `En ruta · ${label} → ${stopShortLabel(next)}`,
          fromMs: salida,
          toMs: nextLlegada,
          stopId: st.id,
        });
      } else {
        push({
          id: `traslado-abierto-${st.id}`,
          kind: "traslado_abierto",
          label: next
            ? `En ruta · hasta entrada ${stopShortLabel(next)}`
            : "En ruta · hasta próxima entrada muelle",
          fromMs: salida,
          toMs: nowMs,
          stopId: st.id,
          abierto: true,
        });
      }
    }
  }

  if (opStartMs != null && opStartMs !== fechaInicioMs) {
    const exists = tramos.some((t) => t.kind === "traslado" || t.kind === "traslado_abierto");
    if (!exists && fechaInicioMs == null) {
      push({
        id: "op-start",
        kind: "servicio_inicio",
        label: "Inicio operación → 1.ª parada",
        fromMs: opStartMs,
        toMs: nowMs,
        abierto: servicio?.estado === "en_curso",
      });
    }
  }

  return tramos.sort((a, b) => a.fromMs - b.fromMs);
}

/**
 * Tramo en ruta abierto tras la última salida de muelle sin entrada en la siguiente parada.
 */
export function getTramoEnRutaAbierto(servicio, stopsRaw, nowMs = Date.now()) {
  const stops = sortStopsOperativos(stopsRaw);
  for (let i = stops.length - 1; i >= 0; i--) {
    const salida = parseOperativoTs(stops[i].hora_salida_real);
    if (salida == null) continue;
    const next = stops[i + 1];
    const nextLlegada = next ? parseOperativoTs(next.hora_llegada_real) : null;
    if (nextLlegada != null) return null;
    return {
      fromMs: salida,
      destinoLabel: next ? stopShortLabel(next) : "próxima parada",
      stopOrigenId: stops[i].id,
      stopDestinoId: next?.id ?? null,
      elapsedMs: Math.max(0, nowMs - salida),
    };
  }
  return null;
}

export function sumTramosMs(tramos) {
  return (tramos || []).reduce((a, t) => a + (t.durationMs || 0), 0);
}
