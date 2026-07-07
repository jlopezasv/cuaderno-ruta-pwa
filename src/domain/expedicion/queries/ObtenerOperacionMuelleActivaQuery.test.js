import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerOperacionMuelleActivaQuery } from "./ObtenerOperacionMuelleActivaQuery.js";

describe("ObtenerOperacionMuelleActivaQuery", () => {
  const repository = { obtenerServicio: vi.fn() };
  const query = new ObtenerOperacionMuelleActivaQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("returns active muelle operation from servicio meta", async () => {
    repository.obtenerServicio.mockResolvedValue({
      referencia: "__SRV_OP__:" + JSON.stringify({
        operacion_muelle_activa: {
          id: "op-1",
          estado: "abierta",
          muelle_nombre: "Muelle 2",
        },
      }),
    });

    const op = await query.execute("s1");
    expect(op.id).toBe("op-1");
    expect(op.muelleNombre).toBe("Muelle 2");
  });

  it("returns null when operation is closed", async () => {
    repository.obtenerServicio.mockResolvedValue({
      referencia: "__SRV_OP__:" + JSON.stringify({
        operacion_muelle_activa: { id: "op-2", estado: "cerrada" },
      }),
    });
    expect(await query.execute("s1")).toBeNull();
  });
});
