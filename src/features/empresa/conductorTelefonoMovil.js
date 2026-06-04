/** Teléfono móvil principal: prioridad flota (conductor_empresa) y perfil del conductor. */
export function resolveConductorTelefonoMovil(conductor) {
  const fleet = String(conductor?.telefono_movil ?? conductor?.telefonoMovil ?? "").trim();
  if (fleet) return fleet;
  return String(conductor?.telefono ?? "").trim();
}

export function formatConductorTelefonoDisplay(telefono) {
  const t = String(telefono || "").trim();
  return t || "—";
}
