import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerExpedicionActivaConductorQuery } from "./ObtenerExpedicionActivaConductorQuery.js";

describe("ObtenerExpedicionActivaConductorQuery", () => {
  const repository = { obtenerActivaPorConductor: vi.fn() };
  const query = new ObtenerExpedicionActivaConductorQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps active servicio to domain expedition", async () => {
    repository.obtenerActivaPorConductor.mockResolvedValue({
      id: "active",
      estado: "en_curso",
      referencia: "",
    });

    const exp = await query.execute("uid-1");
    expect(exp.id).toBe("active");
  });

  it("returns null when no active expedition", async () => {
    repository.obtenerActivaPorConductor.mockResolvedValue(null);
    expect(await query.execute("uid-1")).toBeNull();
  });
});
