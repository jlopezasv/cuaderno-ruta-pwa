/**
 * Entrega completada = salida del último stop de descarga.
 * node scripts/validar-entrega-completada-ts.mjs
 */
import { resolveEntregaCompletadaFromStops } from "../src/domain/service/serviceExpediente.js";

const servicio = { destino: "Madrid" };
const stopRows = [
  { id: "1", orden: 1, tipo: "carga", nombre: "Origen", salida: "2026-05-16T08:00:00.000Z" },
  { id: "2", orden: 2, tipo: "descarga", nombre: "Cliente A", salida: "2026-05-16T10:00:00.000Z" },
  { id: "3", orden: 3, tipo: "descarga", nombre: "Madrid final", salida: "2026-05-16T11:05:00.000Z" },
];

const entrega = resolveEntregaCompletadaFromStops(stopRows, servicio);
let failed = 0;

if (entrega?.ts !== "2026-05-16T11:05:00.000Z") {
  console.log("FAIL ts debe ser salida del último stop descarga", entrega);
  failed++;
} else {
  console.log("OK ts = salida destino final", entrega.ts);
}

if (entrega?.stopId !== "3") {
  console.log("FAIL stopId", entrega?.stopId);
  failed++;
} else {
  console.log("OK stopId destino final", entrega.stopId);
}

const sinSalida = resolveEntregaCompletadaFromStops(
  [{ id: "x", orden: 1, tipo: "descarga", salida: null }],
  servicio,
);
if (sinSalida != null) {
  console.log("FAIL sin salida debe devolver null", sinSalida);
  failed++;
} else {
  console.log("OK sin salida_muelle → no evento sintético");
}

process.exit(failed ? 1 : 0);
