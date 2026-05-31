import { sbFetch, sbSelect } from "../../data/supabaseClient.js";
import { buildParticipacionTiemposList } from "./participacionTiempos.js";

const PARTICIPACION_SELECT_FULL =
  "conductor_id,tipo_asignacion,estado_participacion,fecha_inicio_participacion,fecha_fin_participacion,created_at";

/**
 * Participaciones con ventanas FASE 2B (sin alterar fetchParticipacionServicio de FASE 2A).
 */
export async function fetchParticipacionConVentanas(servicioId) {
  if (!servicioId) return [];
  const r = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=${PARTICIPACION_SELECT_FULL}`,
  );
  if (r.ok) {
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }
  const r2 = await sbFetch(
    `/rest/v1/servicio_asignaciones?servicio_id=eq.${servicioId}&select=conductor_id,tipo_asignacion,estado_participacion,created_at`,
  ).catch(() => null);
  if (r2?.ok) {
    const rows = await r2.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

async function fetchEntriesForConductor(conductorId, windowEndIso) {
  if (!conductorId) return [];
  const filter = windowEndIso
    ? `user_id=eq.${conductorId}&ts=lte."${windowEndIso}"&order=ts.asc&limit=5000`
    : `user_id=eq.${conductorId}&order=ts.asc&limit=5000`;
  const rows = await sbSelect("entries", filter).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function fetchNombresConductores(conductorIds) {
  const ids = [...new Set((conductorIds || []).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;
  const chunk = 40;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const rows = await sbSelect("profiles", `id=in.(${slice.join(",")})&select=id,nombre`).catch(() => []);
    for (const p of Array.isArray(rows) ? rows : []) {
      if (p?.id) map[p.id] = String(p.nombre || "").trim() || p.id;
    }
  }
  return map;
}

/**
 * Carga participaciones + entries y devuelve filas FASE 2B para UI dev.
 * @param {object} servicio
 * @param {object} [options]
 * @param {Array} [options.stops]
 * @param {number} [options.nowMs]
 */
export async function loadParticipacionTiemposPorServicio(servicio, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const stops = options.stops ?? [];
  if (!servicio?.id) return [];
  const participaciones = await fetchParticipacionConVentanas(servicio.id);
  const conductorIds = new Set(participaciones.map((r) => r?.conductor_id).filter(Boolean));
  if (conductorIds.size === 0 && servicio.conductor_id) {
    conductorIds.add(servicio.conductor_id);
  }

  const windowEndIso = new Date(nowMs).toISOString();
  const entriesByConductorId = {};
  await Promise.all(
    [...conductorIds].map(async (id) => {
      entriesByConductorId[id] = await fetchEntriesForConductor(id, windowEndIso);
    }),
  );

  const nombresByConductorId = await fetchNombresConductores([...conductorIds]);

  return buildParticipacionTiemposList({
    participaciones,
    entriesByConductorId,
    nombresByConductorId,
    servicio,
    stops,
    nowMs,
  });
}
