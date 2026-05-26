import {
  formatEmpresaOperationalRestLine,
} from "../../domain/service/etaFormatter.js";
import {
  ETA_LABEL_ACTUAL,
  ETA_LABEL_INICIAL,
  OPERATIONAL_ETA_CALCULATING,
  formatStableEtaClockLabel,
  hasActiveRouteDestination,
  resolveEtaInicialDisplayLabel,
  resolveEtaVisual,
  resolvePersistedEtaActualLabel,
} from "../../domain/service/operationalEtaPresentation.js";
import {
  buildOperationalEtaVisual,
  classifyOperationalSituation,
} from "../../domain/service/operationalDeviationEngine.js";
import { getServiceClient } from "../../domain/service/serviceIdentity.js";
import { getServiceOperationalPresentation } from "../../domain/service/serviceOperationalPlaces.js";
import { ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { servicioSinConductorOperacional } from "../../domain/fleet/operationalPlaceholderConductor.js";

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
  if (st === "completado") return "Completado";
  if (st === "pendiente_asignacion") return "Pendiente de asignar conductor";
  if (st === "asignado") return "Pendiente de salida";
  if (st !== "en_curso") return null;

  const sit =
    situation ||
    classifyOperationalSituation({
      tacografoEstado,
      activeStop,
      latestLocation: null,
      nowMs: Number(nowMs) || Date.now(),
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

function arrivalLabelFromVisual(servicio, v) {
  if (v.tier === "operational") return resolvePersistedEtaActualLabel(v.operational);
  if (v.tier === "plan") return resolveEtaInicialDisplayLabel(servicio) || formatStableEtaClockLabel(v.etaIso);
  return null;
}

function buildEmpresaFlotaCardSummaryInner({
  servicio,
  stops = [],
  nowMs,
  latestLocation = null,
  tacografoEstado = null,
  activeStop = null,
  nextStop = null,
  useLiveEta = false,
}) {
  const hasAuxClock = Number(nowMs) > 0;
  const auxNow = hasAuxClock ? new Date(Number(nowMs)) : new Date();
  const pres = getServiceOperationalPresentation(servicio, stops);
  const cliente = getServiceClient(servicio);
  const clienteLine = cliente?.trim() ? cliente.trim() : null;
  const routeLabel = pres.routeLine;
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
    etaCaption: ETA_LABEL_INICIAL,
  };

  if (!servicio || servicio.estado === "anulado") {
    return { ...base, contextLine: "Servicio anulado" };
  }

  if (servicio.estado === "completado") {
    return { ...base, contextLine: "Completado" };
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
        nowMs: hasAuxClock ? Number(nowMs) : Date.now(),
      }),
      arrivalLabel: null,
      remainingLine: null,
      deviation: null,
      calculating: false,
    };
  }

  const routeDestActive = hasActiveRouteDestination(servicio);
  const v = resolveEtaVisual(servicio, auxNow);
  const inicialLabel = resolveEtaInicialDisplayLabel(servicio);

  if (!routeDestActive) {
    return {
      ...base,
      contextLine: resolveEmpresaFlotaContextLine({
        servicio,
        stops,
        activeStop,
        nextStop,
        tacografoEstado,
        situation: null,
        nowMs: hasAuxClock ? Number(nowMs) : Date.now(),
      }),
      arrivalLabel: inicialLabel,
      remainingLine: null,
      deviation: null,
      calculating: false,
      etaCaption: ETA_LABEL_INICIAL,
    };
  }

  if (servicio.estado === "asignado") {
    return {
      ...base,
      contextLine: "Pendiente de salida",
      arrivalLabel: resolveEtaInicialDisplayLabel(servicio),
      remainingLine: formatEmpresaFlotaRemainingLine(v.remainingKm, v.remainingMins),
    };
  }

  if (v.tier === "calculating") {
    return {
      ...base,
      contextLine: "En viaje",
      arrivalLabel: OPERATIONAL_ETA_CALCULATING,
      calculating: true,
      etaCaption: ETA_LABEL_ACTUAL,
    };
  }

  const stableArrival = arrivalLabelFromVisual(servicio, v);

  if (!useLiveEta || !hasAuxClock) {
    const remainingKm = v.tier === "operational" ? v.operational?.remaining_km : v.remainingKm;
    const remainingMins = v.tier === "operational" ? v.operational?.remaining_mins : v.remainingMins;
    return {
      ...base,
      contextLine: servicio.estado === "en_curso" ? "En curso" : estadoServicio || "—",
      arrivalLabel: stableArrival,
      remainingLine: formatEmpresaFlotaRemainingLine(remainingKm, remainingMins),
      etaCaption: v.tier === "operational" ? ETA_LABEL_ACTUAL : ETA_LABEL_INICIAL,
    };
  }

  let live = null;
  try {
    live = buildOperationalEtaVisual({
      servicio,
      now: auxNow,
      latestLocation,
      tacografoEstado,
      activeStop,
      resolvedVisual: v,
    });
  } catch {
    live = null;
  }

  const situation = live?.delay?.situation;
  const contextLine = resolveEmpresaFlotaContextLine({
    servicio,
    stops,
    activeStop,
    nextStop,
    tacografoEstado,
    situation,
    nowMs: Number(nowMs),
  });

  const remainingKm =
    v.tier === "operational" ? v.operational?.remaining_km : v.remainingKm ?? live?.remainingKmVisual;
  const remainingMins =
    v.tier === "operational" ? v.operational?.remaining_mins : v.remainingMins ?? live?.remainingMinsVisual;
  const remainingLine =
    formatEmpresaFlotaRemainingLine(remainingKm, remainingMins) ||
    formatEmpresaOperationalRestLine(remainingMins, remainingKm);

  return {
    ...base,
    contextLine,
    arrivalLabel: stableArrival,
    remainingLine,
    deviation: live?.delay ? formatEmpresaFlotaDeviationLine(live.delay) : null,
    calculating: false,
    etaCaption: v.tier === "operational" ? ETA_LABEL_ACTUAL : ETA_LABEL_INICIAL,
  };
}

/** Resumen compacto de tarjeta: solo ETA persistida/plan; sin motor live (no bloquea operativa). */
export function buildEmpresaFlotaCardSummary(args) {
  try {
    return buildEmpresaFlotaCardSummaryInner(args);
  } catch (err) {
    console.warn("[buildEmpresaFlotaCardSummary]", err);
    const servicio = args?.servicio;
    const stops = args?.stops || [];
    const pres = getServiceOperationalPresentation(servicio, stops);
    const cliente = getServiceClient(servicio);
    const completados = stops.filter((s) => s.estado === "completado").length;
    return {
      routeLabel: pres.routeLine,
      clienteLine: cliente?.trim() ? cliente.trim() : null,
      contextLine: servicio?.estado === "en_curso" ? "En curso" : null,
      estadoServicio: servicio?.estado ? ESTADO_LABEL[servicio.estado] || servicio.estado : null,
      progressLine: stops.length ? `Paradas · ${completados}/${stops.length}` : null,
      arrivalLabel: null,
      remainingLine: null,
      deviation: null,
      calculating: false,
      etaCaption: ETA_LABEL_INICIAL,
    };
  }
}
