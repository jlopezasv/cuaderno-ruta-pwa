import { DCDT_ESTADO } from "./dcdtConstants.js";

/** Genera token opaco para verificación pública DCDT (inspección). */
export function generateDcdtVerifyToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dcdt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isDcdtQrEligible(estado, { missing = [] } = {}) {
  if (missing.length > 0) return false;
  const e = String(estado || "").toLowerCase();
  return e === DCDT_ESTADO.VALIDADO || e === DCDT_ESTADO.EN_EXPEDIENTE;
}

export function getDcdtQrToken(dcdt) {
  return String(dcdt?.datos?.qr_verificacion_token || "").trim() || null;
}

/** URL pública de solo lectura (escaneo QR). */
export function buildDcdtVerifyUrl(token) {
  const t = encodeURIComponent(String(token || "").trim());
  if (!t) return "";
  if (typeof window !== "undefined") {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?dcdt-v=${t}`;
  }
  return `?dcdt-v=${t}`;
}

export function parseDcdtVerifyTokenFromLocation(loc = typeof window !== "undefined" ? window.location : null) {
  if (!loc) return null;
  const q = new URLSearchParams(loc.search).get("dcdt-v");
  if (q) return String(q).trim();
  const m = String(loc.hash || "").match(/^#?dcdt-v\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).trim() : null;
}
