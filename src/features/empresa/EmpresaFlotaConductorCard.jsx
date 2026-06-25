import { memo, useState } from "react";
import { ConductorNormaMetricPills } from "./ConductorNormaMetricPills.jsx";
import { ConductorVehiculoEmpresaFields } from "./ConductorVehiculoEmpresaFields.jsx";
import { ConductorTelefonoMovilField } from "./ConductorTelefonoMovilField.jsx";
import { ConductorUbicacionDemoBlock } from "./ConductorUbicacionDemoBlock.jsx";
import { formatConductorUbicacionDemoDisplay } from "./conductorUbicacionDemoDisplay.js";
import { formatUbicacionEmpresaFreshness } from "../../domain/location/ubicacionSourceLabel.js";
import { isServiceMessagesEnabled } from "../../config/serviceMessages.js";
import { ServiceMessagesModal } from "../services/components/ServiceMessagesModal.jsx";

export const FLOTA_CONDUCTOR_CARD_CSS = `
.flota-conductor-card {
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.15s ease;
}
.flota-conductor-card--expanded {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}
.flota-conductor-compact {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 8px 10px;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  min-height: 44px;
}
.flota-conductor-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}
.flota-conductor-main {
  min-width: 0;
}
.flota-conductor-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 3px;
}
.flota-conductor-name {
  font-size: 13px;
  font-weight: 650;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.flota-conductor-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.flota-conductor-chip {
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.2;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.flota-conductor-meta {
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--flota-muted, #64748b);
}
.flota-conductor-meta--mobile {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.flota-conductor-meta strong {
  color: var(--flota-tx, #0f172a);
  font-weight: 650;
}
.flota-conductor-meta-item {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.flota-conductor-actions-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.flota-conductor-expand-btn {
  border: 1px solid var(--flota-border, #dbe4ee);
  background: var(--flota-soft, #f8fafc);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  color: var(--flota-subtle, #475569);
  cursor: pointer;
  white-space: nowrap;
}
.flota-conductor-expand-btn:hover {
  background: #eef2f7;
}
.flota-conductor-servicio-line {
  font-size: 10.5px;
  color: var(--flota-subtle, #475569);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flota-conductor-expanded {
  border-top: 1px solid var(--flota-border, #dbe4ee);
  padding: 10px 12px 12px;
  background: var(--flota-soft, #f8fafc);
}
.flota-conductor-expanded-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.flota-conductor-btn {
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}
.flota-conductor-btn--primary {
  background: var(--flota-green, #16a34a);
  color: #fff;
  border-color: #86efac;
  flex: 1 1 120px;
}
.flota-conductor-btn--ghost {
  background: #fff;
  color: var(--flota-subtle, #475569);
  border-color: var(--flota-border, #dbe4ee);
}
.flota-conductor-btn--accent {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}
@media (min-width: 720px) {
  .flota-conductor-compact {
    grid-template-columns: 34px minmax(140px, 1.1fr) minmax(0, 1.4fr) auto;
    padding: 7px 12px;
  }
  .flota-conductor-meta--mobile {
    display: none;
  }
  .flota-conductor-meta--desktop {
    display: flex;
    flex-wrap: nowrap;
    gap: 12px;
    align-items: center;
  }
  .flota-conductor-meta--desktop .flota-conductor-meta-item {
    max-width: 28%;
  }
}
@media (max-width: 719px) {
  .flota-conductor-meta--desktop {
    display: none;
  }
}
`;

function StatusChip({ label, color, empresaTone }) {
  const tone = empresaTone(color);
  return (
    <span
      className="flota-conductor-chip"
      style={{
        color: tone.fg,
        background: tone.bg,
        borderColor: tone.border,
      }}
    >
      {label}
    </span>
  );
}

