import { getFleetTenantDisplayFromServicio } from "./fleetTenantDisplay.js";
import { isAutonomoProOwnServicio, normalizeServicioEmpresaId } from "./serviceOwnership.js";

const PRIVADO_STYLE = Object.freeze({
  kind: "privado",
  label: "Servicio propio",
  bg: "#f3e8ff",
  fg: "#6b21a8",
  border: "#d8b4fe",
});

const FALLBACK_FLEET_STYLE = Object.freeze({
  kind: "empresa",
  label: "Asignado por empresa",
  bg: "#e0f2fe",
  fg: "#0369a1",
  border: "#7dd3fc",
});

export function empresaNombreInitial(nombre) {
  const parts = String(nombre || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "E";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function empresaColorFromId(empresaId) {
  const hex = String(empresaId || "").replace(/-/g, "");
  const n = Number.parseInt(hex.slice(0, 8), 16);
  const hue = Number.isFinite(n) ? n % 360 : 210;
  return {
    bg: `hsl(${hue} 62% 93%)`,
    fg: `hsl(${hue} 48% 28%)`,
    border: `hsl(${hue} 45% 78%)`,
  };
}

/**
 * Presentación visual del origen del servicio (sin cambiar tenanting).
 * @param {object|null} servicio
 * @param {Record<string, { nombre?: string, logo_url?: string|null }>} [empresaById]
 */
export function getServicioOriginPresentation(servicio, empresaById = {}) {
  if (!servicio?.id) return null;

  if (isAutonomoProOwnServicio(servicio)) {
    return { ...PRIVADO_STYLE };
  }

  const empresaId = normalizeServicioEmpresaId(servicio.empresa_id);
  if (!empresaId) {
    return { ...PRIVADO_STYLE };
  }

  const fromMeta = getFleetTenantDisplayFromServicio(servicio);
  const empresa = empresaById[empresaId] || {};
  const nombre = String(empresa.nombre || fromMeta?.nombre || "").trim();
  const colors = empresaColorFromId(empresaId);
  const logoUrl = empresa.logo_url || empresa.logoUrl || fromMeta?.logo_url || null;

  return {
    kind: "empresa",
    label: nombre ? `Asignado por: ${nombre}` : FALLBACK_FLEET_STYLE.label,
    logoUrl,
    initial: empresaNombreInitial(nombre || "Flota"),
    empresaId,
    ...colors,
  };
}
