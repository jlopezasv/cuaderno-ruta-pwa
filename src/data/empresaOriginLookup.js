import { isDemoApp } from "../config/appEnvironment.js";
import { DEMO_FLEET_TENANT_LABELS } from "../config/demoFleetTenantLabels.js";
import { extractFleetTenantLabelsFromServicios } from "../domain/service/fleetTenantDisplay.js";
import { getUserId, sbFetch, sbSelect } from "./supabaseClient.js";

const CACHE_KEY = "cuaderno_empresa_origin_labels_v1";

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {}
}

function mergeMaps(...maps) {
  const out = {};
  for (const m of maps) {
    if (!m || typeof m !== "object") continue;
    Object.assign(out, m);
  }
  return out;
}

/** Guarda nombre (y logo opcional) tras vincular o previsualizar empresa. */
export function cacheEmpresaOriginLabel(empresa) {
  const id = empresa?.id;
  if (!id) return;
  const nombre = String(empresa.nombre || "").trim();
  if (!nombre) return;
  const cur = readCache();
  cur[id] = {
    nombre,
    logo_url: empresa.logo_url || empresa.logoUrl || null,
    updated_at: Date.now(),
  };
  writeCache(cur);
}

export function getCachedEmpresaOriginLabels() {
  return readCache();
}

function demoLabelsForIds(ids) {
  if (!isDemoApp()) return {};
  const out = {};
  ids.forEach((id) => {
    if (DEMO_FLEET_TENANT_LABELS[id]) out[id] = { ...DEMO_FLEET_TENANT_LABELS[id] };
  });
  return out;
}

async function fetchEmpresasByIds(ids) {
  const fetched = {};
  if (!ids.length) return fetched;
  try {
    const enc = ids.map((id) => encodeURIComponent(id)).join(",");
    // Solo columnas garantizadas en `empresas` (sin logo_url, que no existe en el esquema).
    const res = await sbFetch(`/rest/v1/empresas?id=in.(${enc})&select=id,nombre`);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          if (!row?.id) return;
          const nombre = String(row.nombre || "").trim();
          if (nombre) {
            fetched[row.id] = { nombre, logo_url: row.logo_url || null };
          }
        });
      }
    }
  } catch {
    /* RLS: propietario empresa sí; conductor autónomo no */
  }
  return fetched;
}

/**
 * Resuelve etiquetas comerciales para badges (solo UI).
 * Fuentes: meta en servicio → caché local → REST empresas → DEMO seed.
 */
export async function fetchEmpresaOriginLabels(empresaIds = [], servicios = []) {
  const ids = [...new Set(empresaIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const fromServicios = extractFleetTenantLabelsFromServicios(servicios);
  const cached = readCache();
  const demo = demoLabelsForIds(ids);

  let merged = mergeMaps(cached, fromServicios, demo);

  const missing = ids.filter((id) => !String(merged[id]?.nombre || "").trim());
  if (missing.length) {
    const fetched = await fetchEmpresasByIds(missing);
    merged = mergeMaps(merged, fetched);
  }

  writeCache(merged);
  return merged;
}

/** Al iniciar sesión conductor: rehidrata caché desde vínculos activos (nombre en preview de código). */
export async function syncFleetTenantCacheForCurrentUser() {
  const uid = getUserId();
  if (!uid) return readCache();
  try {
    const links = await sbSelect("conductor_empresa", `user_id=eq.${uid}&activo=eq.true&select=empresa_id`);
    const ids = (Array.isArray(links) ? links : []).map((r) => r.empresa_id).filter(Boolean);
    return fetchEmpresaOriginLabels(ids, []);
  } catch {
    return readCache();
  }
}
