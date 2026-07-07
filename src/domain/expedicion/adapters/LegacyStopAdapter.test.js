import { describe, it, expect } from "vitest";
import { toParada, toParadas } from "./LegacyStopAdapter.js";

describe("LegacyStopAdapter", () => {
  it("maps stop row to Parada domain object", () => {
    const stop = {
      id: "stp-1",
      servicio_id: "srv-1",
      tipo: "carga",
      nombre: "Almacén Alicante",
      orden: 1,
      notas: "Entrada muelle 3\n\n__CUADERNO_OP__:" + JSON.stringify({
        carga_estado: "completada",
        mercancia: { descripcion: "Palets", bultos: 12 },
      }),
    };

    const parada = toParada(stop);
    expect(parada).not.toBeNull();
    expect(parada.id).toBe("stp-1");
    expect(parada.servicioId).toBe("srv-1");
    expect(parada.tipo).toBe("carga");
    expect(parada.nombre).toBe("Almacén Alicante");
    expect(parada.orden).toBe(1);
    expect(parada.notasVisible).toBe("Entrada muelle 3");
    expect(parada.meta.carga_estado).toBe("completada");
    expect(parada.meta.mercancia.bultos).toBe(12);
  });

  it("returns null for invalid input", () => {
    expect(toParada(null)).toBeNull();
  });

  it("maps array of stops preserving order", () => {
    const stops = [
      { id: "a", servicio_id: "s", tipo: "carga", nombre: "A", orden: 1, notas: "" },
      { id: "b", servicio_id: "s", tipo: "descarga", nombre: "B", orden: 2, notas: "" },
    ];
    const paradas = toParadas(stops);
    expect(paradas).toHaveLength(2);
    expect(paradas[0].id).toBe("a");
    expect(paradas[1].id).toBe("b");
  });
});
