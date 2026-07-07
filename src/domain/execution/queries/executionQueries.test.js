import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryOperationalSessionRepository } from "../repositories/InMemoryOperationalSessionRepository.js";
import { AbrirOperationalSessionCommand } from "../commands/AbrirOperationalSessionCommand.js";
import { ObtenerSesionOperativaActivaQuery } from "./ObtenerSesionOperativaActivaQuery.js";
import { ListarSesionesOperativasExpedicionQuery } from "./ListarSesionesOperativasExpedicionQuery.js";
import { ObtenerSesionOperativaQuery } from "./ObtenerSesionOperativaQuery.js";

const LOCATION = { locationId: null, name: "Dock C", address: null, role: "dock" };

describe("Execution queries", () => {
  /** @type {InMemoryOperationalSessionRepository} */
  let repo;

  beforeEach(() => {
    repo = new InMemoryOperationalSessionRepository();
  });

  it("ObtenerSesionOperativaActivaQuery returns open session", async () => {
    await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-q1",
      expeditionId: "srv-q1",
      location: LOCATION,
    });
    const query = new ObtenerSesionOperativaActivaQuery(repo);
    const session = await query.execute("srv-q1");
    expect(session?.id).toBe("os-q1");
  });

  it("ListarSesionesOperativasExpedicionQuery lists all sessions", async () => {
    await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-q2",
      expeditionId: "srv-q2",
      location: LOCATION,
    });
    const list = await new ListarSesionesOperativasExpedicionQuery(repo).execute("srv-q2");
    expect(list).toHaveLength(1);
  });

  it("ObtenerSesionOperativaQuery finds session by id", async () => {
    await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-q3",
      expeditionId: "srv-q3",
      location: LOCATION,
    });
    const session = await new ObtenerSesionOperativaQuery(repo).execute("srv-q3", "os-q3");
    expect(session?.expeditionId).toBe("srv-q3");
  });
});
