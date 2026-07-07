import { TRANSPORT_OBLIGATION_STATE } from "../../domain/planning/constants/EstadosTransportObligation.js";

export const OBLIGATION_STATE_LABELS = {
  [TRANSPORT_OBLIGATION_STATE.RECEIVED]: "Recibida",
  [TRANSPORT_OBLIGATION_STATE.PLANNED]: "Planificada",
  [TRANSPORT_OBLIGATION_STATE.IN_EXECUTION]: "En ejecución",
  [TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED]: "Parcial",
  [TRANSPORT_OBLIGATION_STATE.FULFILLED]: "Ejecutada",
  [TRANSPORT_OBLIGATION_STATE.CANCELLED]: "Cancelada",
  [TRANSPORT_OBLIGATION_STATE.SUPERSEDED]: "Sustituida",
};

/** Determina paso inicial del wizard según estado de obligación y expedición. */
export function resolveWizardStep(obligation, expeditionId) {
  if (!obligation) return "create";
  if (obligation.state === TRANSPORT_OBLIGATION_STATE.RECEIVED) return "edit";
  if (obligation.state === TRANSPORT_OBLIGATION_STATE.PLANNED && !expeditionId) return "generate";
  if (expeditionId) return "assign";
  if (
    obligation.state === TRANSPORT_OBLIGATION_STATE.PLANNED ||
    obligation.state === TRANSPORT_OBLIGATION_STATE.IN_EXECUTION
  ) {
    return "generate";
  }
  return "edit";
}

export function obligationRouteLabel(obligation) {
  const line = obligation?.lines?.[0];
  if (!line) return "Sin ruta definida";
  const o = line.originLocationRef || line.description || "Origen";
  const d = line.destinationLocationRef || "Destino";
  return `${o} → ${d}`;
}