function EmpresaFlotaConductorCardImpl({
  row,
  expanded,
  onToggleExpand,
  ui,
  empresaTone,
  conductoresDemoUi,
  liveLocation,
  ubicacionRefresh,
  fmtDur,
  formatLugar,
  nowMs,
  onToggleActivo,
  onRefreshUbicacion,
  onAsignarServicio,
  onVerServicio,
  onSaveVehiculo,
  onSaveTelefono,
  telefonoValue,
  empresaNombre,
  empresaUserId,
  showToast,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const c = row.conductor;
  const n = c.norma;
  const borderAccent = c.pendiente
    ? "#cbd5e1"
    : row.journey.open
      ? row.sem.col
      : "#cbd5e1";

  const ubicacionDemo =
    conductoresDemoUi && !c.pendiente
      ? formatConductorUbicacionDemoDisplay(liveLocation, formatLugar, nowMs)
      : null;

  const showChat =
    row.servicioActual && isServiceMessagesEnabled(row.servicioActual);

  const handleCompactClick = (e) => {
    if (e.target.closest("button,a,input")) return;
    onToggleExpand();
  };

  const cardStyle = {
    "--flota-border": ui.border,
    "--flota-soft": ui.surfaceSoft,
    "--flota-tx": ui.tx,
    "--flota-muted": ui.muted,
    "--flota-subtle": ui.subtle,
    "--flota-green": ui.btnPrimary,
    background: ui.surface,
    border: `1px solid ${ui.border}`,
    borderLeft: `3px solid ${borderAccent}`,
    boxShadow: ui.shadow,
  };

  return (
    <article
      className={`flota-conductor-card${expanded ? " flota-conductor-card--expanded" : ""}`}
      style={cardStyle}
    >
      <div
        className="flota-conductor-compact"
        onClick={handleCompactClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div
          className="flota-conductor-avatar"
          style={{
            background: empresaTone(row.journey.open ? row.sem.col : "#94a3b8").bg,
            color: empresaTone(row.journey.open ? row.sem.col : "#94a3b8").fg,
            border: `1px solid ${empresaTone(row.journey.open ? row.sem.col : "#94a3b8").border}`,
          }}
          aria-hidden
        >
          {row.initials}
        </div>

        <div className="flota-conductor-main">
          <div className="flota-conductor-name-row">
            <span className="flota-conductor-name" style={{ color: ui.tx }}>
              {c.nombre || "Conductor"}
            </span>
            <div className="flota-conductor-chips">
              <StatusChip {...row.activoChip} empresaTone={empresaTone} />
              {!c.pendiente && (
                <StatusChip {...row.jornadaChip} empresaTone={empresaTone} />
              )}
              {!c.pendiente && (
                <StatusChip {...row.servicioChip} empresaTone={empresaTone} />
              )}
            </div>
          </div>
          {!c.pendiente && (
            <div className="flota-conductor-meta flota-conductor-meta--mobile">
              <span className="flota-conductor-meta-item">
                🚛 <strong>{row.matricula}</strong>
              </span>
              <span className="flota-conductor-meta-item">📞 {row.telefono}</span>
              <span
                className="flota-conductor-meta-item"
                style={{ color: row.ubicacionIsRecent ? ui.muted : "#b45309" }}
              >
                📍 {row.ubicacionResumen}
              </span>
            </div>
          )}
          {c.pendiente && (
            <div style={{ fontSize: 11, color: ui.muted }}>Pendiente de vincular</div>
          )}
          {row.servicioRuta && !expanded && (
            <div className="flota-conductor-servicio-line" title={row.servicioRuta}>
              {row.servicioRuta}
            </div>
          )}
        </div>

        <div className="flota-conductor-meta flota-conductor-meta--desktop">
          {!c.pendiente && (
            <>
              <span className="flota-conductor-meta-item">
                🚛 <strong>{row.matricula}</strong>
              </span>
              <span className="flota-conductor-meta-item">📞 {row.telefono}</span>
              <span
                className="flota-conductor-meta-item"
                style={{ color: row.ubicacionIsRecent ? ui.muted : "#b45309" }}
              >
                📍 {row.ubicacionResumen}
              </span>
            </>
          )}
        </div>

        <div className="flota-conductor-actions-col">
          {row.servicioActual && (
            <button
              type="button"
              className="flota-conductor-expand-btn"
              style={{ color: "#1d4ed8", borderColor: "#bfdbfe", background: "#eff6ff" }}
              onClick={(e) => {
                e.stopPropagation();
                onVerServicio?.(row);
              }}
            >
              Ver servicio
            </button>
          )}
          <button
            type="button"
            className="flota-conductor-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={expanded ? "Contraer" : "Ver detalles"}
          >
            {expanded ? "▲" : "▼ Detalles"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flota-conductor-expanded">
          {c.pendiente ? (
            <div style={{ fontSize: 12, color: ui.muted }}>
              Dale el código de equipo para que se vincule desde PERFIL.
            </div>
          ) : (
            <>
              <ConductorVehiculoEmpresaFields
                conductorId={c.id}
                matricula={c.matricula || ""}
                remolque={c.remolque || ""}
                editable
                compact={conductoresDemoUi}
                ui={ui}
                onSave={onSaveVehiculo}
              />
              <ConductorTelefonoMovilField
                conductorId={c.id}
                value={telefonoValue}
                editable
                compact={conductoresDemoUi}
                ui={ui}
                onSave={onSaveTelefono}
              />
              {ubicacionDemo ? (
                <ConductorUbicacionDemoBlock
                  lugar={ubicacionDemo.lugar}
                  freshness={ubicacionDemo.freshness}
                  isRecent={ubicacionDemo.isRecent}
                />
              ) : (
                liveLocation &&
                !liveLocation.missing &&
                !liveLocation.fetchError && (
                  <>
                    <div style={{ fontSize: 12, color: ui.tx, marginTop: 8, fontWeight: 600 }}>
                      Última ubicación · {formatLugar(liveLocation)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: formatUbicacionEmpresaFreshness(liveLocation, nowMs).isRecent
                          ? ui.muted
                          : "#b45309",
                        marginTop: 2,
                        fontWeight: 600,
                      }}
                    >
                      {formatUbicacionEmpresaFreshness(liveLocation, nowMs).freshness}
                    </div>
                  </>
                )
              )}
              <div
                style={{
                  fontSize: 11,
                  color: row.journey.color,
                  marginTop: 8,
                  fontWeight: 600,
                }}
              >
                {row.journey.label.replace(/[🟢🟠⚪]/g, "").trim()}
              </div>
              {n && <ConductorNormaMetricPills norma={n} fmtDur={fmtDur} empresaTone={empresaTone} />}
              {row.servicioActual && (
                <div style={{ fontSize: 12, color: ui.muted, marginTop: 6, lineHeight: 1.35 }}>
                  Servicio:{" "}
                  <span style={{ color: ui.tx, fontWeight: 600 }}>{row.servicioRuta}</span>
                </div>
              )}
            </>
          )}

          <div className="flota-conductor-expanded-actions">
            <button
              type="button"
              className="flota-conductor-btn flota-conductor-btn--ghost"
              onClick={() => onToggleActivo(c.id, c.activo)}
            >
              {c.activo ? "Desactivar" : "Activar"}
            </button>
            {!c.pendiente && c.user_id && (
              <>
                <button
                  type="button"
                  className="flota-conductor-btn flota-conductor-btn--accent"
                  onClick={() => onRefreshUbicacion(c.user_id)}
                  disabled={!!ubicacionRefresh?.loading}
                >
                  {ubicacionRefresh?.loading ? "Actualizando…" : "↻ Ubicación"}
                </button>
                {showChat && (
                  <button
                    type="button"
                    className="flota-conductor-btn flota-conductor-btn--accent"
                    onClick={() => setChatOpen(true)}
                  >
                    Mensaje
                  </button>
                )}
                {!showChat && telefonoValue && (
                  <a
                    className="flota-conductor-btn flota-conductor-btn--accent"
                    href={`tel:${String(telefonoValue).replace(/\s/g, "")}`}
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Llamar
                  </a>
                )}
                {row.servicioActual && (
                  <button
                    type="button"
                    className="flota-conductor-btn flota-conductor-btn--accent"
                    onClick={() => onVerServicio?.(row)}
                  >
                    Ver servicio activo
                  </button>
                )}
                <button
                  type="button"
                  className="flota-conductor-btn flota-conductor-btn--primary"
                  onClick={() => onAsignarServicio(c.user_id, c.nombre)}
                >
                  Asignar servicio
                </button>
              </>
            )}
          </div>
          {ubicacionRefresh?.error && (
            <div style={{ fontSize: 10, color: "#b45309", marginTop: 6, fontWeight: 700 }}>
              {ubicacionRefresh.error}
            </div>
          )}
        </div>
      )}

      {showChat && (
        <ServiceMessagesModal
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          servicio={row.servicioActual}
          senderName={empresaNombre || "Tráfico"}
          senderRole="empresa"
          audience="conductor"
          showToast={showToast}
        />
      )}
    </article>
  );
}

export const EmpresaFlotaConductorCard = memo(EmpresaFlotaConductorCardImpl);
