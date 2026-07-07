import { describe, it, expect } from "vitest";
import { rowToTransportObligation, transportObligationToRow } from "./TransportObligationRowMapper.js";
import { TRANSPORT_OBLIGATION_STATE } from "../constants/EstadosTransportObligation.js";

describe("TransportObligationRepository mappers", () => {
  it("round-trips obligation row mapping", () => {
    const obligation = {
      id: "to-map-1",
      empresaId: "emp-1",
      state: TRANSPORT_OBLIGATION_STATE.PLANNED,
      externalReference: { source: "wms", externalId: "W-1", correlationId: "c-1" },
      expeditionIds: ["srv-1"],
      lines: [{ lineId: "l1", description: "Pallets", quantity: 10, unit: "pal" }],
      parentObligationId: null,
      childObligationIds: [],
      supersededByObligationId: null,
      mergedIntoObligationId: null,
      replanVersion: 0,
      cancelledAt: null,
      fulfilledAt: null,
      createdAt: "2026-06-28T10:00:00Z",
      updatedAt: "2026-06-28T10:00:00Z",
      planningDomainSchemaVersion: 1,
    };

    const row = transportObligationToRow(obligation);
    const mapped = rowToTransportObligation({
      ...row,
      created_at: obligation.createdAt,
    });

    expect(mapped.id).toBe("to-map-1");
    expect(mapped.state).toBe(TRANSPORT_OBLIGATION_STATE.PLANNED);
    expect(mapped.externalReference?.externalId).toBe("W-1");
    expect(mapped.expeditionIds).toEqual(["srv-1"]);
  });
});
