import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerExpedicionQuery } from "./ObtenerExpedicionQuery.js";

describe("ObtenerExpedicionQuery", () => {
  const repository = { obtenerExpedicion: vi.fn() };
  const query = new ObtenerExpedicionQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("returns domain expedition from repository", async () => {
    const expedicion = { id: "s1", estadoServicio: "en_curso" };
    repository.obtenerExpedicion.mockResolvedValue(expedicion);

    const result = await query.execute("s1");
    expect(repository.obtenerExpedicion).toHaveBeenCalledWith("s1");
    expect(result).toBe(expedicion);
  });

  it("returns null when servicioId is missing", async () => {
    expect(await query.execute("")).toBeNull();
    expect(repository.obtenerExpedicion).not.toHaveBeenCalled();
  });
});
