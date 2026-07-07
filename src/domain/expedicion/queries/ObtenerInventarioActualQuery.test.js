import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerInventarioActualQuery } from "./ObtenerInventarioActualQuery.js";

describe("ObtenerInventarioActualQuery", () => {
  const repository = { obtenerStockActual: vi.fn() };
  const query = new ObtenerInventarioActualQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps repository stock to domain inventario", async () => {
    repository.obtenerStockActual.mockResolvedValue({
      stock: [{ line_key: "k1", descripcion_mercancia: "Cajas", cantidad_actual: 4 }],
      documento: null,
    });

    const inv = await query.execute("s1");
    expect(repository.obtenerStockActual).toHaveBeenCalledWith("s1");
    expect(inv.servicioId).toBe("s1");
    expect(inv.lineas).toHaveLength(1);
  });
});
