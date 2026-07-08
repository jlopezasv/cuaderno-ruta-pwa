import { describe, expect, it } from "vitest";
import { TRANSPORT_OBLIGATION_STATE } from "../../domain/planning/constants/EstadosTransportObligation.js";
import {
  CENTRO_LOGISTICO_BUCKET,
  buildCentroLogisticoObligationLines,
  centroLogisticoOperacionLabel,
  filterObligationsByCentroBucket,
  obligationCentroLogisticoBucket,
  resolveCentroLogisticoWizardStep,
} from "./centroLogisticoUi.js";

describe("centroLogisticoUi", () => {
  it("maps obligation states to centro buckets", () => {
    expect(obligationCentroLogisticoBucket({ state: TRANSPORT_OBLIGATION_STATE.RECEIVED })).toBe(
      CENTRO_LOGISTICO_BUCKET.PENDIENTES
    );
    expect(obligationCentroLogisticoBucket({ state: TRANSPORT_OBLIGATION_STATE.PLANNED })).toBe(
      CENTRO_LOGISTICO_BUCKET.PLANIFICADAS
    );
    expect(
      obligationCentroLogisticoBucket({ state: TRANSPORT_OBLIGATION_STATE.IN_EXECUTION })
    ).toBe(CENTRO_LOGISTICO_BUCKET.EN_EJECUCION);
    expect(obligationCentroLogisticoBucket({ state: TRANSPORT_OBLIGATION_STATE.FULFILLED })).toBe(
      CENTRO_LOGISTICO_BUCKET.FINALIZADAS
    );
  });

  it("filters obligations by bucket and hides superseded by default", () => {
    const rows = [
      { id: "1", state: TRANSPORT_OBLIGATION_STATE.RECEIVED },
      { id: "2", state: TRANSPORT_OBLIGATION_STATE.PLANNED },
      { id: "3", state: TRANSPORT_OBLIGATION_STATE.SUPERSEDED },
    ];
    expect(filterObligationsByCentroBucket(rows, CENTRO_LOGISTICO_BUCKET.PENDIENTES)).toHaveLength(
      1
    );
    expect(filterObligationsByCentroBucket(rows, CENTRO_LOGISTICO_BUCKET.PLANIFICADAS)).toHaveLength(
      1
    );
  });

  it("builds multiple destination lines", () => {
    const lines = buildCentroLogisticoObligationLines({
      cliente: "ACME",
      origen: "Madrid",
      destinos: ["Barcelona", "Valencia"],
      observaciones: "Urgente",
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].description).toBe("ACME");
    expect(lines[0].metadata.observaciones).toBe("Urgente");
    expect(lines[1].destinationLocationRef).toBe("Valencia");
  });

  it("labels multi-destination routes", () => {
    const label = centroLogisticoOperacionLabel({
      lines: [
        { originLocationRef: "Madrid", destinationLocationRef: "Barcelona" },
        { originLocationRef: "Madrid", destinationLocationRef: "Valencia" },
      ],
    });
    expect(label).toBe("Madrid → Barcelona (+1)");
  });

  it("resolves wizard step from obligation state", () => {
    expect(resolveCentroLogisticoWizardStep(null, null)).toBe("datos");
    expect(
      resolveCentroLogisticoWizardStep({ state: TRANSPORT_OBLIGATION_STATE.RECEIVED }, null)
    ).toBe("datos");
    expect(
      resolveCentroLogisticoWizardStep({ state: TRANSPORT_OBLIGATION_STATE.PLANNED }, null)
    ).toBe("recursos");
    expect(
      resolveCentroLogisticoWizardStep(
        { state: TRANSPORT_OBLIGATION_STATE.IN_EXECUTION },
        "srv-1",
        { servicioEstado: "pendiente_asignacion" }
      )
    ).toBe("enviar");
  });
});
