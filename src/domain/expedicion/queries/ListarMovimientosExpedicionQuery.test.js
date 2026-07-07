import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListarMovimientosExpedicionQuery } from "./ListarMovimientosExpedicionQuery.js";

describe("ListarMovimientosExpedicionQuery", () => {
  const repository = { obtenerMovimientos: vi.fn() };
  const query = new ListarMovimientosExpedicionQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps repository movimientos to domain objects", async () => {
    repository.obtenerMovimientos.mockResolvedValue([
      { id: "m1", servicio_id: "s1", tipo_movimiento: "CARGA", descripcion_mercancia: "A" },
    ]);

    const list = await query.execute("s1");
    expect(list).toHaveLength(1);
    expect(list[0].tipoMovimiento).toBe("CARGA");
  });
});
