import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryTransportObligationRepository } from "../repositories/InMemoryTransportObligationRepository.js";
import { CrearTransportObligationCommand } from "./CrearTransportObligationCommand.js";
import { PlanificarTransportObligationCommand } from "./PlanificarTransportObligationCommand.js";
import { CancelarTransportObligationCommand } from "./CancelarTransportObligationCommand.js";
import { ReplanificarTransportObligationCommand } from "./ReplanificarTransportObligationCommand.js";
import { VincularExpedicionObligationCommand } from "./VincularExpedicionObligationCommand.js";
import { ActualizarTransportObligationCommand } from "./ActualizarTransportObligationCommand.js";
import { TRANSPORT_OBLIGATION_STATE } from "../constants/EstadosTransportObligation.js";
import { ObtenerObligationPorExpedicionQuery } from "../queries/ObtenerObligationPorExpedicionQuery.js";

describe("Planning commands", () => {
  /** @type {InMemoryTransportObligationRepository} */
  let repo;

  beforeEach(() => {
    repo = new InMemoryTransportObligationRepository();
  });

  it("CrearTransportObligationCommand persists RECEIVED obligation", async () => {
    const cmd = new CrearTransportObligationCommand(repo);
    const result = await cmd.execute({
      id: "to-cmd-1",
      empresaId: "emp-1",
      externalReference: { source: "api", externalId: "EXT-1" },
    });
    expect(result.ok).toBe(true);
    expect(result.value.obligation.state).toBe(TRANSPORT_OBLIGATION_STATE.RECEIVED);
  });

  it("PlanificarTransportObligationCommand transitions to PLANNED", async () => {
    await new CrearTransportObligationCommand(repo).execute({ id: "to-cmd-2" });
    const result = await new PlanificarTransportObligationCommand(repo).execute("to-cmd-2");
    expect(result.ok).toBe(true);
    expect(result.value.obligation.state).toBe(TRANSPORT_OBLIGATION_STATE.PLANNED);
  });

  it("CancelarTransportObligationCommand cancels obligation", async () => {
    await new CrearTransportObligationCommand(repo).execute({ id: "to-cmd-3" });
    const result = await new CancelarTransportObligationCommand(repo).execute("to-cmd-3");
    expect(result.ok).toBe(true);
    expect(result.value.obligation.state).toBe(TRANSPORT_OBLIGATION_STATE.CANCELLED);
  });

  it("ReplanificarTransportObligationCommand creates replacement", async () => {
    await new CrearTransportObligationCommand(repo).execute({ id: "to-cmd-4" });
    await new PlanificarTransportObligationCommand(repo).execute("to-cmd-4");
    const result = await new ReplanificarTransportObligationCommand(repo).execute(
      "to-cmd-4",
      "to-cmd-4-r"
    );
    expect(result.ok).toBe(true);
    expect(result.value.supersededObligation.state).toBe(TRANSPORT_OBLIGATION_STATE.SUPERSEDED);
    expect(result.value.replacementObligation.id).toBe("to-cmd-4-r");
  });

  it("VincularExpedicionObligationCommand links expedition without side effects", async () => {
    await new CrearTransportObligationCommand(repo).execute({ id: "to-cmd-5" });
    const linkResult = await new VincularExpedicionObligationCommand(repo).execute({
      transportObligationId: "to-cmd-5",
      expeditionId: "srv-link-1",
    });
    expect(linkResult.ok).toBe(true);
    expect(linkResult.value.obligation.expeditionIds).toContain("srv-link-1");

    const queryResult = await new ObtenerObligationPorExpedicionQuery(repo).execute("srv-link-1");
    expect(queryResult?.obligation.id).toBe("to-cmd-5");
  });

  it("ActualizarTransportObligationCommand updates lines", async () => {
    await new CrearTransportObligationCommand(repo).execute({ id: "to-cmd-6", empresaId: "emp-1" });
    const result = await new ActualizarTransportObligationCommand(repo).execute("to-cmd-6", {
      lines: [
        {
          lineId: "line-1",
          description: "Carga general",
          quantity: 5,
          unit: "pal",
          originLocationRef: "Origen A",
          destinationLocationRef: "Destino B",
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.value.obligation.lines[0].originLocationRef).toBe("Origen A");
  });
});
