const BARE_MARK = "__SRV_OP__:";
const MARK = "\n" + BARE_MARK;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function stripServicioOperacionDisplay(referencia) {
  if (referencia == null || referencia === "") return "";
  const s = String(referencia);
  const withBreak = s.indexOf(MARK);
  if (withBreak !== -1) return s.slice(0, withBreak).trim();
  const bare = s.indexOf(BARE_MARK);
  if (bare !== -1) return s.slice(0, bare).trim();
  if (s.trim().startsWith("{") && s.includes("lugares_operativos")) return "";
  return s.trim();
}

export function parseServicioOperacionMeta(referencia) {
  if (referencia == null || referencia === "") return {};
  const s = String(referencia);
  const withBreak = s.indexOf(MARK);
  const bare = s.indexOf(BARE_MARK);
  const idx = withBreak !== -1 ? withBreak : bare;
  const len = withBreak !== -1 ? MARK.length : BARE_MARK.length;
  if (idx === -1) {
    const t = s.trim();
    if (t.startsWith("{")) {
      try {
        const o = JSON.parse(t);
        return o && typeof o === "object" ? o : {};
      } catch {
        return {};
      }
    }
    return {};
  }
  try {
    const o = JSON.parse(s.slice(idx + len).trim());
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function deriveShortServiceSuffix(id) {
  if (!id) return "000";
  const hex = String(id).replace(/-/g, "");
  const n = Number.parseInt(hex.slice(0, 8), 16);
  const code = ((Number.isFinite(n) ? n : 0) % 999) + 1;
  return String(code).padStart(3, "0");
}

function refServicioDisplay(servicio) {
  const stripped = stripServicioOperacionDisplay(servicio?.referencia);
  if (stripped && !UUID_RE.test(stripped) && !stripped.startsWith("{")) return stripped;
  if (servicio?.id) return `SERV-${deriveShortServiceSuffix(servicio.id)}`;
  return "—";
}

function clienteDisplay(servicio, meta) {
  const lugares = meta?.lugares_operativos || meta?.lugaresOperativos;
  const name =
    lugares?.cliente_nombre ||
    meta?.cliente_nombre ||
    meta?.cliente ||
    servicio?.cliente_nombre ||
    servicio?.cliente ||
    "";
  const t = String(name || "").trim();
  return t || "Sin cliente";
}

function rutaDisplay(servicio, meta) {
  const lugares = meta?.lugares_operativos || meta?.lugaresOperativos;
  const carga = lugares?.carga?.nombre || lugares?.carga?.direccion || lugares?.origen_carga;
  const descarga = lugares?.descarga?.nombre || lugares?.descarga?.direccion || lugares?.destino_descarga;
  if (carga && descarga) {
    return { origen: String(carga).trim(), destino: String(descarga).trim(), ruta: `${carga} → ${descarga}` };
  }
  const plan = meta?.operational_plan;
  const origen =
    String(servicio?.origen || plan?.planned_origin || "").trim() || "—";
  const destino =
    String(servicio?.destino || plan?.planned_destination || "").trim() || "—";
  return { origen, destino, ruta: `${origen} → ${destino}` };
}

/**
 * Fila de servicio limpia para panel propietario (sin JSON crudo).
 */
export function normalizeServicioAdminRow(servicio, ctx = {}) {
  const meta = parseServicioOperacionMeta(servicio?.referencia);
  const { origen, destino, ruta } = rutaDisplay(servicio, meta);
  const conductores = Array.isArray(ctx.conductores) ? ctx.conductores : [];
  const names = conductores.map((c) => c.nombre).filter(Boolean);
  const conductoresAsignados = names.length ? names.join(", ") : "—";

  return {
    id: servicio.id,
    refServicio: refServicioDisplay(servicio),
    cliente: clienteDisplay(servicio, meta),
    origen,
    destino,
    ruta,
    estado: servicio.estado || "—",
    fecha: servicio.created_at || null,
    updatedAt: servicio.updated_at || null,
    empresaId: servicio.empresa_id || null,
    empresaNombre: ctx.empresaNombre || "—",
    conductorId: servicio.conductor_id || null,
    conductorPrincipal: ctx.conductorPrincipal || names[0] || null,
    conductoresAsignados,
  };
}
