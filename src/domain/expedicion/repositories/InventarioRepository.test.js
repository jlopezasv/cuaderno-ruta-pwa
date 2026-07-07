import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventarioRepository } from "./InventarioRepository.js";

vi.mock("../../dcdt/decaVivoModel.js", () => ({
  fetchDecaActualVisible: vi.fn(),
  obtenerInventarioActual: vi.fn(),
  fetchDecaMovimientos: vi.fn(),
}));

import {
  fetchDecaActualVisible,
  obtenerInventarioActual,
  fetchDecaMovimientos,
} from "../../dcdt/decaVivoModel.js";

describe("InventarioRepository", () => {
  const repo = new InventarioRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates obtenerInventarioVivo to fetchDecaActualVisible", async () => {
    const payload = { servicio_id: "s1", stock_actual: [] };
    fetchDecaActualVisible.mockResolvedValue(payload);

    const result = await repo.obtenerInventarioVivo("s1");
    expect(fetchDecaActualVisible).toHaveBeenCalledWith("s1");
    expect(result).toBe(payload);
  });

  it("delegates obtenerStockActual to obtenerInventarioActual", async () => {
    const stock = { stock: [{ line_key: "a" }], documento: null };
    obtenerInventarioActual.mockResolvedValue(stock);

    const result = await repo.obtenerStockActual("s2");
    expect(obtenerInventarioActual).toHaveBeenCalledWith("s2");
    expect(result.stock).toHaveLength(1);
  });

  it("delegates obtenerMovimientos to fetchDecaMovimientos", async () => {
    fetchDecaMovimientos.mockResolvedValue([{ id: "m1" }]);

    const result = await repo.obtenerMovimientos("s3");
    expect(fetchDecaMovimientos).toHaveBeenCalledWith("s3");
    expect(result).toHaveLength(1);
  });
});
