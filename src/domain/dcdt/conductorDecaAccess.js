/**
 * Acceso DeCA del conductor de flota: el documento de la empresa, sin exigir
 * validación de tráfico. PDF/QR en cuanto existan; los datos se pueden consultar siempre.
 */

export function resolveConductorDecaAccess({
  hasDcdt = false,
  isValidated = false,
  hasPdfStorage = false,
  downloadUrl = null,
} = {}) {
  const url = String(downloadUrl || "").trim();
  const hasPdf = !!hasPdfStorage || !!url;
  return {
    hasPdf,
    canViewDocument: !!hasDcdt,
    canDownloadPdf: hasPdf,
    canShowQr: !!url,
    quickVisual: !hasDcdt ? "none" : hasPdf || isValidated ? "validated" : "incomplete",
  };
}
