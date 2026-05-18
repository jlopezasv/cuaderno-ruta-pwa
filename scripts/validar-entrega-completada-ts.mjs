/**
 * node scripts/validar-entrega-completada-ts.mjs
 */
import {
  resolveSalidaMuelleDescargaFromStops,
  entregaCompletadaEstadoLabel,
} from "../src/domain/service/entregaCompletadaTime.js";

const stops = [
  { id: "1", orden: 1, tipo: "carga", nombre: "Origen", hora_salida_real: "2026-05-16T09:39:00.000Z" },
  { id: "2", orden: 2, tipo: "descarga", nombre: "Madrid", hora_salida_real: "2026-05-16T09:43:00.000Z" },
];

let failed = 0;
const salida = resolveSalidaMuelleDescargaFromStops(stops);
if (salida?.ts !== "2026-05-16T09:43:00.000Z") {
  console.log("FAIL salida muelle descarga", salida);
  failed++;
} else {
  console.log("OK salida muelle descarga", salida.ts);
}

const label = entregaCompletadaEstadoLabel(stops);
if (!label.includes("10:43") && !label.includes("11:43")) {
  console.log("FAIL label con hora local", label);
  failed++;
} else {
  console.log("OK label", label);
}

process.exit(failed ? 1 : 0);
