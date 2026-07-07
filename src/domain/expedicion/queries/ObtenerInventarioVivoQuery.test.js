import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerInventarioVivoQuery } from "./ObtenerInventarioVivoQuery.js";

describe("ObtenerInventarioVivoQuery", () => {
  const repository = { obtenerInventarioVivo: vi.fn() };
  const query = new ObtenerInventarioVivoQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps repository payload to domain inventario vivo", async () => {
    repository.obtenerInventarioVivo.mockResolvedValue({
      servicio_id: "s1",
      stock_actual: [{ line_key: "k1", descripcion_mercancia: "X", cantidad_actual: 2 }],
      documento: { id: "d1", estado: "actual", version: 1 },
      ultimos_movimientos: [{ id: "m1", servicio_id: "s1", tipo_movimiento: "CARGA" }],
    });

    const vivo = await query.execute("s1");
    expect(vivo.servicioId).toBe("s1");
    expect(vivo.lineas).toHaveLength(1);
    expect(vivo.ultimosMovimientos).toHaveLength(1);
  });
});
