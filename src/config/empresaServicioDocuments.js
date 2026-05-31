/**
 * Documentos de empresa en servicio (tabla servicio_documentos_empresa).
 * Solo servicios de flota con empresa_id; no aplica a autónomo sin empresa.
 */
export function isEmpresaServicioDocumentsEnabled(servicio) {
  return Boolean(servicio?.empresa_id);
}
