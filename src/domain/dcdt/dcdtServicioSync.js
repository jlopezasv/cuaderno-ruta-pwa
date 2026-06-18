/**
 * Fase 2 DEMO: varios DeCA por servicio (uno por cargador distinto en paradas de carga).
 *
 * Vínculo parada ↔ DeCA (criterio documentado):
 * 1. Paradas `carga` → DeCA de su `parte_transporte_id` (cargador).
 * 2. Paradas `descarga` → DeCA del cargador en `__CUADERNO_OP__.cargador_parte_id`
 *    (elegido por tráfico). Distinto de `parte_transporte_id` (destinatario).
 * 3. Si solo hay 1 cargador en el servicio, las descargas sin `cargador_parte_id`
 *    heredan ese cargador automáticamente.
 * 4. Con 2+ cargadores y descarga sin `cargador_parte_id` → ungrouped (sin DeCA).
 * 5. Persistencia: `dcdt_servicio_id` en notas + bindings en `dcdt_servicio.datos`.
 */
import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { getStopOperacionMeta, mergeStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { cargadorIdFromStop, groupCargaStopsByCargador } from "./dcdtCargadorGroups.js";
import {
  collectDistinctCargadorIdsFromStops,
  isCargaStopTipo,
  isDescargaStop,
  resolveDescargaCargadorParteId,
} from "./descargaCargadorLink.js";
import {
  createDcdtForServicioCargador,
  fetchAllDcdtByServicio,
  patchDcdtFechaInicioEfectivoIfNull,
  persistDcdtPartesFromStops,
  saveDcdtDatos,
  syncParteIdsFromStops,
} from "./dcdtModel.js";
import { mercanciaDatosFromCargaStops } from "./stopMercanciaMeta.js";

const UNASSIGNED_KEY = "__unassigned__";

function isCargaStop(stop) {
  return isCargaStopTipo(stop);
}

function sortStops(stops) {
  return [...(stops || [])].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

/**
 * Mapa cargador_id → paradas carga/descarga vinculadas explícitamente.
 * Clave UNASSIGNED_KEY: descargas sin cargador_parte_id con 2+ cargadores.
 */
export function buildStopsByCargadorSegment(stops = []) {
  const segments = new Map();
  const ungrouped = [];

  const push = (cargadorId, stop) => {
    if (!cargadorId) {
      ungrouped.push(stop);
      return;
    }
    const key = String(cargadorId);
    if (!segments.has(key)) segments.set(key, []);
    segments.get(key).push(stop);
  };

  for (const stop of sortStops(stops)) {
    if (isCargaStop(stop)) {
      push(cargadorIdFromStop(stop), stop);
    } else if (isDescargaStop(stop)) {
      push(resolveDescargaCargadorParteId(stop, stops), stop);
    }
  }

  if (ungrouped.length) {
    segments.set(UNASSIGNED_KEY, ungrouped);
  }

  return segments;
}

function dcdtCargadorId(row) {
  const id = row?.datos?.partes?.cargador_id;
  return id ? String(id) : null;
}

function findDcdtForCargador(existingRows, cargadorId, legacyPool) {
  if (cargadorId) {
    const hit = existingRows.find((r) => dcdtCargadorId(r) === cargadorId);
    if (hit) return hit;
  }
  if (legacyPool.length) {
    const legacy = legacyPool.shift();
    return legacy;
  }
  return null;
}

async function fetchPersistedStops(servicioId) {
  const r = await sbFetch(
    `/rest/v1/stops?servicio_id=eq.${servicioId}` +
      "&select=id,orden,tipo,nombre,direccion,notas,estado,hora_llegada_real,hora_salida_real" +
      "&order=orden.asc",
  );
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function persistStopDcdtLink(stop, dcdtId) {
  if (!stop?.id || !dcdtId) return;
  const prevId = getStopOperacionMeta(stop.notas)?.dcdt_servicio_id;
  if (prevId && String(prevId) === String(dcdtId)) return;
  const notas = mergeStopOperacionMeta(stop.notas, { dcdt_servicio_id: dcdtId });
  const res = await sbFetch(`/rest/v1/stops?id=eq.${stop.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ notas }),
  });
  if (!res.ok && isDemoApp()) {
    console.warn("[DCDT sync] no se pudo vincular parada", stop.id, await res.text().catch(() => ""));
  }
}

function resolveSyncTargets(stops) {
  const cargaGrouping = groupCargaStopsByCargador(null, stops);
  const segments = buildStopsByCargadorSegment(stops);

  if (!cargaGrouping.group_count) {
    const allLinked = sortStops(stops).filter(
      (s) => isCargaStop(s) || isDescargaStop(s),
    );
    if (!allLinked.length) allLinked.push(...sortStops(stops));
    return [{ cargadorId: null, stops: allLinked.length ? allLinked : sortStops(stops) }];
  }

  const targets = [];
  for (const group of cargaGrouping.groups) {
    const segStops = segments.get(group.cargador_id) || [];
    const fallbackCarga = sortStops(stops).filter(
      (s) => isCargaStop(s) && cargadorIdFromStop(s) === group.cargador_id,
    );
    targets.push({
      cargadorId: group.cargador_id,
      stops: segStops.length ? segStops : fallbackCarga,
    });
  }

  return targets;
}

/**
 * Tras persistir paradas: crea/actualiza DeCA por cargador y vincula paradas.
 * Idempotente: no duplica filas si ya existe servicio_id + cargador_id.
 */
export async function syncDcdtServiciosAfterStopsPersisted({
  servicioId,
  empresaId,
  servicio = null,
  stops = null,
}) {
  if (!servicioId || !empresaId) return { synced: 0, dcdtIds: [], ungrouped: 0 };

  const stopRows = Array.isArray(stops) && stops.length ? sortStops(stops) : await fetchPersistedStops(servicioId);
  if (!stopRows.length) return { synced: 0, dcdtIds: [], ungrouped: 0 };

  const segments = buildStopsByCargadorSegment(stopRows);
  const ungroupedCount = (segments.get(UNASSIGNED_KEY) || []).length;

  const targets = resolveSyncTargets(stopRows);
  let existing = await fetchAllDcdtByServicio(servicioId);
  const legacyPool = existing.filter((r) => !dcdtCargadorId(r));
  const touchedIds = [];

  for (const target of targets) {
    let row = findDcdtForCargador(existing, target.cargadorId, legacyPool);
    if (!row) {
      row = await createDcdtForServicioCargador({
        servicioId,
        empresaId,
        cargadorId: target.cargadorId,
        stops: target.stops,
      });
      existing = [...existing, row];
    } else {
      const syncedDatos = syncParteIdsFromStops(row.datos, target.stops, {
        cargadorId: target.cargadorId,
      });
      syncedDatos.mercancia = mercanciaDatosFromCargaStops(target.stops, target.cargadorId);
      syncedDatos.stops = syncedDatos.stops || [];
      row = await saveDcdtDatos(row.id, syncedDatos, row.estado, { skipPdfStale: true });
    }

    touchedIds.push(row.id);

    for (const stop of target.stops) {
      await persistStopDcdtLink(stop, row.id);
    }

    await persistDcdtPartesFromStops({
      dcdt: row,
      servicio: servicio || { id: servicioId, empresa_id: empresaId },
      stops: target.stops,
      flotaEvs: {},
      empresa: null,
      conductor: null,
      masterById: {},
    }).catch((e) => {
      if (isDemoApp()) console.warn("[DCDT sync] persistDcdtPartesFromStops", e?.message || e);
    });
  }

  if (isDemoApp()) {
    console.log("[DCDT sync] after stops", {
      servicio_id: servicioId,
      group_count: targets.length,
      dcdt_ids: touchedIds,
      cargadores: targets.map((t) => t.cargadorId),
      ungrouped_descargas: ungroupedCount,
      cargadores_distintos: collectDistinctCargadorIdsFromStops(stopRows).length,
    });
  }

  return { synced: touchedIds.length, dcdtIds: touchedIds, ungrouped: ungroupedCount };
}

function stopsForDcdt(allStops, dcdtId) {
  return sortStops(allStops).filter((s) => {
    const linked = getStopOperacionMeta(s.notas)?.dcdt_servicio_id;
    return linked && String(linked) === String(dcdtId);
  });
}

function isCargaCompletada(stop) {
  return isCargaStop(stop) && (stop.estado === "completado" || !!stop.hora_salida_real);
}

/**
 * Fija fecha_inicio_efectivo al completar la primera carga del DeCA (inmutable).
 * Se invoca al pasar a `llegado` o `completado`; solo actúa en `completado`.
 */
export async function maybeSetDcdtFechaInicioEfectivo({ stop, allStops = [] }) {
  if (!stop || !isCargaStop(stop)) return false;
  if (stop.estado !== "completado") return false;

  let dcdtId = getStopOperacionMeta(stop.notas)?.dcdt_servicio_id;
  if (!dcdtId) {
    const cargadorId = cargadorIdFromStop(stop);
    if (!cargadorId) return false;
    const servicioId = stop.servicio_id;
    if (!servicioId) return false;
    const rows = await fetchAllDcdtByServicio(servicioId);
    const row = rows.find((r) => dcdtCargadorId(r) === cargadorId);
    dcdtId = row?.id;
  }
  if (!dcdtId) return false;

  const linked = stopsForDcdt(allStops, dcdtId);
  const otherCompleted = linked.filter(
    (s) => s.id !== stop.id && isCargaCompletada(s),
  );
  if (otherCompleted.length > 0) return false;

  const ts = stop.hora_salida_real || new Date().toISOString();
  const patched = await patchDcdtFechaInicioEfectivoIfNull(dcdtId, ts);
  if (patched && isDemoApp()) {
    console.log("[DCDT sync] fecha_inicio_efectivo", { dcdt_id: dcdtId, ts, stop_id: stop.id });
  }
  return patched;
}

export async function onStopEstadoOperativoChange({ stop, allStops }) {
  if (!stop) return;
  const estado = String(stop.estado || "").toLowerCase();
  if (estado !== "llegado" && estado !== "completado") return;
  await maybeSetDcdtFechaInicioEfectivo({ stop, allStops }).catch((e) => {
    if (isDemoApp()) console.warn("[DCDT sync] fecha_inicio_efectivo", e?.message || e);
  });
}

