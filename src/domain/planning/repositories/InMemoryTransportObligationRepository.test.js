import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTransportObligationRepository } from "./InMemoryTransportObligationRepository.js";
import { createTransportObligation } from "../aggregate/TransportObligation.js";

describe("InMemoryTransportObligationRepository", () => {
  /** @type {InMemoryTransportObligationRepository} */
  let repo;

  beforeEach(() => {
    repo = new InMemoryTransportObligationRepository();
  });

  it("saves and finds obligation by id", async () => {
    const { obligation } = createTransportObligation({ id: "to-mem-1", empresaId: "emp-1" });
    await repo.save(obligation);
    const found = await repo.findById("to-mem-1");
    expect(found?.empresaId).toBe("emp-1");
  });

  it("lists obligations by empresa", async () => {
    const { obligation: a } = createTransportObligation({ id: "to-a", empresaId: "emp-x" });
    const { obligation: b } = createTransportObligation({ id: "to-b", empresaId: "emp-y" });
    await repo.save(a);
    await repo.save(b);
    const list = await repo.findByEmpresaId("emp-x");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("to-a");
  });

  it("stores expedition link uniquely by expedition id", async () => {
    await repo.saveExpeditionLink({
      expeditionId: "srv-1",
      transportObligationId: "to-link",
      linkedAt: "2026-06-28T12:00:00Z",
      linkedBy: null,
    });
    const link = await repo.findLinkByExpeditionId("srv-1");
    expect(link?.transportObligationId).toBe("to-link");
  });
});
