import {
  getDefaultOfficeServiciosVista,
  OFFICE_SERVICIOS_VISTA,
} from "./officeUserFilters.js";

const STORAGE_KEY = "cuaderno_office_servicios_vista_v1";

/** Vista compartida entre Dashboard, Servicios, Planificador y Documentos. */
export function readStoredOfficeServiciosVista(officeUser) {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === OFFICE_SERVICIOS_VISTA.MIS || v === OFFICE_SERVICIOS_VISTA.TODOS) return v;
  } catch {}
  return getDefaultOfficeServiciosVista(officeUser);
}

export function writeStoredOfficeServiciosVista(vista) {
  try {
    sessionStorage.setItem(STORAGE_KEY, vista);
  } catch {}
}

export function clearStoredOfficeServiciosVista() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
