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
import { isConductoresEmpresaEnhancedUiEnabled } from "../../config/productFeatures.js";

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

function resolveEstadoFooterLabel(servicio) {
  if (!servicio?.estado) return null;
  if (servicio.estado === "en_curso") return "En ruta";
  return ESTADO_LABEL[servicio.estado] || servicio.estado;
}

const ETA_DAY_SHORT = {
  Domingo: "Dom",
  Lunes: "Lun",
  Martes: "Mar",
  Miércoles: "Mié",
  Jueves: "Jue",
  Viernes: "Vie",
  Sábado: "Sáb",
};

function shortenEtaLabel(label) {
  if (label == null || label === "") return null;
  let s = String(label).trim();
  for (const [full, short] of Object.entries(ETA_DAY_SHORT)) {
    if (s.includes(full)) {
      s = s.replace(full, short);
      break;
    }
  }
  return s.replace(/\s*·\s*/g, " ").replace(/\s+/g, " ").trim();
}

function formatShortRemainingMins(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function buildCompactFooterLine(servicio, nowMs) {
  const eta = shortenEtaLabel(resolveEtaClockLabel(servicio, nowMs));
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

  const parts = [];
  if (eta) parts.push(`ETA ${eta}`);
  if (Number.isFinite(km) && km > 0) {
    const kmTxt =
      km >= 100 ? `${Math.round(km).toLocaleString("es-ES")} km` : `${Math.round(km * 10) / 10} km`;
    parts.push(kmTxt);
  }
  const timeTxt = formatShortRemainingMins(mins);
  if (timeTxt) parts.push(timeTxt);
  else if (servicio?.estado === "en_curso") parts.push("En ruta");

  return parts.length ? parts.join(" · ") : resolveEstadoFooterLabel(servicio) || "—";
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

  return {
    mode: "single",
    /** Reservado multiparada: array de {@link ConductorProgressStage} */
    stages: null,
    originLabel,
    destinationLabel,
    progressPct: resolveProgressPct(servicio, stops, nowMs),
    footerLine: buildCompactFooterLine(servicio, nowMs),
  };
}

export function isConductoresEmpresaDemoUi() {
  return isConductoresEmpresaEnhancedUiEnabled();
}

/**
 * ¿Conduce el conductor principal del servicio? (tacógrafo / jornada del principal, no colaboradores).
 * @param {object|null} servicio
 * @param {Array<{ user_id?: string, norma?: { isDriving?: boolean }, entries?: object[] }>} conductores
 * @param {(c: object, now?: Date) => { active?: { type?: string } }} journeyResolver
 */
export function resolvePrincipalConductorIsDriving(servicio, conductores, journeyResolver) {
  const principalUid = servicio?.conductor_id;
  if (!principalUid) return false;
  const principal = (conductores || []).find((c) => c.user_id === principalUid);
  if (!principal) return false;
  const norma = principal.norma;
  if (norma?.isDriving) return true;
  const journey = typeof journeyResolver === "function" ? journeyResolver(principal) : null;
  return journey?.active?.type === "inicio_conduccion";
}
