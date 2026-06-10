import React from "react";

export const EMPRESA_DASH_VIEW = Object.freeze({
  OPERATIVA: "operativa",
  /** @deprecated CRM empresa retirado del SaaS — solo admin global */
  CLIENTES: "clientes",
  /** @deprecated */
  AGENDA: "agenda",
});

const STORAGE_KEY = "empresa_dashboard_view_v1";

/** Agenda/CRM no disponible en panel empresa (demo ni producción). */
export function canViewEmpresaDashboardClientes() {
  return false;
}

/** @deprecated */
export function canViewEmpresaDashboardAgenda() {
  return false;
}

export function readStoredEmpresaDashView() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
  return EMPRESA_DASH_VIEW.OPERATIVA;
}

export function writeStoredEmpresaDashView(_view) {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

/** Retirado: el dashboard empresa solo muestra vista operativa. */
export function EmpresaDashboardSubnav() {
  return null;
}
