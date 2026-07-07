export {
  OPERATIONAL_SESSION_STATE,
  OPERATIONAL_SESSION_STATES,
  isOperationalSessionStateValid,
  operationalSessionAcceptsMovements,
  OPERATIONAL_SESSION_MOVEMENT_ACCEPTING_STATES,
  LEGACY_MUELLE_STATE_TO_DOMAIN,
  mapLegacyMuelleStateToDomain,
} from "./constants/EstadosOperationalSession.js";

export {
  OPERATIONAL_SESSION_KIND,
  LEGACY_TIPO_PREVISTO_TO_KIND,
  mapLegacyTipoPrevistoToSessionKind,
} from "./constants/TiposOperationalSession.js";

export {
  OPERATIONAL_SESSION_EVENT,
  createOperationalSessionDomainEvent,
} from "./constants/EventosOperationalSession.js";

export {
  EXECUTION_DOMAIN_SCHEMA_VERSION,
  EXECUTION_DOMAIN_SCHEMA_META_KEY,
  LEGACY_OPERACION_MUELLE_ACTIVA_META_KEY,
  LEGACY_HISTORIAL_OPERACIONES_MUELLE_META_KEY,
} from "./constants/ExecutionDomainSchemaVersion.js";

export * from "./types/operationalSession.types.js";

export {
  generateOperationalSessionId,
  openOperationalSession,
  openOperationalSessionGuarded,
  registerMovementInOperationalSession,
  closeOperationalSession,
  cancelOperationalSession,
} from "./aggregate/OperationalSession.js";

export {
  InMemoryOperationalSessionRepository,
  inMemoryOperationalSessionRepository,
} from "./repositories/InMemoryOperationalSessionRepository.js";

export * from "./queries/index.js";
export * from "./commands/index.js";
