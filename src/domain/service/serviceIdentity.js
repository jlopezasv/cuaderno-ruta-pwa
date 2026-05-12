import { getServicioOperacionMeta, stripServicioOperacionDisplay } from "./serviceOperacionMeta.js";

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
