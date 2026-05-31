/**
 * Validación FASE 2B — ventana tacógrafo + tramos operativos muelle.
 * node scripts/validar-participacion-tiempos.mjs
 */
import {
  buildParticipacionTiemposList,
  calcTiemposEnVentana,
} from "../src/domain/fleet/participacionTiempos.js";
import { buildTramosOperativos } from "../src/domain/fleet/participacionTramosOperativos.js";

const t0 = Date.parse("2026-05-30T08:00:00.000Z");
const entries = [
  { type: "inicio_conduccion", ts: new Date(t0 + 100 * 60000).toISOString() },
  { type: "fin_conduccion", ts: new Date(t0 + 130 * 60000).toISOString() },
  { type: "inicio_carga", ts: new Date(t0 + 130 * 60000).toISOString() },
  { type: "fin_carga", ts: new Date(t0 + 150 * 60000).toISOString() },
];

const windowStart = t0 + 30 * 60000;
const windowEnd = t0 + 180 * 60000;
const r = calcTiemposEnVentana(entries, windowStart, windowEnd, windowEnd);

if (r.conduccionMs !== 30 * 60000) {
  console.error("FAIL conduccionMs", r.conduccionMs);
  process.exit(1);
}
if (r.trabajoMs !== 20 * 60000) {
  console.error("FAIL trabajoMs", r.trabajoMs);
  process.exit(1);
}

const servicio = {
  id: "s1",
  conductor_id: "uid-1",
  estado: "en_curso",
  fecha_inicio: new Date(t0).toISOString(),
};
const stops = [
  {
    id: "st1",
    orden: 1,
    tipo: "carga",
    nombre: "Muelle A",
    hora_llegada_real: new Date(t0 + 60 * 60000).toISOString(),
    hora_salida_real: new Date(t0 + 90 * 60000).toISOString(),
  },
  {
    id: "st2",
    orden: 2,
    tipo: "descarga",
    nombre: "Muelle B",
    hora_llegada_real: new Date(t0 + 120 * 60000).toISOString(),
    hora_salida_real: new Date(t0 + 150 * 60000).toISOString(),
  },
];

const tramos = buildTramosOperativos(servicio, stops, t0, t0 + 200 * 60000, t0 + 200 * 60000);
const traslado = tramos.find((t) => t.kind === "traslado");
if (!traslado || traslado.durationMs !== 30 * 60000) {
  console.error("FAIL tramo traslado A→B", traslado);
  process.exit(1);
}
const abierto = buildTramosOperativos(
  servicio,
  [{ id: "st1", orden: 1, tipo: "carga", hora_salida_real: new Date(t0 + 90 * 60000).toISOString() }],
  t0,
  t0 + 200 * 60000,
  t0 + 120 * 60000,
);
if (!abierto.some((t) => t.kind === "traslado_abierto")) {
  console.error("FAIL traslado_abierto");
  process.exit(1);
}

const list = buildParticipacionTiemposList({
  participaciones: [],
  entriesByConductorId: { "uid-1": entries },
  nombresByConductorId: { "uid-1": "Conductor prueba" },
  servicio,
  stops,
  nowMs: t0 + 200 * 60000,
});

if (list.length !== 1 || !list[0].tramos?.length) {
  console.error("FAIL list tramos", list);
  process.exit(1);
}

console.log("OK validar-participacion-tiempos.mjs");
