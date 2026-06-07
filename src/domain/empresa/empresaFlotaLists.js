import { sbFetch } from "../../data/supabaseClient.js";
import { isDemoApp } from "../../config/appEnvironment.js";

const conductoresCache = { empresaId: null, data: null, inflight: null };

function logConductoresDemo(phase, payload) {
  if (!isDemoApp()) return;
  console.warn("[DEMO conductores]", phase, payload);
}

/** Conductores activos de la flota (conductor_empresa). No usa empresa_usuarios. */
export async function fetchEmpresaConductoresLite(empresaId) {
  if (!empresaId) return [];

  const filter = [
    `empresa_id=eq.${empresaId}`,
    "activo=eq.true",
    "select=id,user_id,nombre,matricula,telefono_movil,activo,empresa_id",
    "order=nombre.asc",
  ].join("&");

  let rows = [];
  let fetchError = null;
  try {
    const res = await sbFetch(`/rest/v1/conductor_empresa?${filter}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      fetchError = {
        status: res.status,
        message: body?.message || body?.hint || res.statusText,
      };
    } else {
      rows = await res.json().catch(() => []);
    }
  } catch (e) {
    fetchError = { message: e?.message || String(e) };
  }

  const rels = (Array.isArray(rows) ? rows : []).filter((r) => r?.user_id);
  const enriched = await Promise.all(
    rels.map(async (r) => {
      try {
        const pr = await sbFetch(
          `/rest/v1/profiles?id=eq.${r.user_id}&select=nombre,matricula,is_archived`,
        );
        if (!pr.ok) return { ...r, nombre: r.nombre || "Conductor", matricula: r.matricula || "" };
        const profile = (await pr.json().catch(() => []))[0];
        if (profile?.is_archived) return null;
        return {
          ...r,
          nombre: profile?.nombre || r.nombre || "Conductor",
          matricula: profile?.matricula || r.matricula || "",
        };
      } catch (_) {
        return { ...r, nombre: r.nombre || "Conductor", matricula: r.matricula || "" };
      }
    }),
  );

  const list = enriched.filter(Boolean);
  logConductoresDemo("loaded", {
    empresaId,
    rawCount: Array.isArray(rows) ? rows.length : 0,
    conductoresCount: list.length,
    error: fetchError,
  });
  return list;
}

export function invalidateEmpresaConductoresCache(empresaId = null) {
  if (empresaId == null || conductoresCache.empresaId === empresaId) {
    conductoresCache.empresaId = null;
    conductoresCache.data = null;
    conductoresCache.inflight = null;
  }
}

/** Una consulta por empresa (reutilizada en modal, listado y picker). */
export async function fetchEmpresaConductoresCached(empresaId, { force = false } = {}) {
  if (!empresaId) return [];

  if (!force && conductoresCache.empresaId === empresaId && conductoresCache.data?.length) {
    return conductoresCache.data;
  }
  if (!force && conductoresCache.empresaId === empresaId && conductoresCache.inflight) {
    return conductoresCache.inflight;
  }

  conductoresCache.empresaId = empresaId;
  conductoresCache.inflight = fetchEmpresaConductoresLite(empresaId)
    .then((rows) => {
      conductoresCache.inflight = null;
      if (rows.length > 0) conductoresCache.data = rows;
      else conductoresCache.data = null;
      return rows;
    })
    .catch((err) => {
      conductoresCache.inflight = null;
      conductoresCache.data = null;
      logConductoresDemo("cache_error", { empresaId, message: err?.message });
      throw err;
    });
  return conductoresCache.inflight;
}
