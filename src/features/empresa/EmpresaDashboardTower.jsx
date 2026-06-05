import React from "react";

const TOWER_CSS = `
.empresa-tower-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 18px;
  align-items: start;
}
.empresa-tower-card {
  border-radius: 16px;
  padding: 18px 20px;
  border: 1px solid var(--tower-border, #dbe4ee);
  background: var(--tower-surface, #fff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}
.empresa-tower-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tower-muted, #64748b);
  margin-bottom: 14px;
}
.empresa-tower-metric {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  font-size: 14px;
  color: var(--tower-tx, #0f172a);
}
.empresa-tower-metric strong {
  font-size: 22px;
  font-weight: 650;
  font-family: ui-monospace, monospace;
  line-height: 1;
  min-width: 2ch;
}
.empresa-tower-link {
  margin-top: 14px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tower-accent, #2563eb);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.empresa-tower-link:hover { text-decoration: underline; }
.empresa-tower-person {
  padding: 11px 0;
  border-bottom: 1px solid var(--tower-border, #dbe4ee);
}
.empresa-tower-person:last-child { border-bottom: none; }
.empresa-tower-person-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--tower-tx, #0f172a);
  line-height: 1.35;
  margin-bottom: 4px;
}
.empresa-tower-person-line {
  font-size: 11px;
  color: var(--tower-muted, #64748b);
  line-height: 1.45;
}
.empresa-tower-section-label {
  font-size: 11px;
  font-weight: 650;
  color: var(--tower-muted, #64748b);
  margin: 18px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.empresa-tower-empty {
  font-size: 12px;
  color: var(--tower-muted, #64748b);
  padding: 8px 0 4px;
}
`;

function MetricRow({ dot, label, value }) {
  return (
    <div className="empresa-tower-metric">
      <span aria-hidden="true">{dot}</span>
      <span>
        {label}: <strong>{value}</strong>
      </span>
    </div>
  );
}

function TowerLinkButton({ children, onClick, style }) {
  return (
    <button type="button" className="empresa-tower-link" onClick={onClick} style={style}>
      {children}
    </button>
  );
}

function TowerPersonCard({ person }) {
  return (
    <div className="empresa-tower-person">
      <div className="empresa-tower-person-name">
        <span aria-hidden="true">{person.statusDot} </span>
        {person.nombre}
      </div>
      <div className="empresa-tower-person-line">📍 {person.ciudad}</div>
      <div className="empresa-tower-person-line">📞 {person.telefono}</div>
      <div className="empresa-tower-person-line">{person.updatedLabel}</div>
    </div>
  );
}

export function EmpresaDashboardTower({ tower, ui, onTabChange, empresaCodigo }) {
  const { servicios, conductores, sinServicioList } = tower;
  const cardStyle = {
    "--tower-border": ui.border,
    "--tower-surface": ui.surface,
    "--tower-tx": ui.tx,
    "--tower-muted": ui.muted,
    "--tower-accent": ui.accent,
  };

  return (
    <>
      <style>{TOWER_CSS}</style>
      <div className="empresa-tower-grid">
        <div className="empresa-tower-card" style={cardStyle}>
          <div className="empresa-tower-title">Servicios</div>
          <MetricRow dot="🟢" label="Activos" value={servicios.activos} />
          <MetricRow dot="🟡" label="Pendientes salida" value={servicios.pendientesSalida} />
          <MetricRow dot="🔵" label="Sin conductor" value={servicios.sinConductor} />
          <MetricRow dot="🔴" label="Incidencias" value={servicios.incidencias} />
          <TowerLinkButton onClick={() => onTabChange("servicios")}>Ver servicios →</TowerLinkButton>

          <div className="empresa-tower-section-label">Sin servicio</div>
          {sinServicioList.length === 0 ? (
            <div className="empresa-tower-empty">
              {conductores.total === 0
                ? "Sin conductores vinculados"
                : "Ningún conductor sin servicio asignado"}
              {empresaCodigo && conductores.total === 0 && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  Código equipo:{" "}
                  <span style={{ fontFamily: "monospace", color: ui.tx }}>{empresaCodigo}</span>
                </div>
              )}
            </div>
          ) : (
            sinServicioList.map((c) => <TowerPersonCard key={c.uid} person={c} />)
          )}
          <TowerLinkButton onClick={() => onTabChange("conductores")}>Ver todos →</TowerLinkButton>
        </div>

        <div className="empresa-tower-card" style={cardStyle}>
          <div className="empresa-tower-title">Conductores</div>
          <MetricRow dot="◇" label="Total" value={conductores.total} />
          <MetricRow dot="🟢" label="Sin servicio" value={conductores.sinServicio} />
          <MetricRow dot="🟠" label="Con servicio asignado" value={conductores.conProximoServicio} />
          <MetricRow dot="🔵" label="En curso" value={conductores.conServicioActivo} />
          <MetricRow dot="⚪" label="Sin ubicación reciente" value={conductores.sinUbicacionReciente} />
          <TowerLinkButton onClick={() => onTabChange("conductores")}>Gestionar →</TowerLinkButton>
        </div>
      </div>
    </>
  );
}
