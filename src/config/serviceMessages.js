import { isDemoApp } from "./appEnvironment.js";

/** Chat interno por servicio: activo solo en demo hasta UAT en producción. */
export function isServiceMessagesEnabled(_servicio = null) {
  return isDemoApp();
}
