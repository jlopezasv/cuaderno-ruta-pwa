import QRCode from "qrcode";

/** Corrección M (≈15%) — suficiente para URL HTTPS en inspección. */
export const DECA_QR_ERROR_LEVEL = "M";

export const DECA_QR_MARGIN = 3;

/** PNG embebido en PDF (alta resolución para embedPng). */
export const DECA_QR_PDF_WIDTH = 400;

/** PNG suelto / modal (visualización). */
export const DECA_QR_DISPLAY_WIDTH = 280;

/**
 * Genera PNG del QR DeCA que codifica la URL canónica de descarga directa.
 * @param {string} downloadUrl — buildDecaDownloadUrl(deca_public_id)
 */
export async function generateDecaQrPngBytes(downloadUrl) {
  const url = String(downloadUrl || "").trim();
  if (!url) throw new Error("URL DeCA requerida para generar el QR");

  const buffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: DECA_QR_ERROR_LEVEL,
    margin: DECA_QR_MARGIN,
    width: DECA_QR_PDF_WIDTH,
    type: "png",
  });
  return new Uint8Array(buffer);
}

/** Data URL para modal / vista previa sin storage. */
export async function generateDecaQrDataUrl(downloadUrl, width = DECA_QR_DISPLAY_WIDTH) {
  const url = String(downloadUrl || "").trim();
  if (!url) return "";
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: DECA_QR_ERROR_LEVEL,
    margin: DECA_QR_MARGIN,
    width,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
