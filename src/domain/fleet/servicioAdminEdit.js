/** Modos de edición administrativa (empresa) según estado del servicio. */

export function servicioAdminEditMode(estado) {
  if (!estado) return null;
  if (estado === "pendiente_asignacion" || estado === "asignado") return "wide";
  if (estado === "en_curso") return "limited";
  return null;
}
