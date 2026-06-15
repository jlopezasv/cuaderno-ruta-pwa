import QRCode from "qrcode";

/** Corrección M (≈15%) — suficiente para URL HTTPS en inspección. */
export const DECA_QR_ERROR_LEVEL = "M";

export const DECA_QR_MARGIN = 3;

/** PNG embebido en PDF (alta resolución para embedPng). */
export const DECA_QR_PDF_WIDTH = 400;

/** PNG suelto / modal (visualización). */
export const DECA_QR_DISPLAY_WIDTH = 280;

function pngBytesFromDataUrl(dataUrl) {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) throw new Error("QR DeCA: data URL inválida");
  const base64 = dataUrl.slice(comma + 1);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Genera PNG del QR DeCA que codifica la URL canónica de descarga directa.
 * Usa toDataURL (navegador + Node); toBuffer no está disponible en el bundle browser de qrcode.
 * @param {string} downloadUrl — buildDecaDownloadUrl(deca_public_id)
 */
export async function generateDecaQrPngBytes(downloadUrl) {
  const url = String(downloadUrl || "").trim();
  if (!url) throw new Error("URL DeCA requerida para generar el QR");

  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: DECA_QR_ERROR_LEVEL,
    margin: DECA_QR_MARGIN,
    width: DECA_QR_PDF_WIDTH,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return pngBytesFromDataUrl(dataUrl);
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
