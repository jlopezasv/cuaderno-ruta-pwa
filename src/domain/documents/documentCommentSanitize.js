import { stripOperacionMetaDisplay } from "../service/stopOperacionMeta.js";
import { stripServicioOperacionDisplay } from "../service/serviceOperacionMeta.js";

const OP_LEAK_RE =
  /(?:__SRV_OP__|__CUADERNO_OP__|planned_route|operational_eta|operational_plan|delta_min|"coords"\s*:)/i;

function tryParseOperationalJson(s) {
  const t = String(s || "").trim();
  if (!t.startsWith("{") && !t.startsWith("__SRV_OP__")) return null;
  try {
    const raw = t.startsWith("__SRV_OP__") ? t.replace(/^__SRV_OP__\s*:?\s*/, "") : t;
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/**
 * Texto apto para UI/PDF de comentarios de documentos (no metadata operativa).
 */
export function sanitizeDocumentCommentText(value) {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (!s) return "";

  const fromSrv = stripServicioOperacionDisplay(s);
  if (fromSrv && fromSrv !== s && !OP_LEAK_RE.test(fromSrv)) return fromSrv;

  const fromStop = stripOperacionMetaDisplay(s);
  if (fromStop && fromStop !== s && !OP_LEAK_RE.test(fromStop)) return fromStop;

  if (OP_LEAK_RE.test(s) || tryParseOperationalJson(s)) return "";

  return s;
}

export function isOperationalMetaLeakText(value) {
  if (value == null || value === "") return false;
  if (typeof value === "object") return true;
  const s = String(value).trim();
  if (!s) return false;
  return OP_LEAK_RE.test(s) || !!tryParseOperationalJson(s);
}
