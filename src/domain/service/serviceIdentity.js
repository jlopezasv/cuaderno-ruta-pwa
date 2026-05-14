import { getServicioOperacionMeta, stripServicioOperacionDisplay } from "./serviceOperacionMeta.js";

/** UUID v4 (no mostrar al conductor como “número de servicio”). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Referencia humana para UI; nunca devuelve UUID crudo. */
export function getServiceNumberForDisplay(servicio) {
  const fromRef = stripServicioOperacionDisplay(servicio?.referencia);
  const sn = servicio?.service_number;
  if (sn != null && String(sn).trim() && !isUuidLike(String(sn))) return String(sn).trim();
  if (fromRef != null && String(fromRef).trim() && !isUuidLike(String(fromRef))) return String(fromRef).trim();
  return null;
}

export function getServiceNumber(servicio) {
  return servicio?.service_number || stripServicioOperacionDisplay(servicio?.referencia) || servicio?.id || "SERVICIO";
}

export function getServiceClient(servicio) {
  const meta = getServicioOperacionMeta(servicio);
  return servicio?.cliente || servicio?.cliente_nombre || servicio?.empresa_cliente || meta?.cliente || "";
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

export function getFixedServiceRoute(servicio, fallbackOrigen = "Origen", fallbackDestino = "Destino") {
  const origen = fixedPlace(servicio?.origen, fallbackOrigen);
  const destino = fixedPlace(servicio?.destino, fallbackDestino);
  return `${origen} → ${destino}`;
}

export function buildServiceIdentityMeta({ cliente, referenciaCliente } = {}) {
  const meta = {};
  if (cliente?.trim()) meta.cliente = cliente.trim();
  if (referenciaCliente?.trim()) meta.referencia_cliente = referenciaCliente.trim();
  return meta;
}
