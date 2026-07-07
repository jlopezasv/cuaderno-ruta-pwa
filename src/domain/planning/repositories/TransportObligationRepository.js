import { sbFetch } from "../../../data/supabaseClient.js";
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

/**
 * Persistencia Supabase del agregado Transport Obligation.
 * Tablas: transport_obligations, transport_obligation_expeditions.
 * No importar en tests unitarios (requiere env Supabase).
 */
export class TransportObligationRepository {
  /**
   * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
   */
  async save(obligation) {
    const payload = transportObligationToRow(obligation);
    const rows = await sbFetch("transport_obligations", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: payload,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return rowToTransportObligation(row);
  }

  /**
   * @param {string} id
   */
  async findById(id) {
    if (!id) return null;
    const rows = await sbFetch(`transport_obligations?id=eq.${encodeURIComponent(id)}&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? rowToTransportObligation(row) : null;
  }

  /**
   * @param {string} empresaId
   * @param {{ limit?: number, state?: string }} [options]
   */
  async findByEmpresaId(empresaId, options = {}) {
    if (!empresaId) return [];
    const limit = options.limit ?? 50;
    let path = `transport_obligations?empresa_id=eq.${encodeURIComponent(empresaId)}&order=updated_at.desc&limit=${limit}`;
    if (options.state) {
      path += `&state=eq.${encodeURIComponent(options.state)}`;
    }
    const rows = await sbFetch(path);
    return Array.isArray(rows) ? rows.map(rowToTransportObligation) : [];
  }

  /**
   * @param {string} expeditionId
   */
  async findLinkByExpeditionId(expeditionId) {
    if (!expeditionId) return null;
    const rows = await sbFetch(
      `transport_obligation_expeditions?servicio_id=eq.${encodeURIComponent(expeditionId)}&limit=1`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      expeditionId: String(row.servicio_id),
      transportObligationId: String(row.transport_obligation_id),
      linkedAt: String(row.linked_at),
      linkedBy: row.linked_by ? String(row.linked_by) : null,
    };
  }

  /**
   * @param {import('../types/transportObligation.types.js').ExpeditionObligationLink} link
   */
  async saveExpeditionLink(link) {
    const rows = await sbFetch("transport_obligation_expeditions", {
      method: "POST",
      prefer: "return=representation",
      body: {
        servicio_id: link.expeditionId,
        transport_obligation_id: link.transportObligationId,
        linked_at: link.linkedAt,
        linked_by: link.linkedBy,
      },
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      expeditionId: String(row.servicio_id),
      transportObligationId: String(row.transport_obligation_id),
      linkedAt: String(row.linked_at),
      linkedBy: row.linked_by ? String(row.linked_by) : null,
    };
  }

  /**
   * @param {string} obligationId
   * @param {import('../types/transportObligation.types.js').TransportObligationDomainEvent[]} domainEvents
   */
  async appendDomainEvents(obligationId, domainEvents) {
    if (!domainEvents?.length) return;
    const body = domainEvents.map((event) => ({
      transport_obligation_id: obligationId,
      event_type: event.type,
      occurred_at: event.occurredAt,
      payload_json: event.payload,
    }));
    await sbFetch("transport_obligation_events", {
      method: "POST",
      prefer: "return=minimal",
      body,
    });
  }
}

export const transportObligationRepository = new TransportObligationRepository();
