/**
 * Persistencia en memoria de Operational Session (tests y dominio puro).
 */
export class InMemoryOperationalSessionRepository {
  constructor() {
    /** @type {Map<string, import('../types/operationalSession.types.js').OperationalSession>} */
    this.sessions = new Map();
  }

  /**
   * @param {import('../types/operationalSession.types.js').OperationalSession} session
   */
  async save(session) {
    this.sessions.set(session.id, { ...session, movementRefs: [...session.movementRefs] });
    return session;
  }

  /**
   * @param {string} expeditionId
   */
  async findActiveByExpeditionId(expeditionId) {
    for (const session of this.sessions.values()) {
      if (session.expeditionId === expeditionId && session.state === "open") {
        return this.clone(session);
      }
    }
    return null;
  }

  /**
   * @param {string} expeditionId
   */
  async findHistoryByExpeditionId(expeditionId) {
    return [...this.sessions.values()]
      .filter((s) => s.expeditionId === expeditionId && s.state !== "open")
      .map((s) => this.clone(s));
  }

  /**
   * @param {string} expeditionId
   */
  async findAllByExpeditionId(expeditionId) {
    return [...this.sessions.values()]
      .filter((s) => s.expeditionId === expeditionId)
      .map((s) => this.clone(s));
  }

  /**
   * @param {string} expeditionId
   * @param {string} sessionId
   */
  async findById(expeditionId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.expeditionId !== expeditionId) return null;
    return this.clone(session);
  }

  /** @param {import('../types/operationalSession.types.js').OperationalSession} session */
  clone(session) {
    return {
      ...session,
      location: { ...session.location },
      actor: { ...session.actor },
      resources: { ...session.resources },
      movementRefs: session.movementRefs.map((ref) => ({ ...ref })),
    };
  }

  clear() {
    this.sessions.clear();
  }
}

export const inMemoryOperationalSessionRepository = new InMemoryOperationalSessionRepository();
