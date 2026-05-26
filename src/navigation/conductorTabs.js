export function getConductorTabs({ isAdmin, T }) {
  const conductorCoreTabs = [
    { id: "servicio", icon: "▣", label: "SERVICIO" },
    { id: "hoy", icon: "◷", label: T("tabHoy") },
    { id: "resumen", icon: "▤", label: T("tabResumen") },
    { id: "ruta", icon: "◎", label: "RUTA" },
    { id: "docs", icon: "▥", label: T("tabDocs") },
    { id: "perfil", icon: "◉", label: T("tabPerfil") },
  ];

  if (!isAdmin) return conductorCoreTabs;

  return [
    ...conductorCoreTabs,
    { id: "admin", icon: "◆", label: "ADMIN" },
  ];
}
