import { TRANSPORT_OBLIGATION_STATE } from "../../domain/planning/constants/EstadosTransportObligation.js";
import { OBLIGATION_STATE_LABELS } from "../empresa/transportObligationOfficeUi.js";

export const CENTRO_LOGISTICO_BUCKET = Object.freeze({
  PENDIENTES: "pendientes",
  PLANIFICADAS: "planificadas",
  EN_EJECUCION: "en_ejecucion",
  FINALIZADAS: "finalizadas",
});

export const CENTRO_LOGISTICO_BUCKET_LABELS = {
  [CENTRO_LOGISTICO_BUCKET.PENDIENTES]: "Pendientes",
  [CENTRO_LOGISTICO_BUCKET.PLANIFICADAS]: "Planificadas",
  [CENTRO_LOGISTICO_BUCKET.EN_EJECUCION]: "En ejecución",
  [CENTRO_LOGISTICO_BUCKET.FINALIZADAS]: "Finalizadas",
};

export const CENTRO_LOGISTICO_BUCKETS_ORDER = [
  CENTRO_LOGISTICO_BUCKET.PENDIENTES,
  CENTRO_LOGISTICO_BUCKET.PLANIFICADAS,
  CENTRO_LOGISTICO_BUCKET.EN_EJECUCION,
  CENTRO_LOGISTICO_BUCKET.FINALIZADAS,
];

/** @type {Record<string, string>} */
export const OBLIGATION_STATE_TO_CENTRO_BUCKET = {
  [TRANSPORT_OBLIGATION_STATE.RECEIVED]: CENTRO_LOGISTICO_BUCKET.PENDIENTES,
  [TRANSPORT_OBLIGATION_STATE.PLANNED]: CENTRO_LOGISTICO_BUCKET.PLANIFICADAS,
  [TRANSPORT_OBLIGATION_STATE.IN_EXECUTION]: CENTRO_LOGISTICO_BUCKET.EN_EJECUCION,
  [TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED]: CENTRO_LOGISTICO_BUCKET.EN_EJECUCION,
  [TRANSPORT_OBLIGATION_STATE.FULFILLED]: CENTRO_LOGISTICO_BUCKET.FINALIZADAS,
  [TRANSPORT_OBLIGATION_STATE.CANCELLED]: CENTRO_LOGISTICO_BUCKET.FINALIZADAS,
  [TRANSPORT_OBLIGATION_STATE.SUPERSEDED]: CENTRO_LOGISTICO_BUCKET.FINALIZADAS,
};

/**
 * @param {import('../../domain/planning/types/transportObligation.types.js').TransportObligation|null|undefined} obligation
 * @returns {string}
 */
export function centroLogisticoOperacionLabel(obligation) {
  const lines = obligation?.lines || [];
  if (!lines.length) return "Sin ruta definida";
  const origen = lines[0].originLocationRef || "Origen";
  const destinos = lines.map((l) => l.destinationLocationRef).filter(Boolean);
  if (!destinos.length) return `${origen} → Destino`;
  if (destinos.length === 1) return `${origen} → ${destinos[0]}`;
  return `${origen} → ${destinos[0]} (+${destinos.length - 1})`;
}

/**
 * @param {import('../../domain/planning/types/transportObligation.types.js').TransportObligation|null|undefined} obligation
 * @returns {string|null}
 */
export function centroLogisticoClienteLabel(obligation) {
  const line = obligation?.lines?.[0];
  if (!line) return null;
  const desc = String(line.description || "").trim();
  return desc && desc !== "Transporte" ? desc : null;
}

/**
 * @param {import('../../domain/planning/types/transportObligation.types.js').TransportObligation|null|undefined} obligation
 * @returns {string|null}
 */
export function centroLogisticoObservaciones(obligation) {
  const meta = obligation?.lines?.[0]?.metadata;
  const notes = meta?.observaciones ?? meta?.notes;
  return typeof notes === "string" && notes.trim() ? notes.trim() : null;
}

/**
 * @param {import('../../domain/planning/types/transportObligation.types.js').TransportObligation} obligation
 * @returns {string}
 */
export function obligationCentroLogisticoBucket(obligation) {
  return (
    OBLIGATION_STATE_TO_CENTRO_BUCKET[obligation?.state] || CENTRO_LOGISTICO_BUCKET.PENDIENTES
  );
}

