import { describe, it, expect, vi, beforeEach } from "vitest";

import {

  SERVICIO_OWNERSHIP,

  resolveServicioInsertContext,

  conductorOwnsServicio,

  buildConductorOwnServiciosQuery,

  buildAutonomoProOwnServiciosQuery,

  isAutonomoProOwnServicio,

  isFleetTenantServicio,

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



  it("Autónomo PRO: empresa_id null aunque exista vínculo flota en sbSelect", async () => {

    sbSelect.mockResolvedValueOnce([{ id: "emp-fleet" }]);

    const ctx = await resolveServicioInsertContext({

      ownershipMode: SERVICIO_OWNERSHIP.AUTONOMO_PRO,

      empresaIdProp: "emp-should-ignore",

    });

    expect(ctx).toEqual({

      empresa_id: null,

      conductor_id: "user-abc",

      estado: "asignado",

    });

    expect(sbSelect).not.toHaveBeenCalled();

  });



  it("Flota: infiere empresa por owner", async () => {

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



  it("isAutonomoProOwnServicio / isFleetTenantServicio", () => {

    expect(isAutonomoProOwnServicio({ id: "s1", empresa_id: null })).toBe(true);

    expect(isAutonomoProOwnServicio({ id: "s1", empresa_id: "e1" })).toBe(false);

    expect(isFleetTenantServicio({ id: "s1", empresa_id: "e1" })).toBe(true);

  });



  it("buildConductorOwnServiciosQuery sin filtro tenant", () => {

    expect(buildConductorOwnServiciosQuery("uid-1")).toContain("conductor_id=eq.uid-1");

    expect(buildConductorOwnServiciosQuery("uid-1")).not.toContain("empresa_id=is.null");

  });



  it("buildAutonomoProOwnServiciosQuery filtra empresa_id null", () => {

    const q = buildAutonomoProOwnServiciosQuery("uid-1");

    expect(q).toContain("conductor_id=eq.uid-1");

    expect(q).toContain("empresa_id=is.null");

  });

});

