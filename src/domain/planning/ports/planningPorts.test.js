import { describe, it, expect } from "vitest";
import { ExternalOrderSourcePort } from "./ExternalOrderSourcePort.js";
import { ErpConnectorPort } from "./ErpConnectorPort.js";
import { WmsConnectorPort } from "./WmsConnectorPort.js";
import { EdiConnectorPort } from "./EdiConnectorPort.js";
import { ApiConnectorPort } from "./ApiConnectorPort.js";
import { PlanningIntegrationPort } from "./PlanningIntegrationPort.js";

describe("Planning connector ports", () => {
  it("ExternalOrderSourcePort throws until implemented", async () => {
    const port = new ExternalOrderSourcePort();
    await expect(port.receiveObligation({ source: "api", externalId: "x" })).rejects.toThrow(
      /not implemented/
    );
  });

  it("ErpConnectorPort defines fetch and publish contracts", async () => {
    const port = new ErpConnectorPort();
    await expect(port.fetchPendingObligations({ empresaId: "e1" })).rejects.toThrow(/not implemented/);
  });

  it("WmsConnectorPort defines dispatch and preparation contracts", async () => {
    const port = new WmsConnectorPort();
    await expect(port.fetchDispatchObligations({ empresaId: "e1" })).rejects.toThrow(/not implemented/);
  });

  it("EdiConnectorPort defines inbound and status contracts", async () => {
    const port = new EdiConnectorPort();
    await expect(
      port.processInboundMessage({ messageType: "DESADV", interchangeId: "i1", rawPayload: "{}" })
    ).rejects.toThrow(/not implemented/);
  });

  it("ApiConnectorPort defines ingest and snapshot contracts", async () => {
    const port = new ApiConnectorPort();
    await expect(
      port.ingestObligation({ tenantKey: "t1" }, { source: "api", externalId: "a1" })
    ).rejects.toThrow(/not implemented/);
  });

  it("PlanningIntegrationPort defines orchestration contracts", async () => {
    const port = new PlanningIntegrationPort();
    expect(() => port.getCapabilities()).toThrow(/not implemented/);
  });
});
