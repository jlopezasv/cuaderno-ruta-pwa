import { describe, it, expect } from "vitest";
import { resolveConductorDecaAccess } from "./conductorDecaAccess.js";

describe("resolveConductorDecaAccess", () => {
  it("sin DeCA: el conductor no ve documento ni PDF", () => {
    const access = resolveConductorDecaAccess({});
    expect(access.canViewDocument).toBe(false);
    expect(access.canDownloadPdf).toBe(false);
    expect(access.canShowQr).toBe(false);
    expect(access.quickVisual).toBe("none");
  });

  it("DeCA de empresa con PDF y sin validar: ver, descargar y QR", () => {
    const access = resolveConductorDecaAccess({
      hasDcdt: true,
      isValidated: false,
      hasPdfStorage: true,
      downloadUrl: "https://example.test/deca",
    });
    expect(access.canViewDocument).toBe(true);
    expect(access.canDownloadPdf).toBe(true);
    expect(access.canShowQr).toBe(true);
    expect(access.quickVisual).toBe("validated");
  });

  it("DeCA creado sin PDF: ver datos, botón en aviso", () => {
    const access = resolveConductorDecaAccess({
      hasDcdt: true,
      isValidated: false,
      hasPdfStorage: false,
      downloadUrl: "",
    });
    expect(access.canViewDocument).toBe(true);
    expect(access.canDownloadPdf).toBe(false);
    expect(access.canShowQr).toBe(false);
    expect(access.quickVisual).toBe("incomplete");
  });
});
