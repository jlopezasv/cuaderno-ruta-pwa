import { PROP_UI } from "./propietarioTheme.js";
import { DEFAULT_FILTERS } from "./propietarioFiltersModel.js";

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${PROP_UI.border}`,
  fontSize: 13,
  background: PROP_UI.card,
  color: PROP_UI.text,
  minWidth: 0,
};

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: PROP_UI.sub,
  marginBottom: 4,
  letterSpacing: 0.3,
};

function FilterField({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 120, flex: "1 1 140px" }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

export function PropietarioFilters({ filters, onChange, empresasOptions = [], tab, onApply }) {
  const f = filters || DEFAULT_FILTERS;

  function set(key, value) {
    onChange({ ...f, [key]: value });
  }

  const showServicio = ["servicios", "documentos", "dashboard"].includes(tab);
  const showDocumento = tab === "documentos";
  const showTipoUsuario = tab === "usuarios";
  const showActivo = ["conductores", "usuarios", "empresas"].includes(tab);

  return (
    <div
      style={{
        background: PROP_UI.card,
        border: `1px solid ${PROP_UI.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 280px", minWidth: 200 }}>
          <div style={labelStyle}>Buscador universal</div>
          <input
            type="search"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onApply?.()}
            placeholder="Buscar empresa, conductor, email, servicio, matrícula, código empresa..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${PROP_UI.border}`,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="button"
          onClick={onApply}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: PROP_UI.navActive,
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          Aplicar
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <FilterField label="Empresa">
          <select value={f.empresaId} onChange={(e) => set("empresaId", e.target.value)} style={selectStyle}>
            <option value="all">Todas</option>
            {empresasOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </FilterField>

        {tab === "empresas" && (
          <FilterField label="Estado empresa">
            <select value={f.empresaActiva} onChange={(e) => set("empresaActiva", e.target.value)} style={selectStyle}>
              <option value="all">Todas</option>
              <option value="activa">Activas</option>
              <option value="inactiva">Inactivas</option>
            </select>
          </FilterField>
        )}

        {showTipoUsuario && (
          <FilterField label="Rol oficina">
            <select value={f.tipoUsuario} onChange={(e) => set("tipoUsuario", e.target.value)} style={selectStyle}>
              <option value="all">Todos</option>
              <option value="jefe_flota">Jefe flota</option>
              <option value="trafico">Tráfico</option>
              <option value="administrativo">Administrativo</option>
            </select>
          </FilterField>
        )}

        {showActivo && (
          <FilterField label="Activo">
            <select value={f.activo} onChange={(e) => set("activo", e.target.value)} style={selectStyle}>
              <option value="all">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </FilterField>
        )}

        {showServicio && (
          <FilterField label="Servicios">
            <select value={f.servicioFiltro} onChange={(e) => set("servicioFiltro", e.target.value)} style={selectStyle}>
              <option value="all">Todos</option>
              <option value="activos">Activos</option>
              <option value="completados">Completados</option>
              <option value="sin_conductor">Sin conductor</option>
              <option value="incidencia">Con incidencia</option>
              <option value="ultimos_7d">Últimos 7 días</option>
              <option value="mes">Este mes</option>
            </select>
          </FilterField>
        )}

        {showDocumento && (
          <FilterField label="Documentos">
            <select value={f.documentoFiltro} onChange={(e) => set("documentoFiltro", e.target.value)} style={selectStyle}>
              <option value="all">Todos</option>
              <option value="enviados">Enviados</option>
              <option value="pendientes">Pendientes</option>
              <option value="error">Con error</option>
              <option value="sin_documentos">Sin documentos</option>
            </select>
          </FilterField>
        )}

        <FilterField label="Fecha">
          <select value={f.fecha} onChange={(e) => set("fecha", e.target.value)} style={selectStyle}>
            <option value="all">Todas</option>
            <option value="hoy">Hoy</option>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
            <option value="mes">Mes actual</option>
          </select>
        </FilterField>
      </div>
    </div>
  );
}
