/** Captura universal: móvil (cámara trasera), tablet y escritorio (archivo/galería). */

export function isMobileCaptureDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && typeof window !== "undefined" && window.innerWidth < 900;
}

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator?.userAgent || "");
}

/**
 * Props para <input type="file"> — capture solo en móvil (evita bugs desktop).
 * @param {{ facing?: 'environment'|'user', accept?: string }} opts
 */
export function getCameraInputProps({ facing = "environment", accept = "image/*" } = {}) {
  const mobile = isMobileCaptureDevice();
  return {
    type: "file",
    accept,
    ...(mobile ? { capture: facing } : {}),
  };
}

export function getDocumentScanAccept() {
  return isIOS() ? "image/*" : "image/*,application/pdf";
}
