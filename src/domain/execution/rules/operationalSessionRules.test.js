import { describe, it, expect } from "vitest";
import { assertSessionAcceptsMovements, assertSessionBelongsToExpedition } from "./operationalSessionRules.js";
import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";
import { BusinessRuleError } from "../../shared/BusinessRuleError.js";

describe("operationalSessionRules", () => {
  const baseSession = {
    id: "os-r1",
    expeditionId: "srv-1",
    state: OPERATIONAL_SESSION_STATE.OPEN,
    movementRefs: [],
  };

  it("assertSessionBelongsToExpedition passes for matching expedition", () => {
    expect(() => assertSessionBelongsToExpedition(baseSession, "srv-1")).not.toThrow();
  });

  it("assertSessionBelongsToExpedition fails for wrong expedition", () => {
    expect(() => assertSessionBelongsToExpedition(baseSession, "srv-2")).toThrow(BusinessRuleError);
  });

  it("assertSessionAcceptsMovements fails when closed", () => {
    expect(() =>
      assertSessionAcceptsMovements({ ...baseSession, state: OPERATIONAL_SESSION_STATE.CLOSED })
    ).toThrow(BusinessRuleError);
  });
});
