import { EMPRESA_TABS } from "../../navigation/empresaTabs.js";
import { canManageEmpresaOfficeUsers, normalizeOfficeUserRol } from "./empresaOfficeUsers.js";

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

/** Vista operativa por defecto según rol oficina. */
export function getDefaultOfficeServiciosVista(officeUser) {
  if (!officeUser?.activo) return OFFICE_SERVICIOS_VISTA.TODOS;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota") return OFFICE_SERVICIOS_VISTA.TODOS;
  if (rol === "trafico") return OFFICE_SERVICIOS_VISTA.MIS;
  return OFFICE_SERVICIOS_VISTA.TODOS;
}

export function soloMisServiciosFromVista(vista) {
  return vista === OFFICE_SERVICIOS_VISTA.MIS;
}

export function vistaFromSoloMisServicios(soloMis) {
  return soloMis ? OFFICE_SERVICIOS_VISTA.MIS : OFFICE_SERVICIOS_VISTA.TODOS;
}

/** Opciones del selector «Ver: …» (vacío = sin selector). */
export function getOfficeServiciosVistaOptions(officeUser) {
  if (!officeUser?.activo) return [];
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

/** Tick «Ver solo mis servicios» — jefe_flota y tráfico con puede_ver_todos. */
export function shouldShowSoloMisServiciosToggle(officeUser) {
  if (!officeUser?.activo) return false;
  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "jefe_flota") return true;
  if (rol === "trafico" && officeUser.puedeVerTodos) return true;
  return false;
}

/** Puede elegir responsable al crear/editar servicio. */
export function canPickOfficeServicioResponsable(officeUser) {
  if (!officeUser?.activo) return false;
  const rol = String(officeUser.rol || "").toLowerCase();
  return rol === "jefe_flota" || (rol === "trafico" && !!officeUser.puedeVerTodos);
}

/**
 * Filtra servicios según rol oficina y vista operativa.
 * @param {{ forDocumentos?: boolean, forEstadisticas?: boolean, vista?: string, responsableFiltroId?: string|null }} [options]
 */
export function filterServiciosForOfficeUser(servicios, officeUser, uid, options = {}) {
  const list = Array.isArray(servicios) ? servicios : [];
  if (!officeUser?.activo) return list;

  if (options.forDocumentos) {
    return list;
  }

  const rol = String(officeUser.rol || "").toLowerCase();
  if (rol === "administrativo") {
    return options.forEstadisticas ? list : [];
  }

  const userId = uid || officeUser.userId;

  if (rol === "trafico" && !officeUser.puedeVerTodos) {
    return list.filter((s) => s?.responsable_user_id && s.responsable_user_id === userId);
  }

  const vista = options.vista || getDefaultOfficeServiciosVista(officeUser);

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

/** Tabs visibles por rol oficina. Owner sin officeUser → tabs completas. */
export function getVisibleEmpresaTabs(capabilities) {
  const office = capabilities?.officeUser;
  if (!office?.activo) {
    return EMPRESA_TABS;
  }

  const rol = normalizeOfficeUserRol(office.rol);
  let tabs;
  switch (rol) {
    case "jefe_flota":
      tabs = [TAB.dashboard, TAB.servicios, TAB.centro_logistico, TAB.conductores, TAB.documentos, TAB.estadisticas, TAB.planificador, TAB.config];
      break;
    case "trafico":
      tabs = [TAB.dashboard, TAB.servicios, TAB.centro_logistico, TAB.conductores, TAB.documentos, TAB.estadisticas, TAB.planificador];
      break;
    case "administrativo":
      tabs = [TAB.documentos, TAB.estadisticas];
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
  if (!officeUser?.activo) return true;
  return officeUser.rol !== "administrativo";
}

export function canEditEmpresaConfigPerfil(capabilities) {
  return capabilities?.accountType === "empresa" || !!capabilities?.officeUser?.activo;
}

export function canViewEmpresaConfigPerfil(capabilities) {
  if (capabilities?.officeUser?.activo) return true;
  return capabilities?.accountType === "empresa";
}

export function canViewEmpresaConfigUsuarios(capabilities) {
  return canManageEmpresaOfficeUsers(capabilities);
}

/** Configuración solo para owner empresa o jefe_flota activo. */
export function canAccessEmpresaConfigTab(capabilities) {
  if (capabilities?.accountType === "empresa" && !capabilities?.officeUser?.activo) return true;
  const office = capabilities?.officeUser;
  return office?.activo && normalizeOfficeUserRol(office.rol) === "jefe_flota";
}
