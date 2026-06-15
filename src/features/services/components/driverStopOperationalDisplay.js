import { getStopOperacionMeta } from "../../../domain/service/stopOperacionMeta.js";
import { getServicioOperacionMeta } from "../../../domain/service/serviceOperacionMeta.js";
import { formatDriverGeoTimelineLines } from "../../../domain/service/operationalGeo.js";
import { traceMuelleGeo } from "../../../data/muelleGeoTrace.js";
import { isDemoApp } from "../../../config/appEnvironment.js";

function stopClock(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function fmtDurationBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return `${h}h ${r}m`;
  return `${r} m`;
}

/**
 * Tiempos registrados en tarjeta de parada (solo presentación).
 * Primera carga: inicio servicio.
 * Resto: entrada, salida y tiempo en planta únicamente.
 */
export function buildDriverStopTimesRows({ stop, isFirstCarga, servicio }) {
  const entrada = stop?.hora_llegada_real;
  const salida = stop?.hora_salida_real;
  const inicioServicioReal =
    servicio?.estado === "en_curso" || servicio?.estado === "completado" || servicio?.estado === "cerrado"
      ? servicio?.fecha_inicio
      : null;
  const rows = [];

  if (isFirstCarga && inicioServicioReal) {
    rows.push({ kind: "clock", label: "Inicio servicio", value: stopClock(inicioServicioReal) });
    const svcMeta = getServicioOperacionMeta(servicio);
    for (const line of formatDriverGeoTimelineLines(svcMeta?.inicio_servicio_geo)) {
      rows.push({ kind: "geo", label: line.label, value: line.value });
    }
  }
  if (entrada) {
    rows.push({ kind: "clock", label: "Entrada muelle", value: stopClock(entrada) });
    const meta = getStopOperacionMeta(stop?.notas);
    const geoLines = formatDriverGeoTimelineLines(meta.entrada_geo);
    if (isDemoApp()) {
      traceMuelleGeo("entrada_muelle", "timeline_render", {
        stopId: stop?.id,
        entrada_geo: meta.entrada_geo ?? null,
        timelineLines: geoLines,
      });
    }
    for (const line of geoLines) {
      rows.push({ kind: "geo", label: line.label, value: line.value });
    }
  }
  if (isFirstCarga && !inicioServicioReal && !entrada && !salida) {
    rows.push({ kind: "pending", label: "Inicio servicio", value: "Pendiente de inicio" });
  }
  if (salida) {
    rows.push({ kind: "clock", label: "Salida muelle", value: stopClock(salida) });
    const meta = getStopOperacionMeta(stop?.notas);
    const geoLines = formatDriverGeoTimelineLines(meta.salida_geo);
    if (isDemoApp()) {
      traceMuelleGeo("salida_muelle", "timeline_render", {
        stopId: stop?.id,
        salida_geo: meta.salida_geo ?? null,
        timelineLines: geoLines,
      });
    }
    for (const line of geoLines) {
      rows.push({ kind: "geo", label: line.label, value: line.value });
    }
  }
  if (entrada && salida) {
    const enPlanta = fmtDurationBetween(entrada, salida);
    if (enPlanta) rows.push({ kind: "duration", label: "Tiempo en planta", value: enPlanta });
  }

  return rows;
}

export function primaryMuelleActionLabel(stop, phase) {
  const group = String(stop?.tipo || "").toLowerCase();
  if (phase === "entrada") return "Entrada a muelle";
  if (group === "descarga") return "Completar descarga";
  if (group === "carga") return "Completar carga";
  if (group.includes("carga") && group.includes("descarga")) return "Completar operación";
  return "Salida de muelle";
}

