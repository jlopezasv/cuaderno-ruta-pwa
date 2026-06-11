/** Estados del ciclo de vida de datos operacionales (servidor). */
export const RETENTION_STATE = Object.freeze({
  ACTIVO: "ACTIVO",
  ARCHIVADO: "ARCHIVADO",
  BORRABLE: "BORRABLE",
});

/** Política de negocio — qué se puede hacer con cada clase de dato. */
export const RETENTION_TIER = Object.freeze({
  /** Conservar indefinidamente (metadatos legales, envíos, CMR/OCR). */
  RETENIDO: "RETENIDO",
  /** Pasar a frío / ocultar UI; no borrar aún. */
  ARCHIVABLE: "ARCHIVABLE",
  /** Candidato a borrado tras período en ARCHIVADO (solo si purge_enabled). */
  ELIMINABLE: "ELIMINABLE",
});

export const RETENTION_SCOPE = Object.freeze({
  GLOBAL: "global",
  EMPRESA: "empresa",
});

/** Servicios considerados «cerrados» para cómputo de antigüedad. */
export const SERVICIO_ESTADOS_CERRADOS = Object.freeze([
  "completado",
  "cerrado",
  "cancelado",
  "anulado",
]);
