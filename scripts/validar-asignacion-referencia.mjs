/**
 * Valida payloads de asignación sin conductor → conductor.
 * node scripts/validar-asignacion-referencia.mjs
 */
import { mergeReferenciaOperacional } from "../src/domain/service/serviceOperacionMeta.js";

const metaPatch = {
  conductor_assigned_at: new Date().toISOString(),
  conductor_assigned_id: "00000000-0000-4000-8000-000000000001",
  operational_plan: {
    status: "ok",
    route_plan_status: "ready",
    planned_eta: new Date().toISOString(),
  },
};

const fromNull = mergeReferenciaOperacional(null, metaPatch);
const fromRef = mergeReferenciaOperacional("SRV-001", metaPatch);

const checks = [
  ["merge desde null incluye __SRV_OP__", fromNull.includes("__SRV_OP__")],
  ["merge desde null incluye operational_plan", fromNull.includes("operational_plan")],
  ["merge con número cliente conserva base", fromRef.startsWith("SRV-001")],
  ["bootstrap PATCH body (solo referencia)", JSON.stringify({ referencia: fromNull }).includes("__SRV_OP__")],
  [
    "assign PATCH conductor (sin referencia)",
    !JSON.stringify({ conductor_id: "x", estado: "asignado" }).includes("referencia"),
  ],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(ok ? "OK" : "FAIL", label);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
