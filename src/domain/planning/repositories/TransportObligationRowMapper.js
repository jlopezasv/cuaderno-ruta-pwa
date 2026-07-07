import { PLANNING_DOMAIN_SCHEMA_VERSION } from "../constants/PlanningDomainSchemaVersion.js";

/**
 * Mapea fila `transport_obligations` → agregado de dominio.
 * @param {Record<string, unknown>} row
 * @returns {import('../types/transportObligation.types.js').TransportObligation}
 */
export function rowToTransportObligation(row) {
  const external = row.external_reference;
  return {
    id: String(row.id),
    empresaId: row.empresa_id ? String(row.empresa_id) : null,
    state: String(row.state),
    externalReference:
      external && typeof external === "object" && !Array.isArray(external)
        ? {
            source: String(/** @type {Record<string, unknown>} */ (external).source || ""),
            externalId: String(/** @type {Record<string, unknown>} */ (external).external_id || ""),
            correlationId:
              /** @type {Record<string, unknown>} */ (external).correlation_id != null
                ? String(/** @type {Record<string, unknown>} */ (external).correlation_id)
                : null,
          }
        : null,
    expeditionIds: Array.isArray(row.expedition_ids) ? row.expedition_ids.map(String) : [],
    lines: Array.isArray(row.lines_json) ? row.lines_json : [],
    parentObligationId: row.parent_obligation_id ? String(row.parent_obligation_id) : null,
    childObligationIds: Array.isArray(row.child_obligation_ids)
      ? row.child_obligation_ids.map(String)
      : [],
    supersededByObligationId: row.superseded_by_obligation_id
      ? String(row.superseded_by_obligation_id)
      : null,
    mergedIntoObligationId: row.merged_into_obligation_id
      ? String(row.merged_into_obligation_id)
      : null,
    replanVersion: Number(row.replan_version) || 0,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    fulfilledAt: row.fulfilled_at ? String(row.fulfilled_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    planningDomainSchemaVersion:
      Number(row.planning_domain_schema_version) || PLANNING_DOMAIN_SCHEMA_VERSION,
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 */
export function transportObligationToRow(obligation) {
  return {
    id: obligation.id,
    empresa_id: obligation.empresaId,
    state: obligation.state,
    external_reference: obligation.externalReference
      ? {
          source: obligation.externalReference.source,
          external_id: obligation.externalReference.externalId,
          correlation_id: obligation.externalReference.correlationId,
        }
      : null,
    expedition_ids: obligation.expeditionIds,
    lines_json: obligation.lines,
    parent_obligation_id: obligation.parentObligationId,
    child_obligation_ids: obligation.childObligationIds,
    superseded_by_obligation_id: obligation.supersededByObligationId,
    merged_into_obligation_id: obligation.mergedIntoObligationId,
    replan_version: obligation.replanVersion,
    cancelled_at: obligation.cancelledAt,
    fulfilled_at: obligation.fulfilledAt,
    planning_domain_schema_version: obligation.planningDomainSchemaVersion,
    updated_at: obligation.updatedAt,
  };
}
