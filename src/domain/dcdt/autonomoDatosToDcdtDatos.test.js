import { describe, it, expect } from "vitest";
import {
  autonomoDatosToDcdtDatos,
  canLinkAutonomoDecaToServicio,
  isAutonomoDecaLinkedToServicio,
} from "./autonomoDatosToDcdtDatos.js";
import { pickDcdtRoutePlace } from "./dcdtRoutePlace.js";

describe("autonomoDatosToDcdtDatos", () => {
  it("mapea cargador, vehículo y origen al JSON de dcdt_servicio", () => {
    const datos = autonomoDatosToDcdtDatos(
      {
        origen: { lugar: "Madrid", direccion: "Calle 1" },
        destino: { lugar: "Valencia" },
        vehiculo: { matricula: "1234 ABC", remolque: "R-1" },
        partes: { cargador: { nombre: "ACME", nif: "A123" }, destinatario: { nombre: "Dest" } },
        mercancia: { descripcion: "Palets", peso_kg: "1200,5", bultos: "10" },
      },
      { autonomoDecaId: "deca-1" },
    );
    expect(datos.partes.cargador_overrides.nombre).toBe("ACME");
    expect(datos.partes.cargador_overrides.nif).toBe("A123");
    expect(datos.partes.cargador_overrides.domicilio).toBe("Calle 1");
    expect(datos.vehiculo.matricula_override).toBe("1234 ABC");
    expect(datos.vehiculo.remolque_override).toBe("R-1");
    expect(datos.mercancia.descripcion).toBe("Palets");
    expect(datos.mercancia.peso_kg).toBe(1200.5);
    expect(datos.origen_lugar_override).toBe("Madrid");
    expect(datos.destino_lugar_override).toBe("Valencia");
    expect(datos.emitido_por_conductor).toBe(true);
    expect(datos.vinculado_deca_autonomo_id).toBe("deca-1");
  });

  it("no permite vincular un DeCA ya usado o archivado", () => {
    expect(canLinkAutonomoDecaToServicio({ id: "1", estado: "generado", datos: {} })).toBe(true);
    expect(
      canLinkAutonomoDecaToServicio({ id: "1", estado: "generado", datos: { vinculado_servicio_id: "sv" } }),
    ).toBe(false);
    expect(canLinkAutonomoDecaToServicio({ id: "1", estado: "archivado", datos: {} })).toBe(false);
    expect(isAutonomoDecaLinkedToServicio({ datos: { vinculado_servicio_id: "sv" } })).toBe(true);
  });
});

describe("pickDcdtRoutePlace", () => {
  it("prioriza el override del conductor si existe", () => {
    expect(pickDcdtRoutePlace("Parada A", "Madrid")).toBe("Madrid");
    expect(pickDcdtRoutePlace("Parada A", "")).toBe("Parada A");
    expect(pickDcdtRoutePlace("", "Valencia")).toBe("Valencia");
  });
});
