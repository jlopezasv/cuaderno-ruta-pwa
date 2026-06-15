import { hasDecaPdfGenerado } from "./decaPreStartCompliance.js";

export function isDcdtPdfStale(dcdt) {
  return dcdt?.datos?.pdf_stale === true;
}

/** Marca PDF desactualizado tras cambio de contenido (no regenera en Storage). */
export function withPdfStaleFlags(datos, at = new Date().toISOString()) {
  return {
    ...(datos || {}),
    pdf_stale: true,
    pdf_stale_at: at,
  };
}

export function withPdfStaleCleared(datos) {
  return {
    ...(datos || {}),
    pdf_stale: false,
    pdf_stale_at: null,
  };
}

export function shouldMarkPdfStaleOnDatosSave(dcdt, { skipPdfStale = false } = {}) {
  if (skipPdfStale || !dcdt) return false;
  return hasDecaPdfGenerado(dcdt);
}
