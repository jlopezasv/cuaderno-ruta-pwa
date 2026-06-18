import { sbFetch } from "../../data/supabaseClient.js";
import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";

/** parte_transporte_id de una parada (formulario en memoria o notas persistidas). */
export function cargadorIdFromStop(stop) {
  if (!stop) return null;
  const fromMeta = getStopOperacionMeta(stop.notas)?.parte_transporte_id;
  const raw = stop.parte_transporte_id || fromMeta || null;
  return raw ? String(raw) : null;
}

function isCargaStop(stop) {
  return String(stop?.tipo || "").toLowerCase() === "carga";
}

function stopSummary(stop, cargadorId = null) {
  return {
    id: stop.id,
    orden: stop.orden,
    tipo: stop.tipo,
    nombre: stop.nombre,
    direccion: stop.direccion,
    estado: stop.estado ?? "pendiente",
    completada_at: stop.completada_at ?? null,
    completada_por: stop.completada_por ?? null,
    cargador_id: cargadorId,
  };
}

/**
 * Agrupa paradas de carga por cargador_id (solo lectura, sin persistir DeCA).
 * @returns {{ servicio_id: string|null, group_count: number, groups: Array, ungrouped_carga_stops: Array }}
 */
export function groupCargaStopsByCargador(servicioId, stops = []) {
  const cargaStops = (Array.isArray(stops) ? stops : []).filter(isCargaStop);
  const byCargador = new Map();
  const ungrouped = [];

  for (const stop of cargaStops) {
    const cargadorId = cargadorIdFromStop(stop);
    if (!cargadorId) {
      ungrouped.push(stopSummary(stop, null));
      continue;
    }
    if (!byCargador.has(cargadorId)) byCargador.set(cargadorId, []);
    byCargador.get(cargadorId).push(stopSummary(stop, cargadorId));
  }

  const groups = [...byCargador.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cargador_id, groupStops]) => ({
      cargador_id,
      stop_count: groupStops.length,
      stops: groupStops.sort((a, b) => (a.orden || 0) - (b.orden || 0)),
    }));

  return {
    servicio_id: servicioId || null,
    group_count: groups.length,
    groups,
    ungrouped_carga_stops: ungrouped.sort((a, b) => (a.orden || 0) - (b.orden || 0)),
  };
}

/** Llama a la RPC demo `dcdt_cargador_groups_for_servicio`. */
export async function fetchDcdtCargadorGroupsForServicio(servicioId) {
  if (!servicioId) {
    return groupCargaStopsByCargador(null, []);
  }
  const r = await sbFetch("/rest/v1/rpc/dcdt_cargador_groups_for_servicio", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_servicio_id: servicioId }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(body || "No se pudo agrupar paradas por cargador");
  }
  const data = await r.json();
  return data && typeof data === "object" ? data : groupCargaStopsByCargador(servicioId, []);
}
