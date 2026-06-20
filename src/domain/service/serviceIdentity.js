import { isDemoApp } from "../../config/appEnvironment.js";
import { getOperationalPlanSnapshot, getServicioOperacionMeta, stripServicioOperacionDisplay } from "./serviceOperacionMeta.js";
import {
  formatOperationalRouteLine,
  getServiceOperationalPlaces,
  routeTextFromOperationalPlaces,
} from "./serviceOperationalPlaces.js";

/** UUID v4 (no mostrar al conductor como “número de servicio”). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AUTO_REF_PREFIX = "SERV";

/** Formato canónico demo: TRA-VIAJE26-0001 */
export const VIAJE_CODIGO_RE = /^[A-Z]{3}-VIAJE\d{2}-\d{4}$/;

/** DEMO flota: código asignado por trigger en BD (solo servicios con empresa_id). */
export function isViajeCodigoDemoFleet(servicio) {
  return isDemoApp() && !!servicio?.empresa_id;
}

function isLegacyServHashReference(value) {
  return /^SERV-\d{3}$/i.test(String(value || "").trim());
}

function isUuidLike(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Sufijo numérico corto y estable a partir del id (sin UUID visible). */
export function deriveShortServiceSuffix(servicioOrId) {
  const id =
    typeof servicioOrId === "string"
      ? servicioOrId
      : servicioOrId?.id != null
        ? String(servicioOrId.id)
        : "";
  if (!id) return "000";
  const hex = id.replace(/-/g, "");
  const n = Number.parseInt(hex.slice(0, 8), 16);
  const code = ((Number.isFinite(n) ? n : 0) % 999) + 1;
  return String(code).padStart(3, "0");
}

/** Referencia automática legible (SERV-401, RUTA-012…). */
export function buildAutoServiceReference(servicio, prefix = AUTO_REF_PREFIX) {
  const p = String(prefix || AUTO_REF_PREFIX).trim().toUpperCase() || AUTO_REF_PREFIX;
  return `${p}-${deriveShortServiceSuffix(servicio)}`;
}

function manualServiceReference(servicio) {
  const sn = servicio?.service_number;
  if (sn != null && String(sn).trim() && !isUuidLike(String(sn))) return String(sn).trim();
  const fromRef = stripServicioOperacionDisplay(servicio?.referencia);
  if (fromRef != null && String(fromRef).trim() && !isUuidLike(String(fromRef))) {
    const ref = String(fromRef).trim();
    if (isViajeCodigoDemoFleet(servicio) && !sn && isLegacyServHashReference(ref)) return null;
    return ref;
  }
  return null;
}

/** Referencia humana para UI; nunca devuelve UUID crudo. */
export function getServiceNumberForDisplay(servicio) {
  const manual = manualServiceReference(servicio);
  if (manual) return manual;
  if (isViajeCodigoDemoFleet(servicio)) {
    if (servicio?.id) return buildAutoServiceReference(servicio);
    return null;
  }
  if (servicio?.id) return buildAutoServiceReference(servicio);
  return null;
}

export function getServiceNumber(servicio) {
  const display = getServiceNumberForDisplay(servicio);
  if (display) return display;
  if (isViajeCodigoDemoFleet(servicio)) return null;
  return servicio?.id ? buildAutoServiceReference(servicio) : "SERV-000";
}

export function getServiceClient(servicio) {
  const places = getServiceOperationalPlaces(servicio);
  if (places.cliente_nombre) return places.cliente_nombre;
  const meta = getServicioOperacionMeta(servicio);
  return servicio?.cliente_nombre || servicio?.cliente || servicio?.empresa_cliente || meta?.cliente || "";
}

export function getServiceClientReference(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  return servicio?.referencia_cliente || servicio?.ref_cliente || meta?.referencia_cliente || "";
}

function fixedPlace(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (/^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(text)) return fallback;
  if (/^(ubicaci[oó]n actual|ubicaci[oó]n gps detectada|origen gps)$/i.test(text)) return fallback;
  return text;
}

/**
 * Origen/destino visibles para flota (no usar etiqueta genérica «Origen» si hay plan o paradas).
 * @param {object|null} servicio
 * @param {object[]|null} [stops] — paradas ordenadas opcionales (primera parada como fallback de origen)
 * @returns {{ origen: string, destino: string }}
 */
export function resolveServiceRouteEndpoints(servicio, stops = null) {
  const places = getServiceOperationalPlaces(servicio, stops);
  const fromPlaces = routeTextFromOperationalPlaces(places);
  if (fromPlaces.origen && fromPlaces.destino) {
    return {
      origen: fixedPlace(fromPlaces.origen, "Inicio servicio"),
      destino: fixedPlace(fromPlaces.destino, "Destino"),
    };
  }

  const plan = getOperationalPlanSnapshot(servicio);
  const fromPlanO = fixedPlace(plan?.planned_origin, null);
  const fromPlanD = fixedPlace(plan?.planned_destination, null);
  const destino = fixedPlace(servicio?.destino, null) || fromPlanD || "Destino";
  let origen = fromPlanO || fixedPlace(servicio?.origen, null);
  if (!origen) origen = "Inicio servicio";
  return { origen, destino };
}

/** Ruta visible (lugares operativos, no cliente). */
export function getFixedServiceRoute(servicio, fallbackOrigen = "Origen", fallbackDestino = "Destino", stops = null) {
  const places = getServiceOperationalPlaces(servicio, stops);
  const line = formatOperationalRouteLine(places);
  if (line !== "— → —" && line !== "— → Destino" && !line.startsWith("— →")) {
    return line;
  }
  const { origen, destino } = resolveServiceRouteEndpoints(servicio, stops);
  const o = origen === "Inicio servicio" ? fallbackOrigen : origen;
  const d = destino === "Destino" ? fallbackDestino : destino;
  return `${o} → ${d}`;
}

export function buildServiceIdentityMeta({
  cliente,
  referenciaCliente,
  lugaresOperativos = null,
} = {}) {
  const meta = {};
  if (cliente?.trim()) {
    meta.cliente = cliente.trim();
    meta.cliente_nombre = cliente.trim();
  }
  if (referenciaCliente?.trim()) meta.referencia_cliente = referenciaCliente.trim();
  if (lugaresOperativos && typeof lugaresOperativos === "object") {
    meta.lugares_operativos = lugaresOperativos;
  }
  return meta;
}
