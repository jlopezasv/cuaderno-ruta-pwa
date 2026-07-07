import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExpedicionRepository } from "./ExpedicionRepository.js";
import { EXPEDIENTE_ESTADO } from "../constants/EstadosExpedicion.js";

vi.mock("../../../modules/autonomo-expediente/autonomoExpedienteApi.js", () => ({
  loadAutonomoExpedienteWorkspace: vi.fn(),
  fetchAutonomoExpedientes: vi.fn(),
  fetchActiveAutonomoExpediente: vi.fn(),
}));

import {
  loadAutonomoExpedienteWorkspace,
  fetchAutonomoExpedientes,
  fetchActiveAutonomoExpediente,
} from "../../../modules/autonomo-expediente/autonomoExpedienteApi.js";

describe("ExpedicionRepository", () => {
  const repo = new ExpedicionRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates obtenerWorkspace to loadAutonomoExpedienteWorkspace", async () => {
    const workspace = { servicio: { id: "s1" }, stops: [] };
    loadAutonomoExpedienteWorkspace.mockResolvedValue(workspace);

    const result = await repo.obtenerWorkspace("s1");
    expect(loadAutonomoExpedienteWorkspace).toHaveBeenCalledWith("s1");
    expect(result).toBe(workspace);
  });

  it("obtenerServicio returns servicio from workspace", async () => {
    loadAutonomoExpedienteWorkspace.mockResolvedValue({
      servicio: { id: "s2", estado: "en_curso" },
      stops: [],
    });

    const servicio = await repo.obtenerServicio("s2");
    expect(servicio.id).toBe("s2");
  });

  it("obtenerExpedicion maps servicio to domain object", async () => {
    loadAutonomoExpedienteWorkspace.mockResolvedValue({
      servicio: {
        id: "s3",
        estado: "en_curso",
        referencia: "__SRV_OP__:" + JSON.stringify({
          autonomo_expediente_v1: true,
          expediente_estado: EXPEDIENTE_ESTADO.ACTIVO,
        }),
      },
      stops: [],
    });

    const exp = await repo.obtenerExpedicion("s3");
    expect(exp.id).toBe("s3");
    expect(exp.esAutonomoExpediente).toBe(true);
    expect(exp.estadoExpedicion).toBe(EXPEDIENTE_ESTADO.ACTIVO);
  });

  it("obtenerVistaDominio adds domain projections without mutating workspace", async () => {
    const workspace = {
      servicio: { id: "s4", estado: "en_curso", referencia: "" },
      stops: [{ id: "p1", servicio_id: "s4", tipo: "carga", nombre: "A", orden: 1, notas: "" }],
      timeline: [],
    };
    loadAutonomoExpedienteWorkspace.mockResolvedValue(workspace);

    const vista = await repo.obtenerVistaDominio("s4");
    expect(vista.expedicion.id).toBe("s4");
    expect(vista.paradas).toHaveLength(1);
    expect(vista.servicio).toBe(workspace.servicio);
  });

  it("listarPorConductor delegates to fetchAutonomoExpedientes", async () => {
    fetchAutonomoExpedientes.mockResolvedValue([{ id: "a" }]);
    const list = await repo.listarPorConductor("uid-1", { limit: 10 });
    expect(fetchAutonomoExpedientes).toHaveBeenCalledWith("uid-1", { limit: 10 });
    expect(list).toHaveLength(1);
  });

  it("obtenerActivaPorConductor delegates to fetchActiveAutonomoExpediente", async () => {
    fetchActiveAutonomoExpediente.mockResolvedValue({ id: "active" });
    const active = await repo.obtenerActivaPorConductor("uid-2");
    expect(fetchActiveAutonomoExpediente).toHaveBeenCalledWith("uid-2");
    expect(active.id).toBe("active");
  });
});
