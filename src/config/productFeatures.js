import { isDemoApp } from "./appEnvironment.js";

/**
 * Capacidades de producto (antes acotadas al entorno demo).
 * `isDemoApp()` queda solo para seguridad Supabase, credenciales demo y hints de login.
 */

/** Planificador empresa: mapa operativo + pestaña mapa/ruta. */
export function isPlanificadorMapaBetaEnabled() {
  return true;
}

/** Conductores empresa: banda progreso, ubicación en vivo, layout compacto. */
export function isConductoresEmpresaEnhancedUiEnabled() {
  return true;
}

/** Documentos empresa: cabecera compacta, fila horizontal de expedientes, envío cliente. */
export function isDocumentosEmpresaEnhancedUiEnabled() {
  return true;
}

/** Geocodificación local (catálogo CP/ciudades) cuando no hay coordenadas almacenadas. */
export function isLocalGeoCatalogEnabled() {
  return true;
}

/** Modal envío documentación al cliente (UI ampliada). */
export function isClienteMailEnhancedUiEnabled() {
  return true;
}

/** Panel empresa usable sin esperar `empresa_status === approved` (comportamiento demo). */
export function isEmpresaImmediateAccessEnabled() {
  return true;
}

/** Conductor: pestañas PARADAS + MÁS, lista plana de paradas y detalle operativo. */
export function isConductorSimplifiedParadasUiEnabled() {
  return true;
}

export function isAutonomoExpedienteFlowEnabled() {
  return true;
}

/** Pestaña inicial del shell conductor. */
export function getConductorDefaultTabId({ autonomoExpediente = false } = {}) {
  if (autonomoExpediente) return "expediente";
  return isConductorSimplifiedParadasUiEnabled() ? "paradas" : "servicio";
}

/** Expediente operacional: CMR principal + miniaturas + OCR acotado por parada. */
export function isExpedientePrincipalCmrUiEnabled() {
  return isDemoApp();
}
