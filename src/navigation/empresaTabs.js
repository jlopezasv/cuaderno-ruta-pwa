export const EMPRESA_TABS = [
  { id: "dashboard", icon: "◷", label: "Dashboard" },
  { id: "servicios", icon: "▣", label: "Servicios" },
  { id: "conductores", icon: "◉", label: "Conductores" },
  { id: "documentos", icon: "▤", label: "Documentos" },
  { id: "estadisticas", icon: "◫", label: "Estadísticas" },
  { id: "planificador", icon: "◎", label: "Planificador" },
  { id: "config", icon: "◌", label: "Config" },
];

/** Pestañas del panel empresa ocultas de momento (el código se conserva). */
export const HIDDEN_EMPRESA_TAB_IDS = Object.freeze(["estadisticas", "centro_logistico"]);

export function isEmpresaTabHidden(tabId) {
  return HIDDEN_EMPRESA_TAB_IDS.includes(String(tabId || ""));
}

export function filterVisibleEmpresaTabs(tabs) {
  return (Array.isArray(tabs) ? tabs : []).filter((t) => t && !isEmpresaTabHidden(t.id));
}
