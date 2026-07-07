import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTransportObligationRepository } from "../repositories/InMemoryTransportObligationRepository.js";
import { createTransportObligation } from "../aggregate/TransportObligation.js";
import { ObtenerTransportObligationQuery } from "./ObtenerTransportObligationQuery.js";
import { ListarTransportObligationsPorEmpresaQuery } from "./ListarTransportObligationsPorEmpresaQuery.js";
import { ObtenerObligationPorExpedicionQuery } from "./ObtenerObligationPorExpedicionQuery.js";

describe("Planning queries", () => {
  /** @type {InMemoryTransportObligationRepository} */
  let repo;

  beforeEach(() => {
    repo = new InMemoryTransportObligationRepository();
  });

  it("ObtenerTransportObligationQuery returns obligation", async () => {
    const { obligation } = createTransportObligation({ id: "to-q1", empresaId: "emp-1" });
    await repo.save(obligation);
    const query = new ObtenerTransportObligationQuery(repo);
    const result = await query.execute("to-q1");
    expect(result?.id).toBe("to-q1");
  });

  it("ListarTransportObligationsPorEmpresaQuery filters by empresa", async () => {
    await repo.save(createTransportObligation({ id: "to-q2", empresaId: "emp-a" }).obligation);
    await repo.save(createTransportObligation({ id: "to-q3", empresaId: "emp-b" }).obligation);
    const query = new ListarTransportObligationsPorEmpresaQuery(repo);
    expect(await query.execute("emp-a")).toHaveLength(1);
  });

  it("ObtenerObligationPorExpedicionQuery resolves link and obligation", async () => {
    const { obligation } = createTransportObligation({ id: "to-q4", empresaId: "emp-1" });
    await repo.save(obligation);
    await repo.saveExpeditionLink({
      expeditionId: "srv-q4",
      transportObligationId: "to-q4",
      linkedAt: "2026-06-28T10:00:00Z",
      linkedBy: null,
    });
    const query = new ObtenerObligationPorExpedicionQuery(repo);
    const result = await query.execute("srv-q4");
    expect(result?.obligation.id).toBe("to-q4");
    expect(result?.link.expeditionId).toBe("srv-q4");
  });
});
