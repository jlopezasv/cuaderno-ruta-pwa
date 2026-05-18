import {
  formatOperationalEtaLabel,
  formatEmpresaOperationalRestLine,
} from "../../domain/service/etaFormatter.js";
import {
  OPERATIONAL_ETA_CALCULATING,
  resolveEtaVisual,
} from "../../domain/service/operationalEtaPresentation.js";
import {
  buildOperationalEtaVisual,
  classifyOperationalSituation,
} from "../../domain/service/operationalDeviationEngine.js";
import {
  getServiceClient,
  resolveServiceRouteEndpoints,
} from "../../domain/service/serviceIdentity.js";
import { ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { servicioSinConductorOperacional } from "../../domain/fleet/operationalPlaceholderConductor.js";
import { entregaCompletadaEstadoLabel } from "../../domain/service/entregaCompletadaTime.js";

function isDescansoCr(crType) {
  const t = String(crType || "");
  return t === "inicio_descanso" || t === "inicio_descanso_frac" || t.includes("descanso");
}

function stopPlaceName(stop) {
  const nm = String(stop?.nombre || "").trim();
  return nm || null;
}

/** @returns {"carga"|"descarga"|null} */
function stopDockKind(stop) {
  if (!stop) return null;
  const tipo = String(stop.tipo || "").toLowerCase();
  if (/solo_descarga/.test(tipo) || (/\bdescarga\b/.test(tipo) && !/\bcarga\b/.test(tipo))) return "descarga";
  if (/\bcarga\b/.test(tipo) || /carga_descarga|muelle/.test(tipo)) return "carga";
  return null;
}

/**
 * Línea de contexto operativo (sin ambigüedad carga/descarga).
 * Ej: «En camino a carga · Murcia», «Llegando a descarga · París».
 */
export function resolveEmpresaFlotaContextLine({
  servicio,
  stops = [],
  activeStop = null,
  nextStop = null,
  tacografoEstado = null,
  situation = null,
  nowMs,
}) {
  const st = servicio?.estado;
  if (st === "anulado") return "Servicio anulado";
  if (st === "completado") return entregaCompletadaEstadoLabel(stops);
  if (st === "pendiente_asignacion") return "Pendiente de asignar conductor";
  if (st === "asignado") return "Pendiente de salida";
  if (st !== "en_curso") return null;

  const sit =
    situation ||
    classifyOperationalSituation({
      tacografoEstado,
      activeStop,
      latestLocation: null,
      nowMs: Number(nowMs),
    });

  if (sit === "rest_break" || isDescansoCr(tacografoEstado?.crType)) return "Descanso reglamentario";

  const focus = activeStop || nextStop;
  const place = stopPlaceName(focus);
  const kind = stopDockKind(focus);
  const arrived = focus && (focus.estado === "llegado" || !!focus.hora_llegada_real);

  if (sit === "dock_loading") return place ? `En carga · ${place}` : "En carga";
  if (sit === "dock_unloading") return place ? `Descargando · ${place}` : "Descargando";

  const tacKnown = tacografoEstado && typeof tacografoEstado.isDriving === "boolean";

  if (tacKnown && tacografoEstado.isDriving) {
    if (kind === "descarga" && place) return `En camino a descarga · ${place}`;
    if (kind === "carga" && place) return `En camino a carga · ${place}`;
    if (place) return `Conduciendo · hacia ${place}`;
    return "Conduciendo";
  }

  if (focus && kind) {
    if (arrived) {
      if (kind === "descarga") return place ? `Llegando a descarga · ${place}` : "Llegando a descarga";
      return place ? `Llegando a carga · ${place}` : "Llegando a carga";
    }
    if (kind === "descarga") return place ? `En camino a descarga · ${place}` : "En camino a descarga";
    return place ? `En camino a carga · ${place}` : "En camino a carga";
  }

  if (tacKnown && !tacografoEstado.isDriving) return "Parada operativa";
  return "Conduciendo";
}

/** Desviación para supervisión; null si va en horario. */
export function formatEmpresaFlotaDeviationLine(delay) {
  const d = Math.round(Number(delay?.delayMins) || 0);
  if (d <= 0) return null;
  const sit = delay?.situation;
  if (sit === "traffic_delay" || sit === "urban_delay") return { text: `+${d}m tráfico`, tone: "warn" };
  if (sit === "dock_loading") return { text: `+${d}m carga`, tone: "warn" };
  if (sit === "dock_unloading") return { text: `+${d}m descarga`, tone: "warn" };
  if (sit === "route_deviation") return { text: `+${d}m desvío de ruta`, tone: "warn" };
  if (sit === "unexplained_stop") return { text: `+${d}m retraso operativo`, tone: "danger" };
  return { text: `+${d}m retraso operativo`, tone: "warn" };
}

/** "1.183 km · 13h restantes" */
export function formatEmpresaFlotaRemainingLine(remainingKm, remainingMins) {
  const kmPart =
    Number.isFinite(remainingKm) && remainingKm > 0
      ? `${(remainingKm >= 100 ? Math.round(remainingKm) : Math.round(remainingKm * 10) / 10).toLocaleString("es-ES")} km`
      : null;
  let timePart = null;
  if (Number.isFinite(remainingMins) && remainingMins > 0) {
    const h = Math.floor(remainingMins / 60);
    const m = Math.round(remainingMins % 60);
    timePart = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}`.trim() : `${m}m`;
  }
  if (kmPart && timePart) return `${kmPart} · ${timePart} restantes`;
  if (kmPart) return `${kmPart} restantes`;
  if (timePart) return `${timePart} restantes`;
  return null;
}

export function buildEmpresaFlotaCardSummary({
  servicio,
  stops = [],
  nowMs,
  latestLocation = null,
  tacografoEstado = null,
  activeStop = null,
  nextStop = null,
  useLiveEta = true,
}) {
  const clockMs = Number(nowMs ?? Date.now());
  const now = new Date(clockMs);
  const { origen, destino } = resolveServiceRouteEndpoints(servicio, stops);
  const cliente = getServiceClient(servicio);
  const clienteLine = cliente?.trim() ? `Cliente · ${cliente.trim()}` : null;
  const routeLabel = `${String(origen).toUpperCase()} → ${String(destino).toUpperCase()}`;
  const completados = stops.filter((s) => s.estado === "completado").length;
  const progressLine = stops.length ? `Paradas · ${completados}/${stops.length}` : null;
  const estadoServicio = servicio?.estado ? ESTADO_LABEL[servicio.estado] || servicio.estado : null;

  const base = {
    routeLabel,
    clienteLine,
    contextLine: null,
    estadoServicio,
    progressLine,
    arrivalLabel: null,
    remainingLine: null,
    deviation: null,
    calculating: false,
  };

  if (!servicio || servicio.estado === "anulado") {
    return { ...base, contextLine: "Servicio anulado" };
  }

  if (servicio.estado === "completado") {
    return {
      ...base,
      contextLine: entregaCompletadaEstadoLabel(stops),
      arrivalLabel: null,
      remainingLine: null,
    };
  }

  if (servicioSinConductorOperacional(servicio)) {
    return {
      ...base,
      contextLine: resolveEmpresaFlotaContextLine({
        servicio,
        stops,
        activeStop: null,
        nextStop: null,
        tacografoEstado: null,
        situation: null,
        nowMs: clockMs,
      }),
      arrivalLabel: null,
      remainingLine: null,
      deviation: null,
      calculating: false,
    };
  }

  const v = resolveEtaVisual(servicio, now);

  if (servicio.estado === "asignado") {
    const planArrival =
      v.tier === "plan" && v.etaIso
        ? formatOperationalEtaLabel(v.etaIso, now) || v.etaLabel
        : v.etaLabel || null;
    return {
      ...base,
      contextLine: "Pendiente de salida",
      arrivalLabel: planArrival,
      remainingLine: formatEmpresaFlotaRemainingLine(v.remainingKm, v.remainingMins),
    };
  }

  if (v.tier === "calculating") {
    return {
      ...base,
      contextLine: "Calculando previsión",
      arrivalLabel: OPERATIONAL_ETA_CALCULATING,
      calculating: true,
    };
  }

  if (!useLiveEta) {
    const arrivalLabel =
      v.etaLabel ||
      (v.tier === "plan" && v.etaIso ? formatOperationalEtaLabel(v.etaIso, now) : null) ||
      null;
    return {
      ...base,
      contextLine: servicio.estado === "en_curso" ? "En curso" : estadoServicio || "—",
      arrivalLabel,
      remainingLine: formatEmpresaFlotaRemainingLine(v.remainingKm, v.remainingMins),
    };
  }

  const live = buildOperationalEtaVisual({
    servicio,
    now,
    latestLocation,
    tacografoEstado,
    activeStop,
    resolvedVisual: v,
  });

  const situation = live.delay?.situation;
  const contextLine = resolveEmpresaFlotaContextLine({
    servicio,
    stops,
    activeStop,
    nextStop,
    tacografoEstado,
    situation,
    nowMs: clockMs,
  });

  const arrivalLabel =
    live.operationalEtaLiveLabel ||
    live.operationalEtaLabel ||
    (v.tier === "plan" && v.etaIso ? formatOperationalEtaLabel(v.etaIso, now) : null) ||
    v.etaLabel ||
    null;

  const remainingKm = live.remainingKmVisual ?? v.remainingKm ?? v.operational?.remaining_km;
  const remainingMins = live.remainingMinsVisual ?? v.remainingMins ?? v.operational?.remaining_mins;
  const remainingLine =
    formatEmpresaFlotaRemainingLine(remainingKm, remainingMins) ||
    formatEmpresaOperationalRestLine(remainingMins, remainingKm);

  return {
    ...base,
    contextLine,
    arrivalLabel,
    remainingLine,
    deviation: formatEmpresaFlotaDeviationLine(live.delay),
    calculating: false,
  };
}
