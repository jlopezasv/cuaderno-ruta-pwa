import { describe, it, expect } from "vitest";
import { obligationRouteFromLines } from "./obligationRouteFromLines.js";

describe("obligationRouteFromLines", () => {
  it("derives route from first line", () => {
    const route = obligationRouteFromLines([
      {
        lineId: "l1",
        description: "Palés alimentación",
        originLocationRef: "Alicante Hub",
        destinationLocationRef: "El Ejido",
        quantity: 10,
        unit: "pal",
      },
    ]);
    expect(route.origen).toBe("Alicante Hub");
    expect(route.destino).toBe("El Ejido");
  });

  it("falls back when lines empty", () => {
    expect(obligationRouteFromLines([])).toEqual({ origen: "Origen", destino: "Destino" });
  });
});
