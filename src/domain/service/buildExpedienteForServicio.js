import { buildServiceExpediente } from "./serviceExpediente.js";
import { computeTripOperationalMetrics } from "./tripOperationalDossier.js";

/** Expediente de un servicio a partir de mapas stop_id (refs de flota). */
export function buildExpedienteForServicio({
  servicio,
  flotaStopsMap,
  flotaEvsMap,
  flotaExtraDocsMap = null,
  extraDocumentos = null,
  nombreConductor,
  fmtDur,
  entries = [],
}) {
  if (!servicio?.id) return null;
  const svStops = flotaStopsMap?.[servicio.id] || [];
  const evidenciasByStop = {};
  for (const st of svStops) {
    if (flotaEvsMap?.[st.id]) evidenciasByStop[st.id] = flotaEvsMap[st.id];
  }
  const extraRows =
    extraDocumentos ??
    flotaExtraDocsMap?.[servicio.id] ??
    [];
  const metrics = computeTripOperationalMetrics(servicio, svStops);
  return buildServiceExpediente({
    servicio,
    stops: svStops,
    evidenciasByStop,
    extraDocumentos: extraRows,
    metrics,
    nombreConductor,
    fmtDur,
    entries,
  });
}
