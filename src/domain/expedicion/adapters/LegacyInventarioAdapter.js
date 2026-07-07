import { toMovimientosMercancia } from "./LegacyMovimientoAdapter.js";

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {import('../types/expedicion.types.js').LineaStock|null}
 */
export function toLineaStock(row) {
  if (!row || typeof row !== "object") return null;

  return {
    lineKey: String(row.line_key || ""),
    descripcionMercancia: String(row.descripcion_mercancia || ""),
    categoriaMercancia: row.categoria_mercancia ? String(row.categoria_mercancia) : null,
    cantidadActual: Number(row.cantidad_actual ?? 0),
    unidad: row.unidad ? String(row.unidad) : null,
    pesoKgActual: row.peso_kg_actual != null ? Number(row.peso_kg_actual) : null,
    destinoPrevisto: row.destino_previsto ? String(row.destino_previsto) : null,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} doc
 * @returns {import('../types/expedicion.types.js').CartaDePorteResumen|null}
 */
export function toCartaDePorteResumen(doc) {
  if (!doc || typeof doc !== "object") return null;

  return {
    id: String(doc.id || ""),
    estado: String(doc.estado || ""),
    version: Number(doc.version ?? 0),
    qrToken: doc.qr_token ? String(doc.qr_token) : null,
    fechaActualizacion: doc.fecha_actualizacion ? String(doc.fecha_actualizacion) : null,
  };
}

/**
 * @param {string} servicioId
 * @param {{ stock?: Array, documento?: object|null }} payload
 * @returns {import('../types/expedicion.types.js').InventarioActual}
 */
export function toInventarioActual(servicioId, payload = {}) {
  const lineas = Array.isArray(payload.stock)
    ? payload.stock.map(toLineaStock).filter(Boolean)
    : [];

  return {
    servicioId: String(servicioId || ""),
    lineas,
    cartaDePorte: toCartaDePorteResumen(payload.documento),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} payload
 * @returns {import('../types/expedicion.types.js').InventarioVivo|null}
 */
export function toInventarioVivo(payload) {
  if (!payload || typeof payload !== "object") return null;

  const servicioId = String(payload.servicio_id || "");
  const lineas = Array.isArray(payload.stock_actual)
    ? payload.stock_actual.map(toLineaStock).filter(Boolean)
    : [];

  return {
    servicioId,
    lineas,
    cartaDePorte: toCartaDePorteResumen(payload.documento),
    ultimosMovimientos: toMovimientosMercancia(payload.ultimos_movimientos),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {import('../types/expedicion.types.js').VersionDecaHistorial|null}
 */
export function toVersionDecaHistorial(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: String(row.id || ""),
    version: Number(row.version ?? 0),
    motivo: row.motivo ? String(row.motivo) : null,
    creadoEn: String(row.creado_en || ""),
  };
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @returns {import('../types/expedicion.types.js').VersionDecaHistorial[]}
 */
export function toVersionesDecaHistorial(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(toVersionDecaHistorial).filter(Boolean);
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} events
 * @returns {import('../types/expedicion.types.js').EventoTimeline[]}
 */
export function toEventosTimeline(events) {
  if (!Array.isArray(events)) return [];

  return events.map((event) => ({
    id: String(event.id || ""),
    tipo: String(event.type || ""),
    at: String(event.at || ""),
    etiqueta: String(event.label || ""),
    paradaId: event.stopId ? String(event.stopId) : null,
  }));
}

/**
 * Proyección inversa: dominio → forma legacy consumida por UI existente.
 * @param {import('../types/expedicion.types.js').LineaStock|null|undefined} linea
 */
export function lineaStockToLegacyRow(linea) {
  if (!linea) return null;
  return {
    line_key: linea.lineKey,
    descripcion_mercancia: linea.descripcionMercancia,
    categoria_mercancia: linea.categoriaMercancia,
    cantidad_actual: linea.cantidadActual,
    unidad: linea.unidad,
    peso_kg_actual: linea.pesoKgActual,
    destino_previsto: linea.destinoPrevisto,
  };
}

/**
 * @param {import('../types/expedicion.types.js').CartaDePorteResumen|null|undefined} carta
 */
export function cartaDePorteToLegacyDocumento(carta) {
  if (!carta) return null;
  return {
    id: carta.id,
    estado: carta.estado,
    version: carta.version,
    qr_token: carta.qrToken,
    fecha_actualizacion: carta.fechaActualizacion,
  };
}

/**
 * @param {import('../types/expedicion.types.js').InventarioActual|null|undefined} inventario
 * @returns {{ stock: Array<object>, documento: object|null }}
 */
export function toLegacyInventarioPayload(inventario) {
  if (!inventario) return { stock: [], documento: null };
  return {
    stock: (inventario.lineas || []).map(lineaStockToLegacyRow).filter(Boolean),
    documento: cartaDePorteToLegacyDocumento(inventario.cartaDePorte),
  };
}
