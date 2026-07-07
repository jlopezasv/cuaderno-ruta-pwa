import { describe, it, expect } from "vitest";
import {
  getTransportObligationIdFromServicio,
  enrichExpedicionWithTransportObligationId,
} from "./ExpeditionObligationLinkAdapter.js";
import { toExpedicion } from "../../expedicion/adapters/LegacyServicioAdapter.js";

describe("ExpeditionObligationLinkAdapter", () => {
  it("reads transport_obligation_id from servicio meta when present", () => {
    const servicio = {
      id: "srv-1",
      referencia: "__SRV_OP__:" + JSON.stringify({ transport_obligation_id: "to-meta-1" }),
    };
    expect(getTransportObligationIdFromServicio(servicio)).toBe("to-meta-1");
  });

  it("returns null when meta link is absent (legacy servicios)", () => {
    expect(getTransportObligationIdFromServicio({ id: "srv-2", referencia: "REF" })).toBeNull();
  });

  it("toExpedicion includes transportObligationId when meta present", () => {
    const servicio = {
      id: "srv-3",
      estado: "asignado",
      referencia: "VIAJE\n__SRV_OP__:" + JSON.stringify({ transport_obligation_id: "to-meta-2" }),
    };
    const exp = toExpedicion(servicio);
    expect(exp?.transportObligationId).toBe("to-meta-2");
  });

  it("enrichExpedicionWithTransportObligationId merges link from repository", () => {
    const exp = toExpedicion({ id: "srv-4", estado: "en_curso", referencia: "" });
    const enriched = enrichExpedicionWithTransportObligationId(exp, "to-repo-1");
    expect(enriched?.transportObligationId).toBe("to-repo-1");
  });
});
