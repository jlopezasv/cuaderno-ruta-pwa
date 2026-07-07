import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObtenerExpedicionWorkspaceQuery } from "./ObtenerExpedicionWorkspaceQuery.js";
import { EXPEDIENTE_ESTADO } from "../constants/EstadosExpedicion.js";

describe("ObtenerExpedicionWorkspaceQuery", () => {
  const repository = { obtenerWorkspace: vi.fn() };
  const query = new ObtenerExpedicionWorkspaceQuery(repository);

  beforeEach(() => vi.clearAllMocks());

  it("returns domain workspace projection", async () => {
    repository.obtenerWorkspace.mockResolvedValue({
      servicio: {
        id: "s1",
        estado: "en_curso",
        referencia: "__SRV_OP__:" + JSON.stringify({
          autonomo_expediente_v1: true,
          expediente_estado: EXPEDIENTE_ESTADO.ACTIVO,
        }),
      },
      stops: [{ id: "p1", servicio_id: "s1", tipo: "carga", nombre: "A", orden: 1, notas: "" }],
      cargas: [{ id: "p1", servicio_id: "s1", tipo: "carga", nombre: "A", orden: 1, notas: "" }],
      destinos: [],
      timeline: [{ id: "e1", type: "inicio", at: "2026-01-01", label: "Inicio" }],
    });

    const ws = await query.execute("s1");
    expect(ws.expedicion.id).toBe("s1");
    expect(ws.paradas).toHaveLength(1);
    expect(ws.cargas).toHaveLength(1);
    expect(ws.timeline).toHaveLength(1);
    expect(ws.operacionMuelle).toBeNull();
  });

  it("returns null when workspace is empty", async () => {
    repository.obtenerWorkspace.mockResolvedValue(null);
    expect(await query.execute("s1")).toBeNull();
  });
});
