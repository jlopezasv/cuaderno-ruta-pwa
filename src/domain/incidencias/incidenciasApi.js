import { sbFetch, getAuthUid } from "../../data/supabaseClient.js";

function norm(v) {
  return String(v || "").toLowerCase();
}

/** empresa_id en incidencias: null para Autónomo PRO; copia del servicio en flota. */
export function resolveIncidenciaEmpresaId(servicio) {
  const e = servicio?.empresa_id;
  if (e === undefined || e === null) return null;
  const s = String(e).trim();
  return s || null;
}

export function resolveIncidenciaConductorId(servicio, authUid = null) {
  const fromServicio = servicio?.conductor_id;
  if (fromServicio) return fromServicio;
  return authUid || getAuthUid?.() || null;
}

export function deriveFaseOperativa({ servicio = null, stop = null } = {}) {
  const estado = norm(servicio?.estado);
  if (estado === "completado" || estado === "cerrado") return "finalizacion";
  const tipoStop = norm(stop?.tipo);
  if (tipoStop.includes("descarga")) return "descarga";
  if (tipoStop.includes("carga")) return "carga";
  if (estado === "en_curso") return "en_ruta";
  return "carga";
}

export async function createIncidencia({
  servicio,
  stop = null,
  titulo,
  descripcion = "",
  conductorNombre = null,
}) {
  const servicioId = servicio?.id;
  if (!servicioId) throw new Error("Servicio inválido para incidencia");
  const tituloTrim = String(titulo || "").trim();
  if (tituloTrim.length < 3) throw new Error("El título debe tener al menos 3 caracteres");
  const authUid = getAuthUid?.() || null;
  const empresaId = resolveIncidenciaEmpresaId(servicio);
  const conductorId = resolveIncidenciaConductorId(servicio, authUid);
  if (!empresaId && !conductorId) {
    throw new Error("No se puede registrar incidencia: falta conductor del servicio");
  }
  const body = {
    ...(typeof crypto !== "undefined" && crypto.randomUUID
      ? { id: crypto.randomUUID() }
      : {}),
    servicio_id: servicioId,
    stop_id: stop?.id || null,
    empresa_id: empresaId,
    conductor_id: conductorId,
    titulo: tituloTrim,
    descripcion: String(descripcion || "").trim() || null,
    fase_operativa: deriveFaseOperativa({ servicio, stop }),
    servicio_estado: servicio?.estado || "en_curso",
    servicio_referencia: servicio?.referencia || null,
    conductor_nombre: conductorNombre || null,
    cliente_nombre: servicio?.cliente || null,
    datos: {
      origen: servicio?.origen || null,
      destino: servicio?.destino || null,
      stop_nombre: stop?.nombre || null,
      stop_tipo: stop?.tipo || null,
    },
  };
  const r = await sbFetch("/rest/v1/incidencias", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    const msg =
      data?.message ||
      data?.hint ||
      (typeof data === "string" ? data : null) ||
      `No se pudo crear la incidencia (${r.status})`;
    throw new Error(msg);
  }
  if (body.id) {
    const getRes = await sbFetch(
      `/rest/v1/incidencias?id=eq.${body.id}&select=*`,
    );
    if (getRes.ok) {
      const rows = await getRes.json().catch(() => []);
      const saved = Array.isArray(rows) ? rows[0] : rows;
      if (saved?.id) return saved;
    }
    return {
      id: body.id,
      ...body,
      registrado_en: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  const getRes = await sbFetch(
    `/rest/v1/incidencias?servicio_id=eq.${servicioId}&order=created_at.desc&limit=1&select=*`,
  );
  if (getRes.ok) {
    const rows = await getRes.json().catch(() => []);
    const saved = Array.isArray(rows) ? rows[0] : rows;
    if (saved?.id) return saved;
  }
  throw new Error("La incidencia se creó pero no se pudo leer (revisa permisos SELECT)");
}

export async function listIncidenciasByServicio(servicioId) {
  if (!servicioId) return [];
  const r = await sbFetch(
    `/rest/v1/incidencias?servicio_id=eq.${servicioId}&order=registrado_en.desc,created_at.desc`,
  );
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function fetchIncidenciasResumenByEmpresa(empresaId) {
  if (!empresaId) return [];
  const r = await sbFetch(
    `/rest/v1/v_servicio_incidencias_resumen?empresa_id=eq.${empresaId}&order=ultima_incidencia_en.desc`,
  );
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

/** Payload para expediente/PDF: tabla incidencias + fotos (evidencias.incidencia_id). */
export async function fetchIncidenciasExpedientePayload(servicioId) {
  const incidencias = await listIncidenciasByServicio(servicioId);
  if (!incidencias.length) {
    return { incidenciasOperativas: [], totalFotos: 0 };
  }
  const ids = incidencias.map((it) => it.id).filter(Boolean);
  const r = await sbFetch(
    `/rest/v1/evidencias?incidencia_id=in.(${ids.join(",")})&order=created_at.asc`,
  );
  const evRows = r.ok ? await r.json().catch(() => []) : [];
  const fotosById = {};
  for (const ev of Array.isArray(evRows) ? evRows : []) {
    if (!ev?.incidencia_id) continue;
    if (!fotosById[ev.incidencia_id]) fotosById[ev.incidencia_id] = [];
    fotosById[ev.incidencia_id].push(ev);
  }
  let totalFotos = 0;
  const incidenciasOperativas = incidencias.map((inc) => {
    const fotos = fotosById[inc.id] || [];
    totalFotos += fotos.length;
    return { ...inc, fotos };
  });
  return { incidenciasOperativas, totalFotos };
}
