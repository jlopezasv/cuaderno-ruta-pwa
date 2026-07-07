import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerMovimientosPorParadaQuery } from "./ObtenerMovimientosPorParadaQuery.js";

describe("ObtenerMovimientosPorParadaQuery", () => {
  const repository = { obtenerMovimientosPorParada: vi.fn() };
  const query = new ObtenerMovimientosPorParadaQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps filtered movimientos to domain objects", async () => {
    repository.obtenerMovimientosPorParada.mockResolvedValue([
      { id: "m1", servicio_id: "s1", parada_id: "p1", tipo_movimiento: "DESCARGA" },
    ]);

    const list = await query.execute("s1", "p1");
    expect(repository.obtenerMovimientosPorParada).toHaveBeenCalledWith("s1", "p1");
    expect(list[0].paradaId).toBe("p1");
  });
});
