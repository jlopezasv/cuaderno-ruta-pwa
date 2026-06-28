import { describe, it, expect } from "vitest";
import {
  resolveProximaAccionPrincipal,
  splitCargasByRole,
  OPERATION_KIND,
} from "./operationalVisualModel.js";

describe("resolveProximaAccionPrincipal", () => {
  const cargaIda = {
    id: "c1",
    tipo: "carga",
    nombre: "Alicante",
    notas: "__CUADERNO_OP__:{\"carga_estado\":\"completada\"}",
  };
  const retorno = {
    id: "r1",
    tipo: "carga",
    nombre: "Aldi Albatera",
    notas: "__CUADERNO_OP__:{\"carga_estado\":\"pendiente_entrada\",\"es_retorno\":true}",
  };
  const destinoElEjido = {
    id: "d1",
    tipo: "descarga",
    nombre: "Almacén El Ejido",
    notas: "__CUADERNO_OP__:{\"destino_estado\":\"pendiente\"}",
  };

  it("prioriza descarga principal sobre retorno pendiente", () => {
    const proxima = resolveProximaAccionPrincipal({
      cargas: [cargaIda, retorno],
      destinos: [destinoElEjido],
    });
    expect(proxima.kind).toBe(OPERATION_KIND.DESCARGA);
    expect(proxima.stop?.id).toBe("d1");
    expect(proxima.primaryLabel).toContain("descarga");
  });

  it("separa cargas principales de retornos", () => {
    const { cargasPrincipal, cargasRetorno } = splitCargasByRole([cargaIda, retorno]);
    expect(cargasPrincipal).toHaveLength(1);
    expect(cargasRetorno).toHaveLength(1);
  });
});
