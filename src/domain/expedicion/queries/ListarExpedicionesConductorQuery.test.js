import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListarExpedicionesConductorQuery } from "./ListarExpedicionesConductorQuery.js";

describe("ListarExpedicionesConductorQuery", () => {
  const repository = { listarPorConductor: vi.fn() };
  const query = new ListarExpedicionesConductorQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("maps repository rows to domain expeditions", async () => {
    repository.listarPorConductor.mockResolvedValue([
      { id: "s1", estado: "en_curso", referencia: "" },
      { id: "s2", estado: "cerrado", referencia: "" },
    ]);

    const list = await query.execute("uid-1", { limit: 5 });
    expect(repository.listarPorConductor).toHaveBeenCalledWith("uid-1", { limit: 5 });
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("s1");
  });

  it("returns empty array without uid", async () => {
    expect(await query.execute("")).toEqual([]);
  });
});
