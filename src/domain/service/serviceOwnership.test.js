import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SERVICIO_OWNERSHIP,
  resolveServicioInsertContext,
  conductorOwnsServicio,
  buildConductorOwnServiciosQuery,
} from "./serviceOwnership.js";

vi.mock("../../data/supabaseClient.js", () => ({
  getAuthUid: vi.fn(() => "user-abc"),
  getUserId: vi.fn(() => "user-abc"),
  sbSelect: vi.fn(),
}));

import { sbSelect } from "../../data/supabaseClient.js";

describe("serviceOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Autónomo PRO: empresa_id null, conductor_id = auth.uid, estado asignado", async () => {
    const ctx = await resolveServicioInsertContext({
      ownershipMode: SERVICIO_OWNERSHIP.AUTONOMO_PRO,
    });
    expect(ctx).toEqual({
      empresa_id: null,
      conductor_id: "user-abc",
      estado: "asignado",
    });
    expect(sbSelect).not.toHaveBeenCalled();
  });

  it("Flota: no infiere empresa si modo autonomo aunque exista owner", async () => {
    sbSelect.mockResolvedValueOnce([{ id: "emp-1" }]);
    const ctx = await resolveServicioInsertContext({
      ownershipMode: SERVICIO_OWNERSHIP.FLEET_EMPRESA,
      conductorIdProp: null,
    });
    expect(ctx.empresa_id).toBe("emp-1");
    expect(ctx.estado).toBe("pendiente_asignacion");
  });

  it("conductorOwnsServicio", () => {
    expect(conductorOwnsServicio({ id: "s1", conductor_id: "u1" }, "u1")).toBe(true);
    expect(conductorOwnsServicio({ id: "s1", conductor_id: "u2" }, "u1")).toBe(false);
  });

  it("buildConductorOwnServiciosQuery", () => {
    expect(buildConductorOwnServiciosQuery("uid-1")).toContain("conductor_id=eq.uid-1");
  });
});
