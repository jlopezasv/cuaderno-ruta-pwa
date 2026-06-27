/** Pestañas conductor demo simplificado (lista plana + Más). */
export function getConductorTabsSimplified({ autonomoExpediente = false } = {}) {
  if (autonomoExpediente) {
    return [
      { id: "expediente", icon: "▤", label: "EXPEDIENTE" },
      { id: "mas", icon: "⋯", label: "MÁS" },
    ];
  }
  return [
    { id: "paradas", icon: "▣", label: "PARADAS" },
    { id: "mas", icon: "⋯", label: "MÁS" },
  ];
}

export function getConductorTabs({ T, simplified = false, autonomoExpediente = false }) {
  if (simplified) return getConductorTabsSimplified({ autonomoExpediente });
  return [
    { id: "servicio", icon: "▣", label: "SERVICIO" },
    { id: "hoy", icon: "◷", label: T("tabHoy") },
    { id: "resumen", icon: "▤", label: T("tabResumen") },
    { id: "ruta", icon: "◎", label: "RUTA" },
    { id: "docs", icon: "▥", label: T("tabDocs") },
    { id: "perfil", icon: "◉", label: T("tabPerfil") },
  ];
}
