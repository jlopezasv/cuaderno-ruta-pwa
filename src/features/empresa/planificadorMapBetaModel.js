import { isLocalGeoCatalogEnabled } from "../../config/productFeatures.js";
import { servicioPendienteAsignacion } from "../../domain/fleet/servicioAssignment.js";
import { stopGeoToPlace } from "../../domain/geo/stopGeoModel.js";
import {
  deriveOperationalPlacesFromStops,
  displayLugarFromPlace,
  geocodeQueryFromPlace,
  sanitizeRouteEndpointFallback,
} from "../../domain/service/serviceOperationalPlaces.js";
import {
  getFixedServiceRoute,
  getServiceClient,
  resolveServiceRouteEndpoints,
} from "../../domain/service/serviceIdentity.js";
import { classifyConductorTowerState } from "./empresaDashboardTowerModel.js";
import { resolveConductorOperationalVisual } from "./conductorOperationalVisual.js";
import {
  formatConductorTelefonoDisplay,
  resolveConductorTelefonoMovil,
} from "./conductorTelefonoMovil.js";
import {
  formatDisambiguatedPlaceLabel,
  isFiniteCoordPair,
  isPlausibleEuropeMapCoord,
  maybeFixSwappedLatLon,
  planificadorMapGeoLog,
  resolvePlaceGeo,
} from "./planificadorMapGeo.js";

const TERMINAL_ESTADOS = new Set(["cerrado", "completado", "anulado", "cancelado"]);

function isCargaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  return /\bcarga\b/.test(t) || /carga_descarga|muelle/.test(t);
}

function isDescargaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  return /\bdescarga\b/.test(t) || /solo_descarga/.test(t);
}

