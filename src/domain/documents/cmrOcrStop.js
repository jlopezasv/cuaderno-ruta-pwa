/** Marca explícita en evidencias.datos tras OCR CMR exitoso. */
export const CMR_OCR_APPLIED_KEY = "cmr_ocr_applied";

const OCR_FIELD_KEYS = [
  "num_cmr",
  "fecha",
  "remitente",
  "destinatario",
  "transportista",
  "lugar_carga",
  "lugar_entrega",
  "mercancia",
  "peso_kg",
  "bultos",
  "matricula",
  "observaciones",
];

export function evidenciaHasCmrOcr(ev) {
  if (!ev || String(ev.tipo || "").toLowerCase() !== "cmr") return false;
  const d = ev.datos;
  if (!d || typeof d !== "object") return false;
  if (d[CMR_OCR_APPLIED_KEY] === true) return true;
  return OCR_FIELD_KEYS.some((k) => {
    const v = d[k];
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
}

export function stopHasCmrOcr(evidencias) {
  return (evidencias || []).some(evidenciaHasCmrOcr);
}

export function markCmrDatosWithOcr(datos, { ocrApplied = false } = {}) {
  const base = datos && typeof datos === "object" && !Array.isArray(datos) ? { ...datos } : {};
  if (ocrApplied) base[CMR_OCR_APPLIED_KEY] = true;
  return base;
}
