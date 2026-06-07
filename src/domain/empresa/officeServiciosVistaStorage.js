import { isDemoApp } from "../../config/appEnvironment.js";
import {
  getDefaultOfficeServiciosVista,
  OFFICE_SERVICIOS_VISTA,
} from "./officeUserFilters.js";

const STORAGE_KEY = "cuaderno_office_servicios_vista_v1";

/** Vista compartida entre Servicios, Dashboard, Planificador y Documentos (solo DEMO). */
export function readStoredOfficeServiciosVista(officeUser) {
  if (!isDemoApp()) return getDefaultOfficeServiciosVista(officeUser);
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === OFFICE_SERVICIOS_VISTA.MIS || v === OFFICE_SERVICIOS_VISTA.TODOS) return v;
  } catch {}
  return getDefaultOfficeServiciosVista(officeUser);
}

export function writeStoredOfficeServiciosVista(vista) {
  if (!isDemoApp()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, vista);
  } catch {}
}

export function clearStoredOfficeServiciosVista() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
