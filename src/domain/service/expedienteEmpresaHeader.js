import { isDemoApp } from "../../config/appEnvironment.js";
import { DEMO_FLEET_TENANT_LABELS } from "../../config/demoFleetTenantLabels.js";
import { sbSelect } from "../../data/supabaseClient.js";
import { getFleetTenantDisplayFromServicio } from "./fleetTenantDisplay.js";
import { normalizeServicioEmpresaId } from "./serviceOwnership.js";

async function loadEmpresaHeaderFromDb(empresaId) {
  if (!empresaId) return null;
  try {
    const rows = await sbSelect("empresas", `id=eq.${empresaId}`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.nombre) return null;
    return {
      nombre: String(row.nombre).trim(),
      cif: String(row.cif || "").trim() || null,
    };
  } catch {
    return null;
  }
}

/**
 * Cabecera de empresa para expediente operacional (nombre + CIF desde perfil).
 * Prioridad: perfil empresa en sesión → tabla empresas → etiquetas demo → meta + CIF en BD.
 */
export async function resolveExpedienteEmpresaHeaderForServicio(servicio, localEmpresa = null) {
  const eid = normalizeServicioEmpresaId(servicio?.empresa_id);
  if (!eid) return null;

  const localId = normalizeServicioEmpresaId(localEmpresa?.id);
  if (localId === eid && String(localEmpresa?.nombre || "").trim()) {
    const hdr = {
      nombre: String(localEmpresa.nombre).trim(),
      cif: String(localEmpresa.cif || "").trim() || null,
    };
    if (!hdr.cif) {
      const fromDb = await loadEmpresaHeaderFromDb(eid);
      if (fromDb?.cif) hdr.cif = fromDb.cif;
    }
    return hdr;
  }

  const fromDb = await loadEmpresaHeaderFromDb(eid);
  if (fromDb) return fromDb;

  if (isDemoApp()) {
    const demo = DEMO_FLEET_TENANT_LABELS[eid];
    if (demo?.nombre) {
      return {
        nombre: String(demo.nombre).trim(),
        cif: String(demo.cif || "").trim() || null,
      };
    }
  }

  const fromMeta = getFleetTenantDisplayFromServicio(servicio)?.nombre;
  if (fromMeta) {
    const cifFromDb = (await loadEmpresaHeaderFromDb(eid))?.cif || null;
    return { nombre: String(fromMeta).trim(), cif: cifFromDb };
  }

  return null;
}
