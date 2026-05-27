import { isServicioExpedienteCerrado } from "../../domain/service/expedienteCierre.js";

/**
 * Tab Servicio: expediente operacional lite tras cierre documental o estado cerrado.
 * No sustituye el panel de firma mientras estado === completado sin cerrar.
 */
export function canShowOperationalSummaryLite(servicio) {
  if (!servicio?.id) return false;
  const st = String(servicio.estado || "").toLowerCase();
  if (st === "cerrado") return true;
  return isServicioExpedienteCerrado(servicio);
}

/** Docs / histórico: también en completado (vista previa o post-muelles). */
export function canShowOperationalSummaryLiteInDocs(servicio) {
  if (!servicio?.id) return false;
  const st = String(servicio.estado || "").toLowerCase();
  if (st === "completado" || st === "cerrado") return true;
  return isServicioExpedienteCerrado(servicio);
}
