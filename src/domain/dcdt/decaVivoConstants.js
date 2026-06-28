/** Tipos de movimiento DeCA vivo (trazabilidad carga/descarga). */

export const DECA_VIVO_MOVIMIENTO = {
  CARGA: "CARGA",
  DESCARGA: "DESCARGA",
  CARGA_RETORNO: "CARGA_RETORNO",
  DESCARGA_RETORNO: "DESCARGA_RETORNO",
  DEVOLUCION: "DEVOLUCION",
  RECOGIDA_ENVASES: "RECOGIDA_ENVASES",
  ENTREGA_ENVASES: "ENTREGA_ENVASES",
  AJUSTE_MANUAL: "AJUSTE_MANUAL",
  INCIDENCIA_MERCANCIA: "INCIDENCIA_MERCANCIA",
};

export const DECA_VIVO_MOVIMIENTO_LABELS = {
  CARGA: "Carga",
  DESCARGA: "Descarga",
  CARGA_RETORNO: "Carga retorno",
  DESCARGA_RETORNO: "Descarga retorno",
  DEVOLUCION: "Devolución",
  RECOGIDA_ENVASES: "Recogida envases",
  ENTREGA_ENVASES: "Entrega envases",
  AJUSTE_MANUAL: "Ajuste manual",
  INCIDENCIA_MERCANCIA: "Incidencia mercancía",
};

export const DECA_VIVO_ESTADO = {
  BORRADOR: "borrador",
  ACTUAL: "actual",
  CERRADO: "cerrado",
  ANULADO: "anulado",
};

/** Referencias normativas vigentes (DeCA electrónico). */
export const DECA_VIVO_LEGAL_REFS =
  "Orden FOM/2861/2012 · Orden TRM/282/2026 · Resolución BOE-A-2026-12784";

export const DECA_VIVO_UNIDADES = [
  "kg",
  "palets",
  "cajas",
  "bultos",
  "jaulas",
  "envases",
  "unidades",
];

/** Movimientos que incrementan stock a bordo. */
export const DECA_VIVO_SUMA_TIPOS = new Set([
  DECA_VIVO_MOVIMIENTO.CARGA,
  DECA_VIVO_MOVIMIENTO.CARGA_RETORNO,
  DECA_VIVO_MOVIMIENTO.RECOGIDA_ENVASES,
  DECA_VIVO_MOVIMIENTO.DEVOLUCION,
]);

/** Movimientos que decrementan stock a bordo. */
export const DECA_VIVO_RESTA_TIPOS = new Set([
  DECA_VIVO_MOVIMIENTO.DESCARGA,
  DECA_VIVO_MOVIMIENTO.DESCARGA_RETORNO,
  DECA_VIVO_MOVIMIENTO.ENTREGA_ENVASES,
]);
