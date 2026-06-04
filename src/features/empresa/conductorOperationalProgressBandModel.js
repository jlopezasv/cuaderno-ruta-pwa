import { ESTADO_LABEL } from "../../domain/fleet/serviceStatus.js";
import { computeOperationalProgress } from "../../domain/service/operationalDeviationEngine.js";
import {
  resolveEtaVisual,
  resolvePersistedEtaActualLabel,
  resolveEtaInicialDisplayLabel,
} from "../../domain/service/operationalEtaPresentation.js";
import {
  getOperationalEtaSnapshot,
  getOperationalPlanSnapshot,
  getOperationalTripStartedAt,
} from "../../domain/service/serviceOperacionMeta.js";
import { getServiceOperationalPlaces } from "../../domain/service/serviceOperationalPlaces.js";
import { resolveServiceRouteEndpoints } from "../../domain/service/serviceIdentity.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { formatEmpresaFlotaRemainingLine } from "./empresaFlotaServicioCardPresenter.js";

/**
 * Arquitectura multiparada (fase futura). No renderizar hasta `mode: "multistop"`.
 * @typedef {{ id: string, label: string, kind: "origin"|"waypoint"|"destination" }} ConductorProgressStage
 */

function formatEndpointLabel(empresa, ciudad, fallback) {
  const e = String(empresa || "").trim();
  const c = String(ciudad || "").trim();
  if (e && c) return `${e} (${c})`;
  if (e) return e;
  if (c) return c;
  return String(fallback || "").trim() || "—";
}

function resolveProgressPct(servicio, stops, nowMs) {
  if (!servicio) return 0;
  const st = servicio.estado;
  if (st === "completado" || st === "cerrado") return 100;
  if (st === "asignado" || st === "pendiente_asignacion") return 0;

  const v = resolveEtaVisual(servicio, new Date(nowMs));
  const opEta = v.tier === "operational" ? v.operational : getOperationalEtaSnapshot(servicio);
  const progress = computeOperationalProgress({
    operationalEta: opEta,
    operationalPlan: getOperationalPlanSnapshot(servicio),
    tripStartedAtIso: getOperationalTripStartedAt(servicio),
    nowMs,
  });

  if (progress.realProgressPct != null) {
    return Math.max(0, Math.min(100, progress.realProgressPct));
  }

  const list = Array.isArray(stops) ? stops : [];
  if (list.length) {
    const done = list.filter((s) => s.estado === "completado").length;
    return Math.round((100 * done) / list.length);
  }

  return st === "en_curso" ? 8 : 0;
}

function resolveEtaClockLabel(servicio, nowMs) {
  const v = resolveEtaVisual(servicio, new Date(nowMs));
  if (v.tier === "operational") {
    return resolvePersistedEtaActualLabel(v.operational);
  }
  return resolveEtaInicialDisplayLabel(servicio);
}

function resolveRemainingKmLine(servicio, nowMs) {
  const v = resolveEtaVisual(servicio, new Date(nowMs));
  const km =
    v.tier === "operational"
      ? v.operational?.remaining_km
      : v.tier === "plan"
        ? v.remainingKm
        : null;
  const mins =
    v.tier === "operational"
      ? v.operational?.remaining_mins
      : v.tier === "plan"
        ? v.remainingMins
        : null;
  return formatEmpresaFlotaRemainingLine(km, mins);
}

function resolveEstadoFooterLabel(servicio) {
  if (!servicio?.estado) return null;
  if (servicio.estado === "en_curso") return "En ruta";
  return ESTADO_LABEL[servicio.estado] || servicio.estado;
}

/**
 * Modelo de presentación para banda torre de control (solo lectura).
 * @param {{ servicio: object|null, stops?: object[], nowMs?: number }} p
 * @returns {{ mode: "idle" } | { mode: "single", originLabel: string, destinationLabel: string, progressPct: number, footerLine: string, stages: null }}
 */
export function buildConductorOperationalProgressBandModel({ servicio, stops = [], nowMs = Date.now() }) {
  if (!servicio) {
    return { mode: "idle", stages: null };
  }

  const places = getServiceOperationalPlaces(servicio, stops);
  const { origen, destino } = resolveServiceRouteEndpoints(servicio, stops);

  const originLabel = formatEndpointLabel(
    places.carga_empresa,
    places.carga_nombre,
    origen,
  );
  const destinationLabel = formatEndpointLabel(
    places.descarga_empresa,
    places.descarga_nombre,
    destino,
  );

  const eta = resolveEtaClockLabel(servicio, nowMs);
  const kmLine = resolveRemainingKmLine(servicio, nowMs);
  const estado = resolveEstadoFooterLabel(servicio);

  const footerParts = [];
  if (eta) footerParts.push(`ETA ${eta}`);
  if (kmLine) footerParts.push(kmLine);
  if (estado) footerParts.push(estado);

  return {
    mode: "single",
    /** Reservado multiparada: array de {@link ConductorProgressStage} */
    stages: null,
    originLabel,
    destinationLabel,
    progressPct: resolveProgressPct(servicio, stops, nowMs),
    footerLine: footerParts.join(" · ") || estado || "—",
  };
}

export function isConductoresEmpresaDemoUi() {
  return isDemoApp();
}
