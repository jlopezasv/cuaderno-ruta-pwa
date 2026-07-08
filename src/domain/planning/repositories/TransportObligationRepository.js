import { sbFetch } from "../../../data/supabaseClient.js";
import { rowToTransportObligation, transportObligationToRow } from "./TransportObligationRowMapper.js";

export { rowToTransportObligation, transportObligationToRow } from "./TransportObligationRowMapper.js";

/**
 * @param {Response} res
 * @param {string} fallbackMessage
 */
async function throwIfNotOk(res, fallbackMessage) {
  if (res.ok) return;
  const errText = await res.text().catch(() => "");
  throw new Error(errText || fallbackMessage);
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
    const res = await sbFetch("/rest/v1/transport_obligations", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify(payload),
    });

    await throwIfNotOk(res, "No se pudo guardar la obligación de transporte");

    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return rowToTransportObligation(row);
  }

  /**
   * @param {string} id
   */
  async findById(id) {
    if (!id) return null;
    const res = await sbFetch(
      `/rest/v1/transport_obligations?id=eq.${encodeURIComponent(id)}&limit=1`
    );

    await throwIfNotOk(res, "No se pudo obtener la obligación de transporte");

    const rows = await res.json().catch(() => []);
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
    let path = `/rest/v1/transport_obligations?empresa_id=eq.${encodeURIComponent(empresaId)}&order=updated_at.desc&limit=${limit}`;
    if (options.state) {
      path += `&state=eq.${encodeURIComponent(options.state)}`;
    }

    const res = await sbFetch(path);

    await throwIfNotOk(res, "No se pudieron listar las obligaciones de transporte");

    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows.map(rowToTransportObligation) : [];
  }

  /**
   * @param {string} expeditionId
   */
  async findLinkByExpeditionId(expeditionId) {
    if (!expeditionId) return null;
    const res = await sbFetch(
      `/rest/v1/transport_obligation_expeditions?servicio_id=eq.${encodeURIComponent(expeditionId)}&limit=1`
    );

    await throwIfNotOk(res, "No se pudo obtener el vínculo expedición-obligación");

    const rows = await res.json().catch(() => []);
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
    const res = await sbFetch("/rest/v1/transport_obligation_expeditions", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({
        servicio_id: link.expeditionId,
        transport_obligation_id: link.transportObligationId,
        linked_at: link.linkedAt,
        linked_by: link.linkedBy,
      }),
    });

    await throwIfNotOk(res, "No se pudo vincular la expedición a la obligación");

    const rows = await res.json().catch(() => []);
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

    const res = await sbFetch("/rest/v1/transport_obligation_events", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify(body),
    });

    await throwIfNotOk(res, "No se pudieron registrar los eventos de la obligación");
  }
}

export const transportObligationRepository = new TransportObligationRepository();
