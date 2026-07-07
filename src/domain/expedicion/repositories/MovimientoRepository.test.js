import { describe, it, expect, vi, beforeEach } from "vitest";
import { MovimientoRepository } from "./MovimientoRepository.js";

vi.mock("../../dcdt/decaVivoModel.js", () => ({
  registrarMovimientoCarga: vi.fn(),
  insertarMovimientoCarga: vi.fn(),
  editarMovimientoCarga: vi.fn(),
  anularMovimientoCarga: vi.fn(),
  fetchDecaMovimientos: vi.fn(),
  fetchDecaVersionesHistorial: vi.fn(),
}));

import {
  registrarMovimientoCarga,
  insertarMovimientoCarga,
  editarMovimientoCarga,
  anularMovimientoCarga,
  fetchDecaMovimientos,
  fetchDecaVersionesHistorial,
} from "../../dcdt/decaVivoModel.js";

describe("MovimientoRepository", () => {
  const repo = new MovimientoRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates registrarMovimiento to registrarMovimientoCarga", async () => {
    const payload = { servicio_id: "s1", tipo_movimiento: "CARGA" };
    const stock = [{ line_key: "x" }];
    registrarMovimientoCarga.mockResolvedValue({ ok: true });

    await repo.registrarMovimiento(payload, stock);
    expect(registrarMovimientoCarga).toHaveBeenCalledWith(payload, stock);
  });

  it("delegates insertarMovimiento to insertarMovimientoCarga", async () => {
    const payload = { servicio_id: "s1" };
    insertarMovimientoCarga.mockResolvedValue({ movimiento_id: "m1" });

    await repo.insertarMovimiento(payload);
    expect(insertarMovimientoCarga).toHaveBeenCalledWith(payload, []);
  });

  it("delegates editarMovimiento to editarMovimientoCarga", async () => {
    editarMovimientoCarga.mockResolvedValue({ ok: true });
    await repo.editarMovimiento("m1", { cantidad: 2 });
    expect(editarMovimientoCarga).toHaveBeenCalledWith("m1", { cantidad: 2 });
  });

  it("delegates anularMovimiento to anularMovimientoCarga", async () => {
    anularMovimientoCarga.mockResolvedValue({ ok: true });
    await repo.anularMovimiento("m2");
    expect(anularMovimientoCarga).toHaveBeenCalledWith("m2");
  });

  it("delegates listarMovimientos to fetchDecaMovimientos", async () => {
    fetchDecaMovimientos.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const list = await repo.listarMovimientos("s1");
    expect(fetchDecaMovimientos).toHaveBeenCalledWith("s1");
    expect(list).toHaveLength(2);
  });

  it("delegates obtenerHistoricoVersiones to fetchDecaVersionesHistorial", async () => {
    fetchDecaVersionesHistorial.mockResolvedValue([{ version: 1 }]);
    const hist = await repo.obtenerHistoricoVersiones("s1");
    expect(fetchDecaVersionesHistorial).toHaveBeenCalledWith("s1");
    expect(hist[0].version).toBe(1);
  });

  it("filters movimientos by parada_id", async () => {
    fetchDecaMovimientos.mockResolvedValue([
      { id: "m1", parada_id: "p1" },
      { id: "m2", parada_id: "p2" },
      { id: "m3", parada_id: "p1" },
    ]);

    const filtered = await repo.obtenerMovimientosPorParada("s1", "p1");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((m) => m.parada_id === "p1")).toBe(true);
  });

  it("returns all movimientos when paradaId is empty", async () => {
    fetchDecaMovimientos.mockResolvedValue([{ id: "m1" }]);
    const all = await repo.obtenerMovimientosPorParada("s1", "");
    expect(all).toHaveLength(1);
  });
});
