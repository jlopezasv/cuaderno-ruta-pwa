import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryOperationalSessionRepository } from "./InMemoryOperationalSessionRepository.js";
import { openOperationalSession } from "../aggregate/OperationalSession.js";
import { closeOperationalSession } from "../aggregate/OperationalSession.js";

describe("InMemoryOperationalSessionRepository", () => {
  /** @type {InMemoryOperationalSessionRepository} */
  let repo;

  beforeEach(() => {
    repo = new InMemoryOperationalSessionRepository();
  });

  it("stores and finds active session by expedition", async () => {
    const { session } = openOperationalSession({
      id: "os-m1",
      expeditionId: "srv-1",
      location: { locationId: null, name: "Dock A", address: null, role: "dock" },
    });
    await repo.save(session);
    const active = await repo.findActiveByExpeditionId("srv-1");
    expect(active?.id).toBe("os-m1");
  });

  it("separates history from active session", async () => {
    const { session } = openOperationalSession({
      id: "os-m2",
      expeditionId: "srv-2",
      location: { locationId: null, name: "Dock B", address: null, role: "dock" },
    });
    const { session: closed } = closeOperationalSession(session);
    await repo.save(closed);
    expect(await repo.findActiveByExpeditionId("srv-2")).toBeNull();
    expect(await repo.findHistoryByExpeditionId("srv-2")).toHaveLength(1);
  });
});
