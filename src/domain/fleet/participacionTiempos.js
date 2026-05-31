import {
  TACOGRAFO_DISPONIBILIDAD_PAIRS,
  TACOGRAFO_DRIVE_OPEN,
  TACOGRAFO_DRIVE_STOP_TYPES,
  TACOGRAFO_REST_PAIRS,
  TACOGRAFO_TRABAJO_PAIRS,
} from "../journey/tacografoActivityTypes.js";
import {
  buildTramosOperativos,
  sumTramosMs,
} from "./participacionTramosOperativos.js";

const DRIVE_STOP_SET = new Set(TACOGRAFO_DRIVE_STOP_TYPES);

function toMs(value) {
  if (value == null) return NaN;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function clipIntervalMs(startMs, endMs, windowStartMs, windowEndMs) {
  const s = Math.max(startMs, windowStartMs);
  const e = Math.min(endMs, windowEndMs);
  return e > s ? e - s : 0;
}

function normalizeEntries(entries) {
  return [...(entries || [])]
    .map((e) => ({
      type: String(e?.type || ""),
      ts: e?.ts ?? e?.created_at ?? null,
    }))
    .filter((e) => e.type && e.ts != null && Number.isFinite(toMs(e.ts)))
    .sort((a, b) => toMs(a.ts) - toMs(b.ts));
}

/**
 * Suma milisegundos de intervalos open→close recortados a [windowStart, windowEnd].
 * @param {Array<{type:string,ts:*}>} sorted
 * @param {string} openType
 * @param {string} closeType
 */
function sumOpenCloseMs(sorted, openType, closeType, windowStartMs, windowEndMs, nowMs) {
  let activeStart = null;
  let total = 0;
  for (const e of sorted) {
    const t = toMs(e.ts);
    if (t > windowEndMs) break;
    if (e.type === openType) {
      if (activeStart === null) activeStart = t;
    } else if (e.type === closeType && activeStart !== null) {
      total += clipIntervalMs(activeStart, t, windowStartMs, windowEndMs);
      activeStart = null;
    }
  }
  if (activeStart !== null) {
    total += clipIntervalMs(activeStart, nowMs, windowStartMs, windowEndMs);
  }
  return total;
}

function sumConduccionMs(sorted, windowStartMs, windowEndMs, nowMs) {
  let activeStart = null;
  let total = 0;
  for (const e of sorted) {
    const t = toMs(e.ts);
    if (t > windowEndMs) break;
    if (e.type === TACOGRAFO_DRIVE_OPEN) {
      if (activeStart === null) activeStart = t;
    } else if (activeStart !== null && DRIVE_STOP_SET.has(e.type)) {
      total += clipIntervalMs(activeStart, t, windowStartMs, windowEndMs);
      activeStart = null;
    }
  }
  if (activeStart !== null) {
    total += clipIntervalMs(activeStart, nowMs, windowStartMs, windowEndMs);
  }
  return total;
}

function sumPairsMs(sorted, pairs, windowStartMs, windowEndMs, nowMs) {
  let total = 0;
  for (const [openType, closeType] of pairs) {
    total += sumOpenCloseMs(sorted, openType, closeType, windowStartMs, windowEndMs, nowMs);
  }
  return total;
}

/**
 * Calcula tiempos tacógrafo dentro de una ventana (solo eventos del conductor indicado).
 * @param {Array<{type:string,ts:*}>} entries
 * @param {number} windowStartMs
 * @param {number} windowEndMs
 * @param {number} [nowMs]
 */
export function calcTiemposEnVentana(entries, windowStartMs, windowEndMs, nowMs = Date.now()) {
  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) {
    return {
      conduccionMs: 0,
      trabajoMs: 0,
      disponibilidadMs: 0,
      descansoMs: 0,
    };
  }
  const sorted = normalizeEntries(entries);
  const end = Math.min(windowEndMs, nowMs);
  return {
    conduccionMs: sumConduccionMs(sorted, windowStartMs, end, end),
    trabajoMs: sumPairsMs(sorted, TACOGRAFO_TRABAJO_PAIRS, windowStartMs, end, end),
    disponibilidadMs: sumPairsMs(
      sorted,
      TACOGRAFO_DISPONIBILIDAD_PAIRS,
      windowStartMs,
      end,
      end,
    ),
    descansoMs: sumPairsMs(sorted, TACOGRAFO_REST_PAIRS, windowStartMs, end, end),
  };
}

