import { describe, it, expect } from "vitest";
import {
  toInventarioActual,
  toInventarioVivo,
  toVersionesDecaHistorial,
  toEventosTimeline,
} from "./LegacyInventarioAdapter.js";

describe("LegacyInventarioAdapter", () => {
  it("maps inventario actual payload", () => {
    const inv = toInventarioActual("s1", {
      stock: [{ line_key: "k1", descripcion_mercancia: "Cajas", cantidad_actual: 3 }],
      documento: { id: "d1", estado: "actual", version: 2, qr_token: "qr" },
    });

    expect(inv.servicioId).toBe("s1");
    expect(inv.lineas).toHaveLength(1);
    expect(inv.cartaDePorte.version).toBe(2);
  });

  it("maps inventario vivo payload", () => {
    const vivo = toInventarioVivo({
      servicio_id: "s2",
      stock_actual: [{ line_key: "k2", descripcion_mercancia: "X", cantidad_actual: 1 }],
      documento: null,
      ultimos_movimientos: [{ id: "m1", servicio_id: "s2", tipo_movimiento: "CARGA" }],
    });

    expect(vivo.servicioId).toBe("s2");
    expect(vivo.ultimosMovimientos).toHaveLength(1);
  });

  it("maps version historial rows", () => {
    const versions = toVersionesDecaHistorial([
      { id: "v1", version: 1, motivo: "recalculo", creado_en: "2026-01-01" },
    ]);
    expect(versions[0].version).toBe(1);
  });

  it("maps timeline events", () => {
    const events = toEventosTimeline([
      { id: "e1", type: "carga", at: "2026-01-01", label: "Carga", stopId: "p1" },
    ]);
    expect(events[0].paradaId).toBe("p1");
  });
});
