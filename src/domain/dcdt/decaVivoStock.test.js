import { describe, it, expect } from "vitest";
import { DECA_VIVO_MOVIMIENTO } from "./decaVivoConstants.js";
import { recalcularStockDesdeMovimientos } from "./decaVivoStock.js";

/**
 * Caso de uso normativo: Alicante → Almería → El Ejido con retornos.
 * DeCA final: 20 palets vacíos, 30 cajas, 2 devoluciones — sin alimentación.
 */
describe("decaVivoStock — caso Alicante / El Ejido", () => {
  const movimientos = [
    {
      id: "1",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.CARGA,
      descripcion_mercancia: "Alimentación refrigerada",
      categoria_mercancia: "Alimentación",
      cantidad: 12,
      unidad: "palets",
      peso_kg: 5000,
      destino_nombre: "El Ejido",
      fecha_hora: "2026-06-01T08:00:00Z",
    },
    {
      id: "2",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.DESCARGA,
      descripcion_mercancia: "Alimentación refrigerada",
      categoria_mercancia: "Alimentación",
      cantidad: 6,
      unidad: "palets",
      peso_kg: 2500,
      fecha_hora: "2026-06-01T12:00:00Z",
    },
    {
      id: "3",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.CARGA_RETORNO,
      descripcion_mercancia: "Palets vacíos",
      cantidad: 12,
      unidad: "palets",
      destino_nombre: "almacén",
      fecha_hora: "2026-06-01T13:00:00Z",
    },
    {
      id: "4",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.DESCARGA,
      descripcion_mercancia: "Alimentación refrigerada",
      categoria_mercancia: "Alimentación",
      cantidad: 6,
      unidad: "palets",
      peso_kg: 2500,
      destino_nombre: "El Ejido",
      fecha_hora: "2026-06-01T16:00:00Z",
    },
    {
      id: "5",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.CARGA_RETORNO,
      descripcion_mercancia: "Palets vacíos",
      cantidad: 8,
      unidad: "palets",
      destino_nombre: "almacén",
      fecha_hora: "2026-06-01T17:00:00Z",
    },
    {
      id: "6",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.CARGA_RETORNO,
      descripcion_mercancia: "Cajas reutilizables",
      cantidad: 30,
      unidad: "cajas",
      destino_nombre: "almacén",
      fecha_hora: "2026-06-01T17:05:00Z",
    },
    {
      id: "7",
      tipo_movimiento: DECA_VIVO_MOVIMIENTO.DEVOLUCION,
      descripcion_mercancia: "Devoluciones comerciales",
      cantidad: 2,
      unidad: "bultos",
      origen_nombre: "cliente El Ejido",
      destino_nombre: "almacén",
      fecha_hora: "2026-06-01T17:10:00Z",
    },
  ];

  it("calcula inventario final sin alimentación descargada", () => {
    const stock = recalcularStockDesdeMovimientos(movimientos);

    const byDesc = Object.fromEntries(stock.map((l) => [l.descripcion_mercancia, l]));

    expect(byDesc["Alimentación refrigerada"]).toBeUndefined();

    expect(byDesc["Palets vacíos"].cantidad_actual).toBe(20);
    expect(byDesc["Cajas reutilizables"].cantidad_actual).toBe(30);
    expect(byDesc["Devoluciones comerciales"].cantidad_actual).toBe(2);
  });

  it("conserva destino previsto en retornos", () => {
    const stock = recalcularStockDesdeMovimientos(movimientos);
    const palets = stock.find((l) => l.descripcion_mercancia === "Palets vacíos");
    expect(palets?.destino_previsto).toBe("almacén");
  });
});
