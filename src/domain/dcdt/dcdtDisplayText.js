import {
  isOperationalMetaLeakText,
  sanitizeDocumentCommentText,
} from "../documents/documentCommentSanitize.js";
import { stripServicioOperacionDisplay } from "../service/serviceOperacionMeta.js";

/** Texto apto para UI/PDF DCDT — nunca metadata operativa ni JSON interno. */
export function formatDcdtDisplayValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object") return "";

  const s = String(value).trim();
  if (!s) return "";
  if (isOperationalMetaLeakText(s)) return "";

  const cleaned = sanitizeDocumentCommentText(s);
  if (cleaned) return cleaned;

  const stripped = stripServicioOperacionDisplay(s);
  if (stripped && !isOperationalMetaLeakText(stripped)) return stripped;

  return "";
}

export function formatDcdtDisplayValueOrDash(value) {
  const t = formatDcdtDisplayValue(value);
  return t || "—";
}
