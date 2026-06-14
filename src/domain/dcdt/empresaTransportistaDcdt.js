/** Domicilio fiscal del transportista (empresa) para DCDT. */

function joinAddressParts(parts) {
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join(", ");
}

/**
 * Domicilio fiscal: empresas.direccion / domicilio_fiscal o perfil del owner.
 * @param {object|null} empresa — fila empresas
 * @param {object|null} ownerProfile — fila profiles del owner
 */
export function formatEmpresaDomicilioFiscal(empresa, ownerProfile = null) {
  const fromEmpresa = String(empresa?.domicilio_fiscal || empresa?.direccion || "").trim();
  if (fromEmpresa) {
    const extra = [empresa?.cp, empresa?.ciudad].map((x) => String(x || "").trim()).filter(Boolean);
    return extra.length ? `${fromEmpresa}, ${extra.join(" ")}` : fromEmpresa;
  }

  const p = ownerProfile || {};
  const line1 = String(p.direccion || "").trim();
  const line2 = [String(p.cp || "").trim(), String(p.ciudad || "").trim()].filter(Boolean).join(" ");
  return joinAddressParts([line1, line2]);
}

/** Razón social, CIF y domicilio del transportista para DCDT. */
export function resolveTransportistaDcdt(empresa, ownerProfile = null) {
  const nombre = String(empresa?.nombre || ownerProfile?.nombre || "").trim();
  const nif = String(empresa?.cif || ownerProfile?.cif || "").trim();
  const domicilio = formatEmpresaDomicilioFiscal(empresa, ownerProfile);
  return { nombre, nif, domicilio };
}
