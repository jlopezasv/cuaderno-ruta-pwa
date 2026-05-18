/**
 * Entrega completada = salida del último stop (no carga intermedia).
 * node scripts/validar-entrega-completada-ts.mjs
 */

function entregaCompletadaPayload(stop, servicio) {
  if (!stop?.salida) return null;
  return {
    ts: stop.salida,
    stopId: stop.id,
    detail: servicio?.destino || stop.nombre,
  };
}

function resolveEntregaCompletadaFromStops(stopRows, servicio = null, sortedStops = null) {
  if (!Array.isArray(stopRows) || !stopRows.length) return null;
  const rawById = new Map((sortedStops || []).map((st) => [st.id, st]));
  const withSalida = (row) => {
    if (!row) return null;
    const raw = rawById.get(row.id);
    const salida = row.salida || raw?.hora_salida_real || null;
    if (!salida) return null;
    return { ...row, salida };
  };
  const ultimo = withSalida(stopRows[stopRows.length - 1]);
  if (ultimo) return entregaCompletadaPayload(ultimo, servicio);
  let lastUnload = null;
  for (const row of stopRows) {
    if (row.tipo === "descarga" || row.tipo === "carga_descarga") {
      const hit = withSalida(row);
      if (hit) lastUnload = hit;
    }
  }
  if (lastUnload) return entregaCompletadaPayload(lastUnload, servicio);
  return null;
}

const servicio = { destino: "Madrid", fecha_inicio: "2026-05-16T09:39:00.000Z" };
const sortedStops = [
  { id: "1", orden: 1, tipo: "carga", nombre: "Origen", hora_salida_real: "2026-05-16T09:39:00.000Z" },
  { id: "2", orden: 2, tipo: "descarga", nombre: "Madrid", hora_salida_real: "2026-05-16T09:43:00.000Z" },
];
const stopRows = sortedStops.map((stop) => ({
  id: stop.id,
  orden: stop.orden,
  tipo: stop.tipo === "descarga" ? "descarga" : "carga",
  nombre: stop.nombre,
  salida: stop.hora_salida_real,
}));

let failed = 0;
const entrega = resolveEntregaCompletadaFromStops(stopRows, servicio, sortedStops);

if (entrega?.ts !== "2026-05-16T09:43:00.000Z") {
  console.log("FAIL debe usar salida último stop (11:43), no carga (11:39)", entrega);
  failed++;
} else {
  console.log("OK ts = ultimoStop.salida", entrega.ts);
}

if (entrega?.stopId !== "2") {
  console.log("FAIL stopId destino", entrega?.stopId);
  failed++;
}

const soloCarga = resolveEntregaCompletadaFromStops(
  [{ id: "1", orden: 1, tipo: "carga", nombre: "O", salida: "2026-05-16T09:39:00.000Z" }],
  servicio,
);
if (soloCarga?.ts !== "2026-05-16T09:39:00.000Z") {
  console.log("FAIL único stop con salida", soloCarga);
  failed++;
} else {
  console.log("OK único stop en ruta = su salida");
}

process.exit(failed ? 1 : 0);
