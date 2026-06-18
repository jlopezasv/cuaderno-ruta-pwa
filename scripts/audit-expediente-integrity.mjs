#!/usr/bin/env node
/**
 * Reconstruye integrityRecords de buildServiceExpediente para un servicio_id.
 * Uso: SUPABASE_DB_URL_DEMO=postgresql://... node scripts/audit-expediente-integrity.mjs <servicio_id>
 */
import pg from "pg";

const SERVICIO_ID = process.argv[2] || "7d535004-e609-43ac-9292-5effd2766988";
const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

function parseTs(v) {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function importantEntry(type) {
  const t = String(type || "").toLowerCase();
  return /(pausa|descanso|disponibilidad|otros|carga|descarga|inspeccion|repostaje|ferry|incidencia|art12|jornada)/.test(t);
}

function getServicioOperacionMeta(notas) {
  if (!notas) return {};
  try {
    const j = typeof notas === "string" ? JSON.parse(notas) : notas;
    return j?.operacion || j || {};
  } catch {
    return {};
  }
}

function getOperationalTripStartedAt(servicio, meta) {
  return meta?.operational_trip_started_at || meta?.trip_started_at || null;
}

async function main() {
  if (!dbUrl) {
    console.error("Definir SUPABASE_DB_URL_DEMO para ejecutar este script.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const { rows: svcRows } = await client.query(
    `SELECT id, referencia, conductor_id, fecha_inicio, estado, notas, created_at, updated_at
     FROM servicios WHERE id = $1`,
    [SERVICIO_ID],
  );
  const servicio = svcRows[0];
  if (!servicio) {
    console.error("Servicio no encontrado:", SERVICIO_ID);
    process.exit(1);
  }

  const { rows: stops } = await client.query(
    `SELECT id, orden, tipo, nombre, hora_llegada_real, hora_salida_real
     FROM stops WHERE servicio_id = $1 ORDER BY orden ASC`,
    [SERVICIO_ID],
  );

  const stopIds = stops.map((s) => s.id);
  let evidencias = [];
  if (stopIds.length) {
    const { rows } = await client.query(
      `SELECT id, stop_id, tipo, created_at, incidencia_id, url
       FROM evidencias WHERE stop_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [stopIds],
    );
    evidencias = rows;
  }

  const { rows: extraDocs } = await client.query(
    `SELECT id, tipo, created_at, archivo_nombre FROM servicio_documentos_extra
     WHERE servicio_id = $1 ORDER BY created_at ASC`,
    [SERVICIO_ID],
  );

  const meta = getServicioOperacionMeta(servicio.notas);

  let entries = [];
  if (servicio.conductor_id) {
    const { rows } = await client.query(
      `SELECT id, type, ts, deleted, note FROM entries
       WHERE user_id = $1 ORDER BY ts ASC`,
      [servicio.conductor_id],
    );
    entries = rows.filter((e) => !e.deleted);
  }

  const stopEvidenciasOnly = evidencias.filter((ev) => !ev.incidencia_id);
  const extraAsEvidenciaTs = extraDocs.map((d) => parseTs(d.created_at)).filter((v) => v != null);

  function buildWindow(evidenciaTsList, estado) {
    const candidates = [
      parseTs(servicio.fecha_inicio),
      ...stops.flatMap((st) => [parseTs(st.hora_llegada_real), parseTs(st.hora_salida_real)]),
      ...evidenciaTsList.filter((v) => v != null),
      parseTs(meta?.cancellation?.at || meta?.service_cancelled_at),
      parseTs(meta?.archive?.at || meta?.archived_at),
    ].filter((v) => v != null);
    if (!candidates.length) return { start: null, end: null };
    return {
      start: Math.min(...candidates),
      end:
        estado === "completado" || estado === "anulado"
          ? Math.max(...candidates)
          : Date.now(),
    };
  }

  const windowOps = buildWindow(
    stopEvidenciasOnly.map((e) => parseTs(e.created_at)),
    servicio.estado,
  );
  const windowApp = buildWindow(
    [
      ...stopEvidenciasOnly.map((e) => parseTs(e.created_at)),
      ...extraAsEvidenciaTs,
    ],
    servicio.estado,
  );

  function countTac(win) {
    return entries.filter((e) => {
      const ms = parseTs(e.ts);
      if (ms == null || !importantEntry(e.type)) return false;
      if (win.start != null && ms < win.start) return false;
      if (win.end != null && ms > win.end) return false;
      return true;
    }).length;
  }

  const conductorAssignedAt = meta?.conductor_assigned_at || null;
  const tripStartedAt = getOperationalTripStartedAt(servicio, meta) || servicio.fecha_inicio || null;
  const cancelledAt = meta?.cancellation?.at || meta?.service_cancelled_at || null;

  const stopRows = stops.map((stop) => {
    const evs = evidencias.filter((ev) => ev.stop_id === stop.id && !ev.incidencia_id);
    return {
      ...stop,
      entrada: stop.hora_llegada_real,
      salida: stop.hora_salida_real,
      evidencias: evs,
    };
  });

  const flatEvs = stopRows.flatMap((st) => st.evidencias);
  const windowStart = windowApp.start;
  const windowEnd = windowApp.end;

  const breakdown = {
    servicio: {
      id: servicio.id,
      referencia: servicio.referencia,
      estado: servicio.estado,
      conductor_id: servicio.conductor_id,
      fecha_inicio: servicio.fecha_inicio,
    },
    serviceWindow: {
      start: windowStart != null ? new Date(windowStart).toISOString() : null,
      end: windowEnd != null ? new Date(windowEnd).toISOString() : null,
      endSource:
        servicio.estado === "completado" || servicio.estado === "anulado"
          ? "max(operativa + docs extra) — replica app"
          : "Date.now() — servicio NO completado/anulado",
    },
    categories: {},
    byType: {},
    records: [],
    total: 0,
  };

  const add = (type, detail, extra = {}) => {
    breakdown.records.push({ type, detail, ...extra });
    breakdown.byType[type] = (breakdown.byType[type] || 0) + 1;
  };

  if (conductorAssignedAt) {
    add("conductor_asignado", "conductor asignado", { ts: conductorAssignedAt });
    breakdown.categories.servicio = (breakdown.categories.servicio || 0) + 1;
  }
  if (tripStartedAt) {
    add("servicio_iniciado", "servicio iniciado", { ts: tripStartedAt });
    breakdown.categories.servicio = (breakdown.categories.servicio || 0) + 1;
  }
  if (servicio.estado === "anulado" || cancelledAt) {
    add("servicio_anulado", "anulado", { ts: cancelledAt || servicio.updated_at });
    breakdown.categories.servicio = (breakdown.categories.servicio || 0) + 1;
  }

  let paradaCount = 0;
  let evidenciaCount = 0;
  for (const stop of stopRows) {
    if (stop.entrada) {
      add("entrada_muelle", stop.nombre, { stop_id: stop.id, ts: stop.entrada });
      paradaCount++;
    }
    for (const ev of stop.evidencias) {
      add(ev.tipo, `evidencia ${ev.id}`, { stop_id: stop.id, evidencia_id: ev.id, ts: ev.created_at });
      evidenciaCount++;
    }
    if (stop.salida) {
      const ty = stop.tipo === "descarga" ? "descarga_finalizada" : "carga_finalizada";
      add(ty, stop.nombre, { stop_id: stop.id, ts: stop.salida });
      paradaCount++;
    }
  }
  breakdown.categories.parada = paradaCount;
  breakdown.categories.evidencia = evidenciaCount;

  if (servicio.estado === "completado") {
    const finalDescarga = [...stopRows].reverse().find((st) => (st.tipo === "descarga" || st.tipo === "carga_descarga") && st.salida)
      || [...stopRows].reverse().find((st) => st.salida);
    if (finalDescarga?.salida) {
      add("entrega_completada", finalDescarga.nombre, { stop_id: finalDescarga.id, ts: finalDescarga.salida });
      breakdown.categories.entrega = 1;
    }
  }

  let tacografoInWindow = 0;
  const narrowEnd = windowOps.end;
  for (const entry of entries) {
    const ms = parseTs(entry.ts);
    if (ms == null || !importantEntry(entry.type)) continue;
    if (windowStart != null && ms < windowStart) continue;
    if (windowEnd != null && ms > windowEnd) continue;
    add(`tacografo_${entry.type}`, entry.note || "", { entry_id: entry.id, ts: entry.ts });
    tacografoInWindow++;
  }
  breakdown.categories.tacografo_app_window = tacografoInWindow;

  breakdown.windowApp = {
    start: windowApp.start != null ? new Date(windowApp.start).toISOString() : null,
    end: windowApp.end != null ? new Date(windowApp.end).toISOString() : null,
  };
  breakdown.windowOpsOnly = {
    start: windowOps.start != null ? new Date(windowOps.start).toISOString() : null,
    end: windowOps.end != null ? new Date(windowOps.end).toISOString() : null,
  };
  breakdown.tacografoInOpsWindow = countTac(windowOps);
  breakdown.tacografoExtraFromExtendedWindow = countTac(windowApp) - countTac(windowOps);
  breakdown.extraDocumentosCount = extraDocs.length;
  breakdown.extraDocumentosLatest =
    extraAsEvidenciaTs.length > 0 ? new Date(Math.max(...extraAsEvidenciaTs)).toISOString() : null;

  breakdown.total = breakdown.records.length;

  const narrowTacografo = entries.filter((e) => {
    const ms = parseTs(e.ts);
    return (
      ms != null &&
      importantEntry(e.type) &&
      windowOps.start != null &&
      ms >= windowOps.start &&
      narrowEnd != null &&
      ms <= narrowEnd
    );
  });

  console.log(JSON.stringify(breakdown, null, 2));
  console.log("\n--- RESUMEN ---");
  console.log(`Total integrityRecords (app): ${breakdown.total}`);
  console.log(`  Servicio: ${breakdown.categories.servicio || 0}`);
  console.log(`  Parada (entrada+salida): ${breakdown.categories.parada || 0}`);
  console.log(`  Evidencias parada: ${breakdown.categories.evidencia || 0}`);
  console.log(`  entrega_completada: ${breakdown.categories.entrega || 0}`);
  console.log(`  Tacógrafo (ventana APP, con docs extra): ${breakdown.categories.tacografo_app_window || 0}`);
  console.log(`  Tacógrafo (ventana solo operativa): ${breakdown.tacografoInOpsWindow || 0}`);
  console.log(`  Tacógrafo extra por ventana extendida: ${breakdown.tacografoExtraFromExtendedWindow || 0}`);
  console.log(`  Extra docs: ${breakdown.extraDocumentosCount} (latest ${breakdown.extraDocumentosLatest || "—"})`);
  console.log(`  Tacógrafo (ventana estrecha solo operativa): ${narrowTacografo.length}`);
  console.log(`\nStops: ${stops.length} | Evidencias DB: ${evidencias.length} | Extra docs (NO cuentan): ${extraDocs.length}`);
  console.log("Por tipo:", breakdown.byType);
  console.log("\nEvidencias por stop:");
  for (const st of stopRows) {
    console.log(`  ${st.orden} ${st.tipo} ${st.nombre}: ${st.evidencias.length} evs`, st.evidencias.map((e) => e.tipo));
  }
  console.log("\nExtra docs (no integrity):", extraDocs.map((d) => `${d.tipo} ${d.archivo_nombre}`));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
