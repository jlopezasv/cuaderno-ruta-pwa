import { describe, it, expect } from "vitest";
import { toMovimientoMercancia, toMovimientosMercancia } from "./LegacyMovimientoAdapter.js";

describe("LegacyMovimientoAdapter", () => {
  it("maps deca movimiento row to domain object", () => {
    const mov = toMovimientoMercancia({
      id: "m1",
      servicio_id: "s1",
      tipo_movimiento: "CARGA",
      descripcion_mercancia: "Palets",
      cantidad: 12,
      unidad: "palets",
      peso_kg: 500,
      fecha_hora: "2026-06-01T08:00:00Z",
      parada_id: "p1",
    });

    expect(mov.id).toBe("m1");
    expect(mov.tipoMovimiento).toBe("CARGA");
    expect(mov.paradaId).toBe("p1");
  });

  it("toMovimientosMercancia maps array", () => {
    const list = toMovimientosMercancia([{ id: "a", servicio_id: "s" }, { id: "b", servicio_id: "s" }]);
    expect(list).toHaveLength(2);
  });
});
