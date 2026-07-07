import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryOperationalSessionRepository } from "../repositories/InMemoryOperationalSessionRepository.js";
import { AbrirOperationalSessionCommand } from "./AbrirOperationalSessionCommand.js";
import { CerrarOperationalSessionCommand } from "./CerrarOperationalSessionCommand.js";
import { CancelarOperationalSessionCommand } from "./CancelarOperationalSessionCommand.js";
import { RegistrarMovimientoEnSesionCommand } from "./RegistrarMovimientoEnSesionCommand.js";
import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";

const LOCATION = { locationId: null, name: "Muelle 2", address: null, role: "dock" };

describe("Execution commands", () => {
  /** @type {InMemoryOperationalSessionRepository} */
  let repo;

  beforeEach(() => {
    repo = new InMemoryOperationalSessionRepository();
  });

  it("AbrirOperationalSessionCommand opens session", async () => {
    const result = await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-cmd-1",
      expeditionId: "srv-1",
      location: LOCATION,
    });
    expect(result.ok).toBe(true);
    expect(result.value.session.state).toBe(OPERATIONAL_SESSION_STATE.OPEN);
  });

  it("CerrarOperationalSessionCommand closes session", async () => {
    await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-cmd-2",
      expeditionId: "srv-2",
      location: LOCATION,
    });
    const result = await new CerrarOperationalSessionCommand(repo).execute("srv-2", "os-cmd-2");
    expect(result.ok).toBe(true);
    expect(result.value.session.state).toBe(OPERATIONAL_SESSION_STATE.CLOSED);
  });

  it("CancelarOperationalSessionCommand cancels session", async () => {
    await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-cmd-3",
      expeditionId: "srv-3",
      location: LOCATION,
    });
    const result = await new CancelarOperationalSessionCommand(repo).execute(
      "srv-3",
      "os-cmd-3",
      "Entrada errónea"
    );
    expect(result.ok).toBe(true);
    expect(result.value.session.state).toBe(OPERATIONAL_SESSION_STATE.CANCELLED);
  });

  it("RegistrarMovimientoEnSesionCommand adds movement ref", async () => {
    await new AbrirOperationalSessionCommand(repo).execute({
      id: "os-cmd-4",
      expeditionId: "srv-4",
      location: LOCATION,
    });
    const result = await new RegistrarMovimientoEnSesionCommand(repo).execute(
      "srv-4",
      "os-cmd-4",
      {
        sessionMovementId: "carga-1",
        decaMovimientoId: "mov-1",
        tipoSesion: "carga",
        estado: "vigente",
        registeredAt: "2026-06-28T10:00:00Z",
      }
    );
    expect(result.ok).toBe(true);
    expect(result.value.session.movementRefs).toHaveLength(1);
  });
});
