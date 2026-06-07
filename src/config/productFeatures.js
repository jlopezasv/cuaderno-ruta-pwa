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
