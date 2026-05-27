import { ACCOUNT_TYPES } from "../../auth/accountModel.js";
import { buildOperationalLiteModel } from "./buildOperationalLiteModel.js";
import { loadOperationalLiteData } from "./loadOperationalLiteData.js";
import { downloadOperationalLitePdf } from "./generateOperationalLitePdf.js";
import { buildExpedienteForServicio } from "../../domain/service/buildExpedienteForServicio.js";
import { downloadServiceExpedientePdf } from "../../domain/service/serviceExpediente.js";

export const OPERATIONAL_DOCUMENT_KIND = Object.freeze({
  LITE: "operational_lite",
  ENTERPRISE: "enterprise_expediente",
  NONE: "none",
});

/** Selector único: sin ramas autonomo/empresa en componentes de informe. */
export function resolveOperationalDocumentKind(accountType) {
  const t = String(accountType || "").toLowerCase();
  if (t === ACCOUNT_TYPES.AUTONOMO_PRO) return OPERATIONAL_DOCUMENT_KIND.LITE;
  if (t === ACCOUNT_TYPES.EMPRESA) return OPERATIONAL_DOCUMENT_KIND.ENTERPRISE;
  return OPERATIONAL_DOCUMENT_KIND.NONE;
}

export function usesOperationalLiteDocument(accountType) {
  return resolveOperationalDocumentKind(accountType) === OPERATIONAL_DOCUMENT_KIND.LITE;
}

export async function buildOperationalDocumentForServicio({
  accountType,
  servicio,
  stops = [],
  evidenciasByStop = {},
  extraDocumentos = [],
  incidenciasExpediente = null,
  nombreConductor,
  fmtDur = (m) => `${m} min`,
  entries = [],
  flotaStopsMap,
  flotaEvsMap,
  flotaExtraDocsMap,
}) {
  const kind = resolveOperationalDocumentKind(accountType);
  if (kind === OPERATIONAL_DOCUMENT_KIND.LITE) {
    return buildOperationalLiteModel({
      servicio,
      stops,
      evidenciasByStop,
      extraDocumentos,
      incidenciasExpediente,
      nombreConductor,
    });
  }
  if (kind === OPERATIONAL_DOCUMENT_KIND.ENTERPRISE) {
    return buildExpedienteForServicio({
      servicio,
      flotaStopsMap,
      flotaEvsMap,
      flotaExtraDocsMap,
      extraDocumentos,
      incidenciasExpediente,
      nombreConductor,
      fmtDur,
      entries,
    });
  }
  return null;
}

export async function downloadOperationalDocument(document, accountType) {
  const kind = resolveOperationalDocumentKind(accountType);
  if (kind === OPERATIONAL_DOCUMENT_KIND.LITE) {
    await downloadOperationalLitePdf(document);
    return;
  }
  if (kind === OPERATIONAL_DOCUMENT_KIND.ENTERPRISE) {
    await downloadServiceExpedientePdf(document);
  }
}

export { loadOperationalLiteData };
