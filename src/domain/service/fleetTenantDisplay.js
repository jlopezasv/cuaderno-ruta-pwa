import { getServicioOperacionMeta } from "./serviceOperacionMeta.js";
import { normalizeServicioEmpresaId } from "./serviceOwnership.js";

/** Etiqueta comercial de empresa en meta de servicio (solo UI; no cambia tenanting). */
export function getFleetTenantDisplayFromServicio(servicio) {
  if (!servicio) return null;
  const meta = getServicioOperacionMeta(servicio);
  const nombre = String(
    meta.fleet_tenant_nombre || meta.fleet_tenant_label || meta.empresa_nombre || "",
  ).trim();
  if (!nombre) return null;
  return {
    nombre,
    logo_url: meta.fleet_tenant_logo_url || meta.empresa_logo_url || null,
  };
}

export function buildFleetTenantMetaPatch({ nombre, logo_url = null } = {}) {
  const n = String(nombre || "").trim();
  if (!n) return {};
  return {
    fleet_tenant_nombre: n,
    ...(logo_url ? { fleet_tenant_logo_url: logo_url } : {}),
  };
}

/** Mapa empresa_id → { nombre, logo_url } desde filas de servicios ya cargadas. */
export function extractFleetTenantLabelsFromServicios(servicios) {
  const out = {};
  (Array.isArray(servicios) ? servicios : []).forEach((sv) => {
    const empresaId = normalizeServicioEmpresaId(sv?.empresa_id);
    if (!empresaId) return;
    const display = getFleetTenantDisplayFromServicio(sv);
    if (display?.nombre) out[empresaId] = display;
  });
  return out;
}
