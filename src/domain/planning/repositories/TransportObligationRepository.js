import { sbFetch } from "../../../data/supabaseClient.js";
import { rowToTransportObligation, transportObligationToRow } from "./TransportObligationRowMapper.js";

export { rowToTransportObligation, transportObligationToRow } from "./TransportObligationRowMapper.js";

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
