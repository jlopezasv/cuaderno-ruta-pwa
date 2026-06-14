import { fetchIncidenciasExpedientePayload } from "../../domain/incidencias/incidenciasApi.js";
import { fetchServicioDocumentosExtra } from "../../domain/service/serviceExtraDocuments.js";
import { fetchEvidenciasGroupedByStop } from "../../domain/service/serviceDocuments.js";
import { sbFetch } from "../../data/supabaseClient.js";
import { buildOperationalLiteModel } from "./buildOperationalLiteModel.js";
import {
  fetchDcdtByServicio,
  isDcdtValidadoParaExpediente,
  markDcdtIncluidoExpediente,
  resolveDcdtDocument,
} from "../../domain/dcdt/dcdtModel.js";
import { fetchPartesTransporte } from "../../domain/dcdt/partesTransporteModel.js";

/**
 * Carga stops, evidencias, incidencias, docs extra y DCDT validado para expediente.
 */
export async function loadOperationalLiteData(servicio, { nombreConductor } = {}) {
  if (!servicio?.id) return null;

  const str = await sbFetch(
    `/rest/v1/stops?servicio_id=eq.${servicio.id}&order=orden.asc`,
  );
  const stops = str.ok ? (await str.json().catch(() => [])) : [];
  const stopList = Array.isArray(stops) ? stops : [];
  const stopIds = stopList.map((s) => s.id).filter(Boolean);

  const empresaPromise = servicio.empresa_id
    ? sbFetch(
        `/rest/v1/empresas?id=eq.${servicio.empresa_id}&select=nombre,cif,direccion&limit=1`,
      ).then((r) => (r.ok ? r.json() : []))
    : Promise.resolve([]);

  const [evidenciasByStop, incidenciasExpediente, extraDocumentos, empresaRows, dcdtRow] =
    await Promise.all([
      stopIds.length ? fetchEvidenciasGroupedByStop(stopIds, sbFetch) : {},
      fetchIncidenciasExpedientePayload(servicio.id),
      fetchServicioDocumentosExtra(servicio.id),
      empresaPromise,
      fetchDcdtByServicio(servicio.id),
    ]);

  const empresa = Array.isArray(empresaRows) ? empresaRows[0] : null;
  let dcdtBlock = null;
  let dcdtRecord = null;

  if (dcdtRow) {
    const partes = servicio.empresa_id ? await fetchPartesTransporte(servicio.empresa_id) : [];
    const masterById = {};
    for (const p of partes) masterById[p.id] = p;

    let conductorLite = null;
    if (servicio.conductor_id) {
      const cr = await sbFetch(
        `/rest/v1/conductor_empresa?user_id=eq.${servicio.conductor_id}&select=matricula,remolque,nombre&limit=1`,
      );
      if (cr.ok) {
        const crows = await cr.json().catch(() => []);
        conductorLite = Array.isArray(crows) ? crows[0] : null;
      }
    }

    let empresaFull = empresa;
    if (servicio.empresa_id) {
      const er = await sbFetch(
        `/rest/v1/empresas?id=eq.${servicio.empresa_id}&select=nombre,cif,direccion,cp,ciudad,domicilio_fiscal,owner_id&limit=1`,
      );
      if (er.ok) {
        const erows = await er.json().catch(() => []);
        empresaFull = Array.isArray(erows) ? erows[0] : empresa;
      }
    }

    const { doc, missing } = resolveDcdtDocument({
      servicio,
      stops: stopList,
      dcdt: dcdtRow,
      masterById,
      empresa: empresaFull,
      conductor: conductorLite,
    });

    if (isDcdtValidadoParaExpediente(dcdtRow, { missing })) {
      dcdtBlock = doc;
      dcdtRecord = dcdtRow;
    }
  }

  const model = buildOperationalLiteModel({
    servicio,
    stops: stopList,
    evidenciasByStop,
    extraDocumentos: Array.isArray(extraDocumentos) ? extraDocumentos : [],
    incidenciasExpediente,
    nombreConductor,
    dcdt: dcdtBlock,
  });

  if (dcdtRecord?.id && dcdtRecord.estado === "validado") {
    void markDcdtIncluidoExpediente(dcdtRecord.id).catch(() => {});
  }

  return model;
}
