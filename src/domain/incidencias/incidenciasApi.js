import { sbFetch } from "../../data/supabaseClient.js";

function norm(v) {
  return String(v || "").toLowerCase();
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
  const body = {
    servicio_id: servicioId,
    stop_id: stop?.id || null,
    empresa_id: servicio?.empresa_id,
    conductor_id: servicio?.conductor_id || null,
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
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(data?.message || data?.hint || `No se pudo crear la incidencia (${r.status})`);
  }
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.id) throw new Error("La incidencia no devolvió id");
  return saved;
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
