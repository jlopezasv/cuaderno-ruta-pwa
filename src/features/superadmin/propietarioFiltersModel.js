export const DEFAULT_FILTERS = {
  q: "",
  empresaId: "all",
  empresaActiva: "all",
  tipoUsuario: "all",
  activo: "all",
  servicioFiltro: "all",
  documentoFiltro: "all",
  fecha: "all",
  fechaDesde: "",
  fechaHasta: "",
};

export const VIEW_PANEL_MAP = {
  dashboard: null,
  empresas: "empresas",
  conductores: "conductores",
  usuarios: "usuarios_oficina",
  usuarios_oficina: "usuarios_oficina",
  servicios: "servicios",
  documentos: "documentos",
  soporte: null,
};

export function filtersForApi(filters) {
  const f = { ...filters };
  if (f.fecha === "custom" && f.fechaDesde) {
    f.desde = f.fechaDesde;
    f.hasta = f.fechaHasta || undefined;
  }
  return f;
}
