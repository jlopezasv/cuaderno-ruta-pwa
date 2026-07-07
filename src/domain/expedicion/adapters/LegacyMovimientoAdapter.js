/**
 * Adaptador lectura: fila DeCA movimiento → MovimientoMercancia.
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {import('../types/expedicion.types.js').MovimientoMercancia|null}
 */
export function toMovimientoMercancia(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: String(row.id || ""),
    servicioId: String(row.servicio_id || ""),
    tipoMovimiento: String(row.tipo_movimiento || ""),
    descripcionMercancia: String(row.descripcion_mercancia || ""),
    cantidad: row.cantidad != null ? Number(row.cantidad) : null,
    unidad: row.unidad ? String(row.unidad) : null,
    pesoKg: row.peso_kg != null ? Number(row.peso_kg) : null,
    fechaHora: row.fecha_hora ? String(row.fecha_hora) : null,
    paradaId: row.parada_id ? String(row.parada_id) : null,
  };
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @returns {import('../types/expedicion.types.js').MovimientoMercancia[]}
 */
export function toMovimientosMercancia(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(toMovimientoMercancia).filter(Boolean);
}
