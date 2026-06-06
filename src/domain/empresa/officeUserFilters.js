import { isDemoApp } from "../../config/appEnvironment.js";
import { EMPRESA_TABS } from "../../navigation/empresaTabs.js";
import { normalizeOfficeUserRol } from "./empresaOfficeUsers.js";

export const OFFICE_SERVICIOS_VISTA = Object.freeze({
  MIS: "mis",
  TODOS: "todos",
  POR_RESPONSABLE: "por_responsable",
});

/** @param {{ rol?: string, puedeVerTodos?: boolean, activo?: boolean }|null} officeUser */
export function canViewAllServices(officeUser) {
  if (!officeUser?.activo) return false;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota") return true;
  if (rol === "trafico" && officeUser.puedeVerTodos) return true;
  return false;
}

/** Vista operativa por defecto según rol oficina DEMO. */
export function getDefaultOfficeServiciosVista(officeUser) {
  if (!officeUser?.activo) return OFFICE_SERVICIOS_VISTA.TODOS;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota") return OFFICE_SERVICIOS_VISTA.TODOS;
  if (rol === "trafico") return OFFICE_SERVICIOS_VISTA.MIS;
  return OFFICE_SERVICIOS_VISTA.TODOS;
}

/** Opciones del selector «Ver: …» (vacío = sin selector). */
export function getOfficeServiciosVistaOptions(officeUser) {
  if (!isDemoApp() || !officeUser?.activo) return [];
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota") {
    return [
      { id: OFFICE_SERVICIOS_VISTA.TODOS, label: "Todos los servicios" },
      { id: OFFICE_SERVICIOS_VISTA.MIS, label: "Mis servicios" },
      { id: OFFICE_SERVICIOS_VISTA.POR_RESPONSABLE, label: "Por responsable" },
    ];
  }
  if (rol === "trafico" && officeUser.puedeVerTodos) {
    return [
      { id: OFFICE_SERVICIOS_VISTA.MIS, label: "Mis servicios" },
      { id: OFFICE_SERVICIOS_VISTA.TODOS, label: "Todos los servicios" },
    ];
  }
  return [];
}

export function shouldShowOfficeServiciosVistaSelector(officeUser) {
  return getOfficeServiciosVistaOptions(officeUser).length > 0;
}

/** Puede elegir responsable al crear/editar servicio. */
export function canPickOfficeServicioResponsable(officeUser) {
  if (!isDemoApp() || !officeUser?.activo) return false;
  const rol = String(officeUser.rol || "").toLowerCase();
  return rol === "jefe_flota" || (rol === "trafico" && !!officeUser.puedeVerTodos);
}

/**
 * Filtra servicios según rol oficina y vista operativa.
 * @param {{ forDocumentos?: boolean, vista?: string, responsableFiltroId?: string|null }} [options]
 */
export function filterServiciosForOfficeUser(servicios, officeUser, uid, options = {}) {
  const list = Array.isArray(servicios) ? servicios : [];
  if (!isDemoApp() || !officeUser?.activo) return list;

  if (options.forDocumentos) {
    const rol = String(officeUser.rol || "").toLowerCase();
    if (rol === "administrativo") return list;
    return list;
  }

  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "administrativo") return [];

  const vista = options.vista || getDefaultOfficeServiciosVista(officeUser);
  const userId = uid || officeUser.userId;

  if (vista === OFFICE_SERVICIOS_VISTA.TODOS) {
    return list;
  }

  if (vista === OFFICE_SERVICIOS_VISTA.MIS) {
    return list.filter((s) => s?.responsable_user_id && s.responsable_user_id === userId);
  }

  if (vista === OFFICE_SERVICIOS_VISTA.POR_RESPONSABLE) {
    const fid = options.responsableFiltroId;
    if (!fid) return [];
    return list.filter((s) => s?.responsable_user_id && s.responsable_user_id === fid);
  }

  return list;
}

const TAB = Object.fromEntries(EMPRESA_TABS.map((t) => [t.id, t]));

/** Tabs visibles por rol oficina DEMO. Owner sin officeUser → tabs completas. */
export function getVisibleEmpresaTabs(capabilities) {
  if (!isDemoApp()) return EMPRESA_TABS;
  const office = capabilities?.officeUser;
  if (!office?.activo) return EMPRESA_TABS;

  const rol = normalizeOfficeUserRol(office.rol);
  let tabs;
  switch (rol) {
    case "jefe_flota":
      tabs = [TAB.dashboard, TAB.servicios, TAB.conductores, TAB.documentos, TAB.planificador, TAB.config];
      break;
    case "trafico":
      tabs = [TAB.dashboard, TAB.servicios, TAB.documentos];
      break;
    case "administrativo":
      tabs = [TAB.documentos];
      break;
    default:
      tabs = [TAB.documentos];
      break;
  }
  const visible = tabs.filter(Boolean);
  return visible.length ? visible : EMPRESA_TABS;
}

export function getDefaultEmpresaTab(capabilities) {
  const tabs = getVisibleEmpresaTabs(capabilities);
  return tabs[0]?.id || "documentos";
}

export function officeUserCanAccessServicios(officeUser) {
  if (!isDemoApp() || !officeUser?.activo) return true;
  return officeUser.rol !== "administrativo";
}