/**
 * Resuelve ventana [inicio, fin] de una participación (FASE 2B).
 * @param {object} row — fila servicio_asignaciones o sintética
 * @param {object} servicio
 * @param {number} nowMs
 */
export function resolveParticipacionWindowMs(row, servicio, nowMs = Date.now()) {
  const estado = String(row?.estado_participacion || "pendiente").toLowerCase();
  const servicioFin =
    servicio?.estado === "completado" || servicio?.estado === "cerrado"
      ? toMs(servicio?.updated_at || servicio?.fecha_fin)
      : NaN;

  let startMs = toMs(row?.fecha_inicio_participacion);
  if (!Number.isFinite(startMs)) startMs = toMs(row?.created_at);
  if (!Number.isFinite(startMs)) startMs = toMs(servicio?.fecha_inicio);
  if (!Number.isFinite(startMs)) startMs = toMs(servicio?.created_at);
  if (!Number.isFinite(startMs)) startMs = nowMs;

  let endMs = toMs(row?.fecha_fin_participacion);
  if (!Number.isFinite(endMs)) {
    if (estado === "finalizado") {
      endMs = Number.isFinite(servicioFin) ? servicioFin : nowMs;
    } else if (servicio?.estado === "en_curso" || servicio?.estado === "asignado") {
      endMs = nowMs;
    } else if (Number.isFinite(servicioFin)) {
      endMs = servicioFin;
    } else {
      endMs = nowMs;
    }
  }

  if (endMs < startMs) endMs = startMs;
  return { startMs, endMs, estado };
}

/**
 * @typedef {object} ParticipacionTiemposRow
 * @property {string} conductorId
 * @property {string} nombre
 * @property {string} estadoParticipacion
 * @property {number} conduccionMs
 * @property {number} trabajoMs
 * @property {number} disponibilidadMs
 * @property {number} descansoMs
 * @property {number} totalOperativoMs
 * @property {Array} tramos
 */

function enrichTramosConTacografo(tramos, entries, nowMs) {
  return (tramos || []).map((t) => ({
    ...t,
    tacografo: calcTiemposEnVentana(entries, t.fromMs, t.toMs, nowMs),
  }));
}

/**
 * @param {object} params
 * @param {Array<object>} params.participaciones
 * @param {Record<string, Array>} params.entriesByConductorId
 * @param {Record<string, string>} [params.nombresByConductorId]
 * @param {object} params.servicio
 * @param {Array} [params.stops]
 * @param {number} [params.nowMs]
 * @returns {ParticipacionTiemposRow[]}
 */
export function buildParticipacionTiemposList({
  participaciones,
  entriesByConductorId,
  nombresByConductorId = {},
  servicio,
  stops = [],
  nowMs = Date.now(),
}) {
  const rows = Array.isArray(participaciones) ? participaciones : [];
  const byConductor = new Map();

  for (const row of rows) {
    const conductorId = row?.conductor_id;
    if (!conductorId) continue;
    if (!byConductor.has(conductorId)) byConductor.set(conductorId, row);
  }

  if (byConductor.size === 0 && servicio?.conductor_id) {
    byConductor.set(servicio.conductor_id, {
      conductor_id: servicio.conductor_id,
      tipo_asignacion: "principal",
      estado_participacion: "activo",
      created_at: servicio.created_at,
    });
  }

  const out = [];
  for (const [conductorId, partRow] of byConductor) {
    const { startMs, endMs, estado } = resolveParticipacionWindowMs(partRow, servicio, nowMs);
    const entries = entriesByConductorId[conductorId] || [];
    const tiempos = calcTiemposEnVentana(entries, startMs, endMs, nowMs);
    const tramosRaw = buildTramosOperativos(servicio, stops, startMs, endMs, nowMs);
    const tramos = enrichTramosConTacografo(tramosRaw, entries, nowMs);
    out.push({
      conductorId,
      nombre: nombresByConductorId[conductorId] || conductorId.slice(0, 8) + "…",
      estadoParticipacion: estado,
      ...tiempos,
      totalOperativoMs: sumTramosMs(tramos),
      tramos,
    });
  }

  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
