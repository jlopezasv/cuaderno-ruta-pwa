export function getConductorTabs({ prof, rolEmpresa, uid, T }) {
  return [
    ...(prof.tipo_cuenta !== "empresa" ? [{ id: "hoy", icon: "⊙", label: T("tabHoy") }] : []),
    ...(prof.tipo_cuenta !== "empresa" ? [{ id: "resumen", icon: "▦", label: T("tabResumen") }] : []),
    { id: "servicio", icon: "📦", label: "SERVICIO" },
    { id: "ruta", icon: "⊕", label: "RUTA" },
    ...(prof.tipo_cuenta !== "empresa" ? [{ id: "docs", icon: "⊟", label: T("tabDocs") }] : []),
    ...(rolEmpresa === "jefe" || (prof.tipo_cuenta === "empresa" && !rolEmpresa) ? [{ id: "empresa", icon: "⊞", label: "FLOTA" }] : []),
    ...(uid === "ca5dd314-2e37-4f08-86d7-09103cb8e510" ? [{ id: "admin", icon: "⚡", label: "ADMIN" }] : []),
    { id: "perfil", icon: "◉", label: T("tabPerfil") },
  ];
}