/**
 * @param {import('../../domain/planning/types/transportObligation.types.js').TransportObligation[]} obligations
 * @param {string} bucket
 * @param {{ hideSuperseded?: boolean }} [options]
 */
export function filterObligationsByCentroBucket(obligations, bucket, options = {}) {
  const list = Array.isArray(obligations) ? obligations : [];
  return list.filter((ob) => {
    if (options.hideSuperseded !== false && ob.state === TRANSPORT_OBLIGATION_STATE.SUPERSEDED) {
      return false;
    }
    return obligationCentroLogisticoBucket(ob) === bucket;
  });
}

/**
 * @param {import('../../domain/planning/types/transportObligation.types.js').TransportObligation|null} obligation
 * @param {string|null} expeditionId
 * @param {{ servicioEstado?: string|null }} [options]
 * @returns {"datos"|"plan"|"recursos"|"generar"|"enviar"|"confirmacion"}
 */
export function resolveCentroLogisticoWizardStep(obligation, expeditionId, options = {}) {
  if (!obligation) return "datos";
  if (
    obligation.state === TRANSPORT_OBLIGATION_STATE.FULFILLED ||
    obligation.state === TRANSPORT_OBLIGATION_STATE.CANCELLED ||
    obligation.state === TRANSPORT_OBLIGATION_STATE.SUPERSEDED
  ) {
    return "confirmacion";
  }
  if (obligation.state === TRANSPORT_OBLIGATION_STATE.RECEIVED) return "datos";
  if (obligation.state === TRANSPORT_OBLIGATION_STATE.PLANNED && !expeditionId) return "recursos";
  if (expeditionId) {
    const estado = String(options.servicioEstado || "").toLowerCase();
    if (estado === "asignado" || estado === "en_curso" || estado === "completado") {
      return "confirmacion";
    }
    return "enviar";
  }
  if (
    obligation.state === TRANSPORT_OBLIGATION_STATE.IN_EXECUTION ||
    obligation.state === TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED
  ) {
    return expeditionId ? "enviar" : "generar";
  }
  return "plan";
}

export function obligationStateLabel(state) {
  return OBLIGATION_STATE_LABELS[state] || state;
}

/**
 * Construye líneas de obligación desde datos del asistente Centro Logístico.
 *
 * @param {{
 *   cliente?: string,
 *   origen?: string,
 *   destinos?: string[],
 *   observaciones?: string,
 *   existingLines?: import('../../domain/planning/types/transportObligation.types.js').TransportObligationLine[],
 * }} input
 */
export function buildCentroLogisticoObligationLines(input) {
  const cliente = String(input?.cliente || "").trim();
  const origen = String(input?.origen || "").trim() || null;
  const observaciones = String(input?.observaciones || "").trim();
  const destinos = (input?.destinos || []).map((d) => String(d || "").trim()).filter(Boolean);
  const description = cliente || "Transporte";
  const metadata = observaciones ? { observaciones, source: "centro_logistico" } : { source: "centro_logistico" };

  if (!destinos.length) {
    const existing = input?.existingLines?.[0];
    return [
      {
        lineId: existing?.lineId || `line-${Date.now()}`,
        description,
        quantity: existing?.quantity ?? null,
        unit: existing?.unit ?? "pal",
        originLocationRef: origen,
        destinationLocationRef: existing?.destinationLocationRef ?? null,
        metadata,
      },
    ];
  }

  return destinos.map((destino, index) => {
    const existing = input?.existingLines?.[index];
    return {
      lineId: existing?.lineId || `line-${Date.now()}-${index}`,
      description,
      quantity: existing?.quantity ?? null,
      unit: existing?.unit ?? "pal",
      originLocationRef: origen,
      destinationLocationRef: destino,
      metadata: index === 0 ? metadata : { source: "centro_logistico" },
    };
  });
}

/**
 * @param {string[]} destinos
 * @returns {string}
 */
export function destinosToRutaDestino(destinos) {
  const list = (destinos || []).map((d) => String(d || "").trim()).filter(Boolean);
  if (!list.length) return "Destino";
  if (list.length === 1) return list[0];
  return list.join(" · ");
}
