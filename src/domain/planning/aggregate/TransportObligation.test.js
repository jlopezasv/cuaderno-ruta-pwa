import { describe, it, expect } from "vitest";
import { TRANSPORT_OBLIGATION_STATE } from "../constants/EstadosTransportObligation.js";
import { TRANSPORT_OBLIGATION_EVENT } from "../constants/EventosTransportObligation.js";
import {
  createTransportObligation,
  linkExpeditionToTransportObligation,
  planTransportObligation,
  cancelTransportObligation,
  replanTransportObligation,
  splitTransportObligation,
} from "../aggregate/TransportObligation.js";
import { BusinessRuleError } from "../../shared/BusinessRuleError.js";

const NOW = "2026-06-28T10:00:00.000Z";

describe("TransportObligation aggregate", () => {
  it("creates obligation in RECEIVED state with domain event", () => {
    const { obligation, events } = createTransportObligation({
      id: "to-1",
      empresaId: "emp-1",
      externalReference: { source: "wms", externalId: "WMS-99" },
      now: NOW,
    });

    expect(obligation.id).toBe("to-1");
    expect(obligation.state).toBe(TRANSPORT_OBLIGATION_STATE.RECEIVED);
    expect(obligation.expeditionIds).toEqual([]);
    expect(obligation.externalReference?.externalId).toBe("WMS-99");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(TRANSPORT_OBLIGATION_EVENT.RECEIVED);
  });

  it("transitions RECEIVED → PLANNED", () => {
    const { obligation } = createTransportObligation({ id: "to-2", now: NOW });
    const { obligation: planned, events } = planTransportObligation(obligation, NOW);

    expect(planned.state).toBe(TRANSPORT_OBLIGATION_STATE.PLANNED);
    expect(events[0].type).toBe(TRANSPORT_OBLIGATION_EVENT.PLANNED);
  });

  it("links expedition and moves to IN_EXECUTION", () => {
    const { obligation } = createTransportObligation({ id: "to-3", now: NOW });
    const { obligation: planned } = planTransportObligation(obligation, NOW);
    const { obligation: linked, events } = linkExpeditionToTransportObligation(
      planned,
      "srv-1",
      NOW
    );

    expect(linked.expeditionIds).toEqual(["srv-1"]);
    expect(linked.state).toBe(TRANSPORT_OBLIGATION_STATE.IN_EXECUTION);
    expect(events.some((e) => e.type === TRANSPORT_OBLIGATION_EVENT.EXPEDITION_LINKED)).toBe(true);
    expect(events.some((e) => e.type === TRANSPORT_OBLIGATION_EVENT.EXECUTION_STARTED)).toBe(true);
  });

  it("rejects duplicate expedition link", () => {
    const { obligation } = createTransportObligation({ id: "to-4", now: NOW });
    const { obligation: linked } = linkExpeditionToTransportObligation(obligation, "srv-1", NOW);

    expect(() => linkExpeditionToTransportObligation(linked, "srv-1", NOW)).toThrow(BusinessRuleError);
  });

  it("allows multiple expeditions on same obligation", () => {
    const { obligation } = createTransportObligation({ id: "to-5", now: NOW });
    const { obligation: withFirst } = linkExpeditionToTransportObligation(obligation, "srv-a", NOW);
    const { obligation: withSecond } = linkExpeditionToTransportObligation(withFirst, "srv-b", NOW);

    expect(withSecond.expeditionIds).toEqual(["srv-a", "srv-b"]);
  });

  it("cancels non-terminal obligation", () => {
    const { obligation } = createTransportObligation({ id: "to-6", now: NOW });
    const { obligation: cancelled, events } = cancelTransportObligation(obligation, NOW);

    expect(cancelled.state).toBe(TRANSPORT_OBLIGATION_STATE.CANCELLED);
    expect(cancelled.cancelledAt).toBe(NOW);
    expect(events[0].type).toBe(TRANSPORT_OBLIGATION_EVENT.CANCELLED);
  });

  it("replan creates superseded obligation and replacement", () => {
    const { obligation } = createTransportObligation({ id: "to-7", now: NOW });
    const { obligation: planned } = planTransportObligation(obligation, NOW);
    const result = replanTransportObligation(planned, "to-7-r1", NOW);

    expect(result.supersededObligation.state).toBe(TRANSPORT_OBLIGATION_STATE.SUPERSEDED);
    expect(result.supersededObligation.supersededByObligationId).toBe("to-7-r1");
    expect(result.replacementObligation.state).toBe(TRANSPORT_OBLIGATION_STATE.PLANNED);
    expect(result.replacementObligation.replanVersion).toBe(1);
    expect(result.replacementObligation.parentObligationId).toBe("to-7");
  });

  it("split marks obligation as superseded with children", () => {
    const { obligation } = createTransportObligation({ id: "to-8", now: NOW });
    const { obligation: split, events } = splitTransportObligation(
      obligation,
      ["to-8-a", "to-8-b"],
      NOW
    );

    expect(split.state).toBe(TRANSPORT_OBLIGATION_STATE.SUPERSEDED);
    expect(split.childObligationIds).toEqual(["to-8-a", "to-8-b"]);
    expect(events[0].type).toBe(TRANSPORT_OBLIGATION_EVENT.SPLIT);
  });
});
