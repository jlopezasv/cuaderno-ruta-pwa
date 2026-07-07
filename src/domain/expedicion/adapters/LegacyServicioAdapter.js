import {
  getServicioOperacionMeta,
  stripServicioOperacionDisplay,
} from "../../service/serviceOperacionMeta.js";
import { getTipoTransporte } from "../../service/tipoTransporte.js";
import { DOMAIN_SCHEMA_META_KEY } from "../constants/DomainSchemaVersion.js";
import { EXPEDIENTE_ESTADO } from "../constants/EstadosExpedicion.js";

const AUTONOMO_EXPEDIENTE_MARK = "autonomo_expediente_v1";

/**
 * Adaptador lectura: fila `servicios` → objeto Expedición de dominio.
 * No modifica persistencia; preserva compatibilidad con código legacy.
 *
 * @param {Record<string, unknown>|null|undefined} servicio
 * @returns {import('../types/expedicion.types.js').Expedicion|null}
 */
export function toExpedicion(servicio) {
  if (!servicio || typeof servicio !== "object") return null;

  const meta = getServicioOperacionMeta(servicio);
  const estadoExpedicion = String(meta.expediente_estado || EXPEDIENTE_ESTADO.ACTIVO).toLowerCase();
  const schemaVersion = meta[DOMAIN_SCHEMA_META_KEY];

  return {
    id: String(servicio.id || ""),
    referenciaVisible: stripServicioOperacionDisplay(servicio.referencia),
    estadoServicio: String(servicio.estado || "").toLowerCase(),
    estadoExpedicion,
    tipoTransporte: getTipoTransporte(servicio),
    esAutonomoExpediente: meta[AUTONOMO_EXPEDIENTE_MARK] === true,
    domainSchemaVersion: typeof schemaVersion === "number" ? schemaVersion : null,
    startedAt:
      meta.expediente_started_at ||
      servicio.fecha_inicio ||
      servicio.created_at ||
      null,
    conductorId: servicio.conductor_id ? String(servicio.conductor_id) : null,
    empresaId: servicio.empresa_id ? String(servicio.empresa_id) : null,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} servicio
 * @returns {import('../types/expedicion.types.js').OperacionMuelle|null}
 */
export function toOperacionMuelleActiva(servicio) {
  if (!servicio) return null;
  const meta = getServicioOperacionMeta(servicio);
  const op = meta.operacion_muelle_activa;
  if (!op || typeof op !== "object") return null;
  if (String(op.estado || "").toLowerCase() !== "abierta") return null;

  return {
    id: String(op.id || ""),
    estado: String(op.estado || "abierta").toLowerCase(),
    entradaAt: op.entrada_at || null,
    muelleNombre: op.muelle_nombre || op.muelleNombre || null,
    tipoPrevisto: op.tipo_previsto || null,
    movimientos: Array.isArray(op.movimientos) ? op.movimientos : [],
  };
}
