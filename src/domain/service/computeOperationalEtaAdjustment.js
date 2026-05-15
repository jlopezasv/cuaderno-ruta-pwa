import { computeOperationalDelay } from "./operationalDeviationEngine.js";
import {
  getOperationalEtaSnapshot,
  getOperationalPlanSnapshot,
  getOperationalTripStartedAt,
} from "./serviceOperacionMeta.js";

/**
 * Capa visual sobre `operational_eta` (no persiste, no routing).
 * Delega en `operationalDeviationEngine` (Fase 2 V1).
 *
 * @param {object} p
 * @param {object|null} p.servicio
 * @param {object|null} [p.latestLocation] — última fila GPS (`ts` / `updatedAt`, `velocidad` opcional en m/s o km/h)
 * @param {object|null} [p.tacografoEstado] — `{ isDriving: boolean, crType?: string, crDur?: number }`
 * @param {object|null} [p.activeStop] — parada corriente (`estado`, `tipo`, `hora_llegada_real`)
 * @param {object|null} [p.operationalEta] — snapshot; si null se usa `operational_eta` o se lee de `servicio`
 * @param {object|null} [p.operational_eta] — alias de `operationalEta`
 * @param {Date|number} p.now
 * @param {object|null} [p.progressMemory] — `{ kmStableMs?: number|null }` tiempo con `remaining_km` sin bajar de forma relevante
 * @returns {{ delayMins: number, reason: string|null, confidence: "high"|"medium"|"low", situation?: string }}
 */
export function computeOperationalEtaAdjustment({
  servicio,
  latestLocation = null,
  tacografoEstado = null,
  activeStop = null,
  operationalEta: operationalEtaIn = null,
  operational_eta = null,
  now,
  progressMemory = null,
}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) {
    return { delayMins: 0, reason: null, confidence: "high" };
  }

  const operationalEta =
    (operationalEtaIn && typeof operationalEtaIn === "object" && operationalEtaIn) ||
    (operational_eta && typeof operational_eta === "object" && operational_eta) ||
    (servicio ? getOperationalEtaSnapshot(servicio) : null);

  return computeOperationalDelay({
    servicio,
    operationalEta,
    operationalPlan: servicio ? getOperationalPlanSnapshot(servicio) : null,
    tripStartedAtIso: servicio ? getOperationalTripStartedAt(servicio) : null,
    latestLocation,
    tacografoEstado,
    activeStop,
    nowMs,
    progressMemory,
  });
}

/**
 * Presentación viva sin persistir (nombre histórico / API auxiliar).
 */
export function buildEtaEntryVisual(args) {
  const operational =
    args?.operationalEta ??
    args?.operational_eta ??
    (args?.servicio ? getOperationalEtaSnapshot(args.servicio) : null);
  const liveAdjustment = computeOperationalEtaAdjustment({ ...args, operationalEta: operational });
  return { operational, liveAdjustment };
}
