import { fetchIncidenciasExpedientePayload } from "../../domain/incidencias/incidenciasApi.js";
import { fetchServicioDocumentosExtra } from "../../domain/service/serviceExtraDocuments.js";
import { fetchEvidenciasGroupedByStop } from "../../domain/service/serviceDocuments.js";
import { sbFetch } from "../../data/supabaseClient.js";
import { buildOperationalLiteModel } from "./buildOperationalLiteModel.js";

/**
 * Carga stops, evidencias, incidencias y docs extra para un servicio (misma RLS que conductor).
 */
export async function loadOperationalLiteData(servicio, { nombreConductor } = {}) {
  if (!servicio?.id) return null;

  const str = await sbFetch(
    `/rest/v1/stops?servicio_id=eq.${servicio.id}&order=orden.asc`,
  );
  const stops = str.ok ? (await str.json().catch(() => [])) : [];
  const stopList = Array.isArray(stops) ? stops : [];
  const stopIds = stopList.map((s) => s.id).filter(Boolean);

  const [evidenciasByStop, incidenciasExpediente, extraDocumentos] = await Promise.all([
    stopIds.length ? fetchEvidenciasGroupedByStop(stopIds, sbFetch) : {},
    fetchIncidenciasExpedientePayload(servicio.id),
    fetchServicioDocumentosExtra(servicio.id),
  ]);

  return buildOperationalLiteModel({
    servicio,
    stops: stopList,
    evidenciasByStop,
    extraDocumentos: Array.isArray(extraDocumentos) ? extraDocumentos : [],
    incidenciasExpediente,
    nombreConductor,
  });
}
