import { isDemoApp } from "../../config/appEnvironment.js";
import { EMPRESA_TABS } from "../../navigation/empresaTabs.js";

/** @param {{ rol?: string, puedeVerTodos?: boolean, activo?: boolean }|null} officeUser */
export function canViewAllServices(officeUser) {
  if (!officeUser?.activo) return false;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota") return true;
  if (rol === "trafico" && officeUser.puedeVerTodos) return true;
  return false;
}

/** Filtra servicios según rol oficina. Legacy sin responsable solo visible si canViewAll. */
export function filterServiciosForOfficeUser(servicios, officeUser, uid) {
  const list = Array.isArray(servicios) ? servicios : [];
  if (!isDemoApp() || !officeUser?.activo) return list;
  if (canViewAllServices(officeUser)) return list;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "administrativo") return [];
  if (rol === "trafico") {
    const userId = uid || officeUser.userId;
    return list.filter((s) => s?.responsable_user_id && s.responsable_user_id === userId);
  }
  return list;
}

const TAB = Object.fromEntries(EMPRESA_TABS.map((t) => [t.id, t]));

/** Tabs visibles por rol oficina DEMO. Owner sin officeUser → tabs completas. */
export function getVisibleEmpresaTabs(capabilities) {
  if (!isDemoApp()) return EMPRESA_TABS;
  const office = capabilities?.officeUser;
  if (!office?.activo) return EMPRESA_TABS;

  switch (office.rol) {
    case "jefe_flota":
      return [TAB.dashboard, TAB.servicios, TAB.conductores, TAB.documentos, TAB.config].filter(Boolean);
    case "trafico":
      return [TAB.dashboard, TAB.servicios, TAB.documentos].filter(Boolean);
    case "administrativo":
      return [TAB.documentos].filter(Boolean);
    default:
      return [TAB.documentos].filter(Boolean);
  }
}

export function getDefaultEmpresaTab(capabilities) {
  const tabs = getVisibleEmpresaTabs(capabilities);
  return tabs[0]?.id || "documentos";
}

export function officeUserCanAccessServicios(officeUser) {
  if (!isDemoApp() || !officeUser?.activo) return true;
  return officeUser.rol !== "administrativo";
}
