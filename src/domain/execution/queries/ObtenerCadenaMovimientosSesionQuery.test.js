import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerCadenaMovimientosSesionQuery } from "./ObtenerCadenaMovimientosSesionQuery.js";
import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";

describe("ObtenerCadenaMovimientosSesionQuery", () => {
  const sessionRepository = {
    findById: vi.fn(),
  };
  const movimientoRepository = {
    listarMovimientos: vi.fn(),
  };
  const query = new ObtenerCadenaMovimientosSesionQuery(sessionRepository, movimientoRepository);

  beforeEach(() => vi.clearAllMocks());

  it("returns session chain with matched DeCA movements", async () => {
    sessionRepository.findById.mockResolvedValue({
      id: "os-chain-1",
      expeditionId: "srv-1",
      state: OPERATIONAL_SESSION_STATE.OPEN,
      movementRefs: [
        {
          sessionMovementId: "carga-1",
          decaMovimientoId: "mov-1",
          tipoSesion: "carga",
          estado: "vigente",
          registeredAt: "2026-06-28T10:00:00Z",
        },
        {
          sessionMovementId: "carga-2",
          decaMovimientoId: "mov-2",
          tipoSesion: "carga",
          estado: "vigente",
          registeredAt: "2026-06-28T10:05:00Z",
        },
      ],
    });

    movimientoRepository.listarMovimientos.mockResolvedValue([
      {
        id: "mov-1",
        servicio_id: "srv-1",
        tipo_movimiento: "CARGA",
        descripcion_mercancia: "Palés",
        cantidad: 10,
      },
      {
        id: "mov-99",
        servicio_id: "srv-1",
        tipo_movimiento: "DESCARGA",
        descripcion_mercancia: "Otro",
      },
    ]);

    const chain = await query.execute("srv-1", "os-chain-1");
    expect(chain?.movimientos).toHaveLength(1);
    expect(chain?.movimientos[0].id).toBe("mov-1");
    expect(chain?.movementRefs).toHaveLength(2);
  });

  it("returns null when session not found", async () => {
    sessionRepository.findById.mockResolvedValue(null);
    expect(await query.execute("srv-x", "os-x")).toBeNull();
  });
});
