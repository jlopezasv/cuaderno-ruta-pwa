/**
 * Mismo timestamp → orden por secuencia operacional (informe / expediente).
 * node scripts/validar-timeline-order.mjs
 */
import {
  sortOperationalTimeline,
  compareOperationalTimelineEvents,
} from "../src/domain/service/serviceExpediente.js";

const ts = "2026-05-16T09:05:00.000Z";

const sameClock = [
  { ts, type: "entrega_completada", title: "Entrega completada" },
  { ts, type: "servicio_iniciado", title: "Servicio iniciado" },
  { ts, type: "conductor_asignado", title: "Conductor asignado" },
  { ts, type: "entrada_muelle", title: "Llegada muelle", stopId: "a" },
  { ts, type: "salida_muelle", title: "Salida muelle", stopId: "a" },
];

const sorted = sortOperationalTimeline([...sameClock]);
const types = sorted.map((e) => e.type);

const expected = [
  "conductor_asignado",
  "servicio_iniciado",
  "entrada_muelle",
  "salida_muelle",
  "entrega_completada",
];

let failed = 0;
if (JSON.stringify(types) !== JSON.stringify(expected)) {
  console.log("FAIL orden mismo reloj", { types, expected });
  failed++;
} else {
  console.log("OK orden mismo reloj", types.join(" → "));
}

if (compareOperationalTimelineEvents(
  { ts, type: "servicio_iniciado" },
  { ts, type: "entrega_completada" },
) >= 0) {
  console.log("FAIL servicio_iniciado debe ir antes que entrega_completada");
  failed++;
} else {
  console.log("OK servicio_iniciado < entrega_completada con mismo ts");
}

process.exit(failed ? 1 : 0);
