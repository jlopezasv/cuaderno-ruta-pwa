/**
 * Preferencias de envío automático (futuro: al completar descarga, etc.).
 * Arquitectura preparada; la UI y el worker pueden leer/escribir `servicio.operacion_meta` o tabla dedicada.
 */
export const AUTO_SEND_DOC_TRIGGER = Object.freeze({
  ON_DESCARGA_COMPLETE: "on_descarga_complete",
});

/** @returns {null|{ trigger: string, destinatarios: string[] }} */
export function getAutoSendDocumentationPolicy(_servicio) {
  return null;
}
