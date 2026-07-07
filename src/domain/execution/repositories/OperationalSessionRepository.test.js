import { describe, it, expect, vi, beforeEach } from "vitest";
import { OperationalSessionRepository } from "./OperationalSessionRepository.js";
import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";

describe("OperationalSessionRepository", () => {
  const expedicionRepository = { obtenerServicio: vi.fn() };
  /** @type {OperationalSessionRepository} */
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new OperationalSessionRepository(expedicionRepository);
  });

  it("findActiveByExpeditionId maps servicio meta via legacy adapter", async () => {
    expedicionRepository.obtenerServicio.mockResolvedValue({
      id: "srv-r1",
      conductor_id: "u1",
      referencia:
        "__SRV_OP__:" +
        JSON.stringify({
          operacion_muelle_activa: {
            id: "op-r1",
            estado: "abierta",
            lugar_nombre: "Dock 1",
            tipo_previsto: "carga",
            entrada_at: "2026-06-28T09:00:00Z",
            movimientos: [],
          },
        }),
    });

    const session = await repo.findActiveByExpeditionId("srv-r1");
    expect(expedicionRepository.obtenerServicio).toHaveBeenCalledWith("srv-r1");
    expect(session?.id).toBe("op-r1");
    expect(session?.state).toBe(OPERATIONAL_SESSION_STATE.OPEN);
  });

  it("findAllByExpeditionId merges active and history", async () => {
    expedicionRepository.obtenerServicio.mockResolvedValue({
      id: "srv-r2",
      referencia:
        "__SRV_OP__:" +
        JSON.stringify({
          operacion_muelle_activa: {
            id: "op-active",
            estado: "abierta",
            lugar_nombre: "Dock 2",
            entrada_at: "2026-06-28T09:00:00Z",
            movimientos: [],
          },
          historial_operaciones_muelle: [
            {
              id: "op-old",
              estado: "cerrada",
              lugar_nombre: "Dock 2",
              entrada_at: "2026-06-27T09:00:00Z",
              salida_at: "2026-06-27T11:00:00Z",
              movimientos: [],
            },
          ],
        }),
    });

    const all = await repo.findAllByExpeditionId("srv-r2");
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id)).toEqual(["op-active", "op-old"]);
  });
});
