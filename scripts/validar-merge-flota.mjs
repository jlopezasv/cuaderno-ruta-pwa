/**
 * Comprueba que mergeFlotaServicios no pise asignación local con fila servidor desfasada.
 * node scripts/validar-merge-flota.mjs
 */
import {
  mergeFlotaServicios,
  patchFlotaServicioTrasAsignar,
  isLocalFlotaServicioAssignNewer,
} from "../src/features/empresa/empresaFlotaRefresh.js";
import { getServicioOperacionMeta } from "../src/domain/service/serviceOperacionMeta.js";

const SERVICIO_ID = "test-svc-merge";
const REF_BASE = "Cliente ACME";
const REF_ASSIGNED = `${REF_BASE}\n__SRV_OP__:${JSON.stringify({
  conductor_assigned_at: "2026-05-16T12:00:00.000Z",
  conductor_assigned_label: "Conductor Test",
})}`;

const staleServerRow = {
  id: SERVICIO_ID,
  estado: "pendiente_asignacion",
  conductor_id: null,
  referencia: REF_BASE,
  updated_at: "2026-05-16T11:30:00.000Z",
};

const localPatched = patchFlotaServicioTrasAsignar([staleServerRow], SERVICIO_ID, {
  conductorId: "cond-99",
  referencia: REF_ASSIGNED,
  estado: "asignado",
})[0];

const serverRefresh = [
  {
    ...staleServerRow,
    updated_at: "2026-05-16T12:05:00.000Z",
  },
];

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(
  isLocalFlotaServicioAssignNewer(localPatched, serverRefresh[0]),
  "local debe ganar aunque servidor tenga updated_at más reciente sin asignación"
);

const merged = mergeFlotaServicios([localPatched], serverRefresh);
const row = merged[0];

assert(row.conductor_id === "cond-99", "conductor_id conservado tras merge");
assert(row.estado === "asignado", "estado conservado tras merge");
assert(String(row.referencia).includes("conductor_assigned_at"), "referencia con meta conservada");

const meta = getServicioOperacionMeta(row);
assert(!!meta?.conductor_assigned_at, "meta conductor_assigned_at presente (timelineSoloTexto > 0 en card)");

console.log("OK merge flota: conductor, estado, referencia y meta timeline preservados tras refresh desfasado.");