function formatSalidaLabel(fechaInicio) {
  if (!fechaInicio) return "—";
  const d = new Date(fechaInicio);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pickCargaStop(stops) {
  const sorted = Array.isArray(stops)
    ? [...stops].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    : [];
  return sorted.find((s) => isCargaTipo(s.tipo)) || sorted[0] || null;
}

function pickDescargaStop(stops) {
  const sorted = Array.isArray(stops)
    ? [...stops].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    : [];
  return sorted.find((s) => isDescargaTipo(s.tipo)) || sorted[sorted.length - 1] || null;
}

function isMarkerReady(geo) {
  if (!geo?.coords) return false;
  if (geo.confidence === "stored") return true;
  if (geo.pendingValidation || geo.confidence === "low") return false;
  return isPlausibleEuropeMapCoord(geo.coords.lat, geo.coords.lon);
}

/**
 * Cargas pendientes sin conductor (listado + marcadores opcionales).
 */
export function buildPlanificadorPendingCargas({
  servicios = [],
  flotaStops = {},
  useLocalGeoFallback = isLocalGeoCatalogEnabled(),
}) {
  const rows = [];
  for (const sv of Array.isArray(servicios) ? servicios : []) {
    if (!sv?.id || TERMINAL_ESTADOS.has(String(sv.estado || "").toLowerCase())) continue;
    if (!servicioPendienteAsignacion(sv)) continue;
    const stops = flotaStops[sv.id] || [];
    const { origen, destino } = resolveServiceRouteEndpoints(sv, stops);
    const ruta = getFixedServiceRoute(sv, origen, destino, stops);
    const places = deriveOperationalPlacesFromStops(stops);
    const origenFallback =
      geocodeQueryFromPlace(stopGeoToPlace(places.carga)) ||
      sanitizeRouteEndpointFallback(origen, "origen") ||
      sanitizeRouteEndpointFallback(sv.origen, "origen");
    const destinoFallback =
      geocodeQueryFromPlace(stopGeoToPlace(places.descarga)) ||
      sanitizeRouteEndpointFallback(destino, "destino") ||
      sanitizeRouteEndpointFallback(sv.destino, "destino");
    const origenLugar = displayLugarFromPlace(places.carga) || "—";
    const destinoLugar = displayLugarFromPlace(places.descarga) || "—";
    const origenLabel = formatDisambiguatedPlaceLabel(origenLugar);
    const destinoLabel = formatDisambiguatedPlaceLabel(destinoLugar);
    const empresaOrigen = String(places.carga.empresa || "").trim();
    const cargaStop = pickCargaStop(stops);
    const descargaStop = pickDescargaStop(stops);

    const origenGeo = resolvePlaceGeo({
      role: "origen",
      servicio: sv,
      stop: cargaStop,
      place: places.carga,
      fallbackText: origenFallback,
      useLocalGeoFallback,
    });
    const destinoGeo = resolvePlaceGeo({
      role: "destino",
      servicio: sv,
      stop: descargaStop,
      place: places.descarga,
      fallbackText: destinoFallback,
      useLocalGeoFallback,
    });

    const hasCoords = isMarkerReady(origenGeo);
    const pendingValidation = Boolean(origenGeo.pendingValidation);
    const pendingGeocode = !hasCoords && !pendingValidation;

    rows.push({
      id: sv.id,
      servicio: sv,
      cliente: getServiceClient(sv) || "—",
      empresaOrigen,
      origenLabel,
      destinoLabel,
      origenGeocode: origenGeo.geocodeText || origenFallback,
      destinoGeocode: destinoGeo.geocodeText || destinoFallback,
      rutaLabel: ruta,
      salidaLabel: formatSalidaLabel(sv.fecha_inicio),
      coords: hasCoords ? origenGeo.coords : null,
      hasCoords,
      pendingGeocode,
      pendingValidation,
      locationStatus: hasCoords
        ? pendingValidation
          ? "pending_validation"
          : "ready"
        : pendingGeocode
          ? "geocoding"
          : "missing",
      geoTrace: origenGeo,
      origenGeoTrace: origenGeo,
      destinoGeoTrace: destinoGeo,
    });
  }
  rows.sort((a, b) => {
    const ta = Date.parse(a.servicio?.fecha_inicio || "") || 0;
    const tb = Date.parse(b.servicio?.fecha_inicio || "") || 0;
    return ta - tb;
  });
  return rows;
}

/**
 * Conductores para mapa beta (ubicación + estado operativo).
 */
export function buildPlanificadorDriverMarkers({
  conductores = [],
  flotaServicios = [],
  ubicacionByUid = {},
  incidenciasByServicioId = {},
  formatLugar = null,
  nowMs = Date.now(),
}) {
  const lista = (Array.isArray(conductores) ? conductores : []).filter(
    (c) => c?.user_id && !c.pendiente,
  );
  return lista.map((conductor) => {
    const uid = conductor.user_id;
    const ubic = ubicacionByUid[uid];
    const classified = classifyConductorTowerState({
      conductor,
      servicios: flotaServicios,
      ubicacion: ubic,
    });
    const status = resolveDriverMapStatus(classified, ubic);
    const rawLat = ubic?.lat;
    const rawLon = ubic?.lon;
    const fixed = maybeFixSwappedLatLon(rawLat, rawLon);
    const hasCoords =
      isFiniteCoordPair(fixed.lat, fixed.lon) &&
      !ubic?.missing &&
      isPlausibleEuropeMapCoord(fixed.lat, fixed.lon);

    if (isFiniteCoordPair(rawLat, rawLon)) {
      planificadorMapGeoLog("driver.coords", {
        uid,
        nombre: conductor.nombre,
        raw: { lat: rawLat, lon: rawLon },
        result: hasCoords ? { lat: fixed.lat, lon: fixed.lon, swapped: fixed.swapped } : null,
      });
    }

    const ubicLabel =
      typeof formatLugar === "function"
        ? formatLugar(ubic)
        : String(ubic?.label || "").trim() || "Sin ubicación registrada";

    return {
      uid,
      conductor,
      nombre: conductor.nombre || "Conductor",
      telefono: formatConductorTelefonoDisplay(resolveConductorTelefonoMovil(conductor)),
      matricula: String(conductor.matricula || "").trim(),
      ubicLabel,
      coords: hasCoords ? { lat: fixed.lat, lon: fixed.lon } : null,
      hasCoords,
      status,
      classified,
    };
  });
}

export function resolveDriverMapStatus(classified, ubic) {
  const visual = resolveConductorOperationalVisual(classified, ubic);
  return {
    key: visual.key,
    label: visual.label,
    color: visual.color,
    bg: visual.bg,
    border: visual.border,
    dot: visual.dot,
    mapColor: visual.mapColor,
  };
}
