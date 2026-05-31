import { isDemoApp } from "./appEnvironment.js";

/** Documentos empresa en servicio — solo entorno DEMO (no producción). */
export function isEmpresaServicioDocumentsDemoEnabled() {
  return isDemoApp();
}
