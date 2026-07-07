import { describe, it, expect } from "vitest";
import {
  canTransitionTransportObligation,
  assertCanLinkExpedition,
  assertExpeditionNotAlreadyLinked,
} from "./transportObligationRules.js";
import { TRANSPORT_OBLIGATION_STATE } from "../constants/EstadosTransportObligation.js";
import { BusinessRuleError } from "../../shared/BusinessRuleError.js";

describe("transportObligationRules", () => {
  it("allows valid state transitions", () => {
    expect(
      canTransitionTransportObligation(
        TRANSPORT_OBLIGATION_STATE.RECEIVED,
        TRANSPORT_OBLIGATION_STATE.PLANNED
      )
    ).toBe(true);
    expect(
      canTransitionTransportObligation(
        TRANSPORT_OBLIGATION_STATE.FULFILLED,
        TRANSPORT_OBLIGATION_STATE.CANCELLED
      )
    ).toBe(false);
  });

  it("blocks linking expedition to fulfilled obligation", () => {
    expect(() =>
      assertCanLinkExpedition(
        {
          id: "to-1",
          state: TRANSPORT_OBLIGATION_STATE.FULFILLED,
          expeditionIds: [],
        },
        "srv-1"
      )
    ).toThrow(BusinessRuleError);
  });

  it("blocks expedition already linked elsewhere", () => {
    expect(() =>
      assertExpeditionNotAlreadyLinked(
        { expeditionId: "srv-1", transportObligationId: "to-9", linkedAt: "2026-01-01" },
        "srv-1"
      )
    ).toThrow(BusinessRuleError);
  });
});
