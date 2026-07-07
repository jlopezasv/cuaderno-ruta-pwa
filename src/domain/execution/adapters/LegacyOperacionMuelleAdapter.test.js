import { describe, it, expect } from "vitest";
import {
  extractMovementRefsFromLegacyMovimientos,
  toOperationalSessionActiveFromServicio,
  toOperationalSessionsFromHistorial,
  toOperationalSessionFromLegacyOp,
} from "./LegacyOperacionMuelleAdapter.js";
import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";
import { OPERATIONAL_SESSION_KIND } from "../constants/TiposOperationalSession.js";

describe("LegacyOperacionMuelleAdapter", () => {
  const legacyOp = {
    id: "op-legacy-1",
    estado: "abierta",
    lugar_nombre: "Muelle Norte",
    lugar_direccion: "C/ Logística 1",
    tipo_previsto: "carga",
    observacion_entrada: "Entrada OK",
    entrada_at: "2026-06-28T08:00:00Z",
    stop_session_id: "stop-1",
    movimientos: [
      {
        id: "carga-1",
        carga_id: "carga-1",
        deca_movimiento_id: "mov-deca-1",
        tipo: "carga",
        estado: "vigente",
        at: "2026-06-28T08:30:00Z",
      },
    ],
  };

  it("maps legacy op JSON to OperationalSession", () => {
    const session = toOperationalSessionFromLegacyOp(legacyOp, "srv-1", "user-1");
    expect(session.id).toBe("op-legacy-1");
    expect(session.state).toBe(OPERATIONAL_SESSION_STATE.OPEN);
    expect(session.sessionKind).toBe(OPERATIONAL_SESSION_KIND.LOAD);
    expect(session.location.name).toBe("Muelle Norte");
    expect(session.actor.userId).toBe("user-1");
    expect(session.movementRefs).toHaveLength(1);
    expect(session.isLegacyMuelleSession).toBe(true);
  });

  it("reads active session from servicio meta", () => {
    const servicio = {
      id: "srv-2",
      conductor_id: "cond-2",
      referencia: "__SRV_OP__:" + JSON.stringify({ operacion_muelle_activa: legacyOp }),
    };
    const session = toOperationalSessionActiveFromServicio(servicio);
    expect(session?.expeditionId).toBe("srv-2");
    expect(session?.state).toBe(OPERATIONAL_SESSION_STATE.OPEN);
  });

  it("returns null when no active muelle session (legacy servicios)", () => {
    expect(
      toOperationalSessionActiveFromServicio({ id: "srv-3", referencia: "REF-001" })
    ).toBeNull();
  });

  it("maps historial entries", () => {
    const servicio = {
      id: "srv-4",
      referencia:
        "__SRV_OP__:" +
        JSON.stringify({
          historial_operaciones_muelle: [
            { ...legacyOp, id: "op-h1", estado: "cerrada", salida_at: "2026-06-28T10:00:00Z" },
          ],
        }),
    };
    const history = toOperationalSessionsFromHistorial(servicio);
    expect(history).toHaveLength(1);
    expect(history[0].state).toBe(OPERATIONAL_SESSION_STATE.CLOSED);
  });

  it("extractMovementRefsFromLegacyMovimientos handles empty", () => {
    expect(extractMovementRefsFromLegacyMovimientos(null)).toEqual([]);
  });
});
