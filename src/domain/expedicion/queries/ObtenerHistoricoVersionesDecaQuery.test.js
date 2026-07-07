import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerHistoricoVersionesDecaQuery } from "./ObtenerHistoricoVersionesDecaQuery.js";

describe("ObtenerHistoricoVersionesDecaQuery", () => {
  const repository = { obtenerHistoricoVersiones: vi.fn() };
  const query = new ObtenerHistoricoVersionesDecaQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps version rows to domain objects", async () => {
    repository.obtenerHistoricoVersiones.mockResolvedValue([
      { id: "v1", version: 3, motivo: "recalculo", creado_en: "2026-01-01" },
    ]);

    const versions = await query.execute("s1");
    expect(versions[0].version).toBe(3);
  });
});
