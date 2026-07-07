/**
 * Persistencia en memoria del agregado Transport Obligation.
 * Uso: tests unitarios y desarrollo sin Supabase. No afecta runtime legacy.
 */
export class InMemoryTransportObligationRepository {
  constructor() {
    /** @type {Map<string, import('../types/transportObligation.types.js').TransportObligation>} */
    this.obligations = new Map();
    /** @type {Map<string, import('../types/transportObligation.types.js').ExpeditionObligationLink>} */
    this.expeditionLinks = new Map();
    /** @type {Map<string, import('../types/transportObligation.types.js').TransportObligationDomainEvent[]>} */
    this.events = new Map();
  }

  /**
   * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
   */
  async save(obligation) {
    this.obligations.set(obligation.id, { ...obligation });
    return obligation;
  }

  /**
   * @param {string} id
   * @returns {Promise<import('../types/transportObligation.types.js').TransportObligation|null>}
   */
  async findById(id) {
    const row = this.obligations.get(id);
    return row ? { ...row, expeditionIds: [...row.expeditionIds], lines: [...row.lines] } : null;
  }

  /**
   * @param {string} empresaId
   * @param {{ limit?: number, state?: string }} [options]
   */
  async findByEmpresaId(empresaId, options = {}) {
    const limit = options.limit ?? 50;
    const rows = [...this.obligations.values()]
      .filter((o) => o.empresaId === empresaId)
      .filter((o) => !options.state || o.state === options.state)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit)
      .map((o) => ({ ...o, expeditionIds: [...o.expeditionIds], lines: [...o.lines] }));
    return rows;
  }

  /**
   * @param {string} expeditionId
   * @returns {Promise<import('../types/transportObligation.types.js').ExpeditionObligationLink|null>}
   */
  async findLinkByExpeditionId(expeditionId) {
    const link = this.expeditionLinks.get(expeditionId);
    return link ? { ...link } : null;
  }

  /**
   * @param {import('../types/transportObligation.types.js').ExpeditionObligationLink} link
   */
  async saveExpeditionLink(link) {
    this.expeditionLinks.set(link.expeditionId, { ...link });
    return link;
  }

  /**
   * @param {string} obligationId
   * @param {import('../types/transportObligation.types.js').TransportObligationDomainEvent[]} domainEvents
   */
  async appendDomainEvents(obligationId, domainEvents) {
    const prev = this.events.get(obligationId) || [];
    this.events.set(obligationId, [...prev, ...domainEvents]);
  }

  /** Reinicia almacén (solo tests). */
  clear() {
    this.obligations.clear();
    this.expeditionLinks.clear();
    this.events.clear();
  }
}

/** Instancia aislada para tests. */
export const inMemoryTransportObligationRepository = new InMemoryTransportObligationRepository();
