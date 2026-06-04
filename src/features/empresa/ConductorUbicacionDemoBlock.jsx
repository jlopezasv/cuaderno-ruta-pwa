/** Bloque fijo de ubicación (demo) — evita saltos de layout al refrescar. */
export function ConductorUbicacionDemoBlock({ lugar, freshness, isRecent }) {
  return (
    <div className="conductor-card-demo-ubicacion">
      <div className="conductor-card-demo-ubicacion__line" title={lugar}>
        <span className="conductor-card-demo-ubicacion__label">Última ubicación: </span>
        {lugar}
      </div>
      <div
        className={`conductor-card-demo-ubicacion__freshness${isRecent ? "" : " conductor-card-demo-ubicacion__freshness--stale"}`}
      >
        {freshness}
      </div>
    </div>
  );
}

export const CONDUCTOR_UBICACION_DEMO_CSS = `
.conductor-card-demo-ubicacion {
  min-height: 34px;
  margin-top: 5px;
}
.conductor-card-demo-ubicacion__line {
  font-size: 11.5px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conductor-card-demo-ubicacion__label {
  color: #64748b;
  font-weight: 650;
}
.conductor-card-demo-ubicacion__freshness {
  font-size: 10.5px;
  font-weight: 650;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.3;
  min-height: 14px;
}
.conductor-card-demo-ubicacion__freshness--stale {
  color: #b45309;
}
`;
