/** Pestañas conductor demo simplificado (lista plana + Más). */
export function getConductorTabsSimplified() {
  return [
    { id: "paradas", icon: "▣", label: "PARADAS" },
    { id: "mas", icon: "⋯", label: "MÁS" },
  ];
}

export function getConductorTabs({ T, simplified = false }) {
  if (simplified) return getConductorTabsSimplified();
  return [
    { id: "servicio", icon: "▣", label: "SERVICIO" },
    { id: "hoy", icon: "◷", label: T("tabHoy") },
    { id: "resumen", icon: "▤", label: T("tabResumen") },
    { id: "ruta", icon: "◎", label: "RUTA" },
    { id: "docs", icon: "▥", label: T("tabDocs") },
    { id: "perfil", icon: "◉", label: T("tabPerfil") },
  ];
}
