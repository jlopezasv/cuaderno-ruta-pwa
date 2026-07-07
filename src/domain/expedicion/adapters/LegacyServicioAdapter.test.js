import { describe, it, expect } from "vitest";
import { toExpedicion, toOperacionMuelleActiva } from "./LegacyServicioAdapter.js";
import { EXPEDIENTE_ESTADO } from "../constants/EstadosExpedicion.js";
import { TIPO_TRANSPORTE } from "../../service/tipoTransporte.js";

describe("LegacyServicioAdapter", () => {
  it("maps servicio row to Expedicion domain object", () => {
    const servicio = {
      id: "srv-1",
      estado: "en_curso",
      referencia: "REF-001\n__SRV_OP__:" + JSON.stringify({
        autonomo_expediente_v1: true,
        expediente_estado: EXPEDIENTE_ESTADO.EN_MUELLE,
        tipo_transporte: TIPO_TRANSPORTE.NACIONAL,
        expediente_started_at: "2026-06-01T08:00:00Z",
        domain_schema_version: 1,
      }),
      conductor_id: "cond-1",
      empresa_id: null,
      created_at: "2026-06-01T07:00:00Z",
    };

    const exp = toExpedicion(servicio);
    expect(exp).not.toBeNull();
    expect(exp.id).toBe("srv-1");
    expect(exp.referenciaVisible).toBe("REF-001");
    expect(exp.estadoServicio).toBe("en_curso");
    expect(exp.estadoExpedicion).toBe(EXPEDIENTE_ESTADO.EN_MUELLE);
    expect(exp.tipoTransporte).toBe(TIPO_TRANSPORTE.NACIONAL);
    expect(exp.esAutonomoExpediente).toBe(true);
    expect(exp.domainSchemaVersion).toBe(1);
    expect(exp.startedAt).toBe("2026-06-01T08:00:00Z");
    expect(exp.conductorId).toBe("cond-1");
    expect(exp.empresaId).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(toExpedicion(null)).toBeNull();
    expect(toExpedicion(undefined)).toBeNull();
  });

  it("maps active muelle operation when abierta", () => {
    const servicio = {
      id: "srv-2",
      referencia: "__SRV_OP__:" + JSON.stringify({
        operacion_muelle_activa: {
          id: "op-1",
          estado: "abierta",
          entrada_at: "2026-06-01T09:00:00Z",
          muelle_nombre: "Muelle 3",
          tipo_previsto: "carga",
          movimientos: [{ id: "m1", tipo: "carga" }],
        },
      }),
    };

    const op = toOperacionMuelleActiva(servicio);
    expect(op).not.toBeNull();
    expect(op.id).toBe("op-1");
    expect(op.muelleNombre).toBe("Muelle 3");
    expect(op.movimientos).toHaveLength(1);
  });

  it("returns null when muelle operation is cerrada", () => {
    const servicio = {
      referencia: "__SRV_OP__:" + JSON.stringify({
        operacion_muelle_activa: { id: "op-2", estado: "cerrada" },
      }),
    };
    expect(toOperacionMuelleActiva(servicio)).toBeNull();
  });
});
