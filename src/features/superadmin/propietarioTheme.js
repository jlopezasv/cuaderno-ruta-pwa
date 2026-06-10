export const PROP_UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  sub: "#64748b",
  accent: "#b45309",
  accentSoft: "#fffbeb",
  success: "#166534",
  successBg: "#f0fdf4",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
  headerBg: "#ffffff",
  navActive: "#0f172a",
  navIdle: "#64748b",
};

export function fmtD(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function fmtT(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "empresas", label: "Empresas" },
  { id: "conductores", label: "Conductores" },
  { id: "usuarios", label: "Oficina" },
  { id: "servicios", label: "Servicios" },
  { id: "documentos", label: "Documentos" },
  { id: "soporte", label: "Soporte" },
];

export const PAGE_SIZE = 25;
