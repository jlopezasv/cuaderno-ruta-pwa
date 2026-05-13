export function getConductorTabs({ prof, rolEmpresa, uid, T }) {
  const canUseEmpresa = rolEmpresa === "jefe"
    || (prof.tipo_cuenta === "empresa" && !rolEmpresa);

  const conductorCoreTabs = [
    { id: "servicio", icon: "▣", label: "SERVICIO" },
    { id: "hoy", icon: "◷", label: T("tabHoy") },
    { id: "resumen", icon: "▤", label: T("tabResumen") },
    { id: "ruta", icon: "◎", label: "RUTA" },
    { id: "docs", icon: "▥", label: T("tabDocs") },
    { id: "perfil", icon: "◉", label: T("tabPerfil") },
  ];

  if (prof.tipo_cuenta !== "empresa") {
    return [
      ...conductorCoreTabs,
      ...(uid === "ca5dd314-2e37-4f08-86d7-09103cb8e510" ? [{ id: "admin", icon: "◆", label: "ADMIN" }] : []),
    ];
  }

  return [
    { id: "servicio", icon: "▣", label: "SERVICIO" },
    { id: "ruta", icon: "◎", label: "RUTA" },
    ...(canUseEmpresa ? [{ id: "empresa", icon: "◇", label: "FLOTA" }] : []),
    ...(uid === "ca5dd314-2e37-4f08-86d7-09103cb8e510" ? [{ id: "admin", icon: "◆", label: "ADMIN" }] : []),
    { id: "perfil", icon: "◉", label: T("tabPerfil") },
  ];
}
