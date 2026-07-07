import { getServicioOperacionMeta } from "../../service/serviceOperacionMeta.js";
import { TRANSPORT_OBLIGATION_ID_META_KEY } from "../constants/PlanningDomainSchemaVersion.js";

/**
 * Lee el vínculo opcional expedición → obligación desde meta legacy (`__SRV_OP__`).
 * No modifica persistencia. Campo ausente en servicios existentes → null.
 *
 * @param {Record<string, unknown>|null|undefined} servicio
 * @returns {string|null}
 */
export function getTransportObligationIdFromServicio(servicio) {
  if (!servicio) return null;
  const meta = getServicioOperacionMeta(servicio);
  const id = meta[TRANSPORT_OBLIGATION_ID_META_KEY];
  return id != null && String(id).trim() ? String(id).trim() : null;
}

/**
 * Enriquece proyección Expedición con id de obligación (lectura).
 *
 * @param {import('../../expedicion/types/expedicion.types.js').Expedicion|null} expedicion
 * @param {string|null} transportObligationId
 * @returns {import('../../expedicion/types/expedicion.types.js').Expedicion|null}
 */
export function enrichExpedicionWithTransportObligationId(expedicion, transportObligationId) {
  if (!expedicion) return null;
  return {
    ...expedicion,
    transportObligationId: transportObligationId ?? expedicion.transportObligationId ?? null,
  };
}
