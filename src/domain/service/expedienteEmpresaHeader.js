import { isDemoApp } from "../../config/appEnvironment.js";
import { DEMO_FLEET_TENANT_LABELS } from "../../config/demoFleetTenantLabels.js";
import { sbFetch } from "../../data/supabaseClient.js";
import { getFleetTenantDisplayFromServicio } from "./fleetTenantDisplay.js";
import { normalizeServicioEmpresaId } from "./serviceOwnership.js";

/**
 * Cabecera de empresa para expediente operacional (solo DEMO).
 * Prioridad: perfil empresa en sesión → REST `empresas` → etiquetas demo → meta servicio.
 */
export async function resolveExpedienteEmpresaHeaderForServicio(servicio, localEmpresa = null) {
  if (!isDemoApp()) return null;
  const eid = normalizeServicioEmpresaId(servicio?.empresa_id);
  if (!eid) return null;

  const localId = normalizeServicioEmpresaId(localEmpresa?.id);
  if (localId === eid) {
    const nombre = String(localEmpresa?.nombre || "").trim();
    if (nombre) {
      return {
        nombre,
        cif: String(localEmpresa?.cif || "").trim() || null,
      };
    }
  }

  try {
    const res = await sbFetch(
      `/rest/v1/empresas?id=eq.${encodeURIComponent(eid)}&select=id,nombre,cif`,
    );
    if (res.ok) {
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.nombre) {
        return {
          nombre: String(row.nombre).trim(),
          cif: String(row.cif || "").trim() || null,
        };
      }
    }
  } catch {
    /* RLS u offline */
  }

  const demo = DEMO_FLEET_TENANT_LABELS[eid];
  if (demo?.nombre) {
    return {
      nombre: String(demo.nombre).trim(),
      cif: String(demo.cif || "").trim() || null,
    };
  }

  const fromMeta = getFleetTenantDisplayFromServicio(servicio)?.nombre;
  if (fromMeta) {
    return { nombre: String(fromMeta).trim(), cif: null };
  }
  return null;
}
