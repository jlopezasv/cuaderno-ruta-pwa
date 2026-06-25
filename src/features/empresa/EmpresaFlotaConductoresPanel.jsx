import { memo, useCallback, useMemo, useState } from "react";
import { EmpresaFlotaConductorCard, FLOTA_CONDUCTOR_CARD_CSS } from "./EmpresaFlotaConductorCard.jsx";
import { EmpresaFlotaConductorServicioModal } from "./EmpresaFlotaConductorServicioModal.jsx";
import { CONDUCTOR_NORMA_PILLS_CSS } from "./ConductorNormaMetricPills.jsx";
import { CONDUCTOR_UBICACION_DEMO_CSS } from "./ConductorUbicacionDemoBlock.jsx";
import { resolveConductorTelefonoMovil } from "./conductorTelefonoMovil.js";
import {
  FLOTA_CONDUCTOR_FILTERS,
  FLOTA_CONDUCTOR_SORTS,
  buildConductorFlotaRow,
  enrichRowWithLocationTs,
  filterConductorRows,
  sortConductorRows,
} from "./empresaFlotaConductoresModel.js";

const PANEL_CSS = `
.flota-conductores-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.flota-conductores-search {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid var(--flota-border, #dbe4ee);
  background: var(--flota-surface, #fff);
  padding: 10px 12px;
  font-size: 14px;
  color: var(--flota-tx, #0f172a);
  outline: none;
}
.flota-conductores-filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}
.flota-conductores-filter-btn {
  flex-shrink: 0;
  border-radius: 20px;
  padding: 6px 11px;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid var(--flota-border, #dbe4ee);
  background: #f8fafc;
  color: var(--flota-subtle, #475569);
  transition: background 0.12s ease, border-color 0.12s ease;
}
.flota-conductores-filter-btn--active {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
  font-weight: 700;
}
.flota-conductores-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--flota-muted, #64748b);
}
.flota-conductores-sort select {
  border: 1px solid var(--flota-border, #dbe4ee);
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--flota-tx, #0f172a);
  background: #fff;
}
.flota-conductores-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.flota-conductores-count {
  font-size: 11px;
  color: var(--flota-muted, #64748b);
  font-weight: 600;
  margin-bottom: 6px;
}
`;

function EmpresaFlotaConductoresPanelImpl({
  conductores,
  flotaServicios,
  flotaStops,
  flotaEvs,
  ubicacionConductorByUid,
  ubicacionRefreshByUid,
  conductoresByUid,
  nowMs,
  ui,
  empresaTone,
  conductoresDemoUi,
  conductorJourneyInfo,
  semaforo,
  fmtDur,
  formatLugar,
  empresaNombre,
  empresaUserId,
  nombreConductor,
  nombreResponsable,
  showToast,
  onToggleActivo,
  onRefreshUbicacion,
  onAsignarServicio,
  onSaveVehiculo,
  onSaveTelefono,
  onRefreshList,
  onAnularServicio,
  onAsignarConductorServicio,
  onEditarServicio,
  onDcdtServicio,
  inviteBlock,
}) {
  const [search, setSearch] = useState("");
  const [filterId, setFilterId] = useState("todos");
  const [sortId, setSortId] = useState("nombre");
  const [expandedId, setExpandedId] = useState(null);
  const [servicioModal, setServicioModal] = useState(null);

  const panelStyle = {
    "--flota-border": ui.border,
    "--flota-surface": ui.surface,
    "--flota-tx": ui.tx,
    "--flota-muted": ui.muted,
    "--flota-subtle": ui.subtle,
  };

  const rows = useMemo(() => {
    const built = conductores.map((c) => {
      const live = c.user_id ? ubicacionConductorByUid[c.user_id] : null;
      const row = buildConductorFlotaRow({
        conductor: c,
        flotaServicios,
        liveLocation: live,
        nowMs,
        formatLugar,
        conductorJourneyInfo,
        semaforo,
        telefonoResolver: resolveConductorTelefonoMovil,
      });
      return enrichRowWithLocationTs(row, live);
    });
    const filtered = filterConductorRows(built, filterId, search);
    return sortConductorRows(filtered, sortId);
  }, [
    conductores,
    flotaServicios,
    ubicacionConductorByUid,
    nowMs,
    formatLugar,
    conductorJourneyInfo,
    semaforo,
    filterId,
    search,
    sortId,
  ]);

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const openServicioModal = useCallback((row) => {
    if (!row?.servicioActual) return;
    setServicioModal({
      conductor: row.conductor,
      servicio: row.servicioActual,
    });
  }, []);

  const closeServicioModal = useCallback(() => setServicioModal(null), []);

  const modalServicio = servicioModal?.servicio;
  const modalConductor = servicioModal?.conductor;
  const modalUid = modalConductor?.user_id;

  return (
    <div style={{ padding: "10px 12px 80px", ...panelStyle }}>
      <style>
        {PANEL_CSS}
        {FLOTA_CONDUCTOR_CARD_CSS}
        {CONDUCTOR_NORMA_PILLS_CSS}
        {conductoresDemoUi ? CONDUCTOR_UBICACION_DEMO_CSS : ""}
      </style>

      {inviteBlock}

      <div className="flota-conductores-toolbar">
        <input
          type="search"
          className="flota-conductores-search"
          placeholder="Buscar conductor, matrícula, teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar conductor"
        />
        <div className="flota-conductores-filters" role="tablist" aria-label="Filtrar conductores">
          {FLOTA_CONDUCTOR_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filterId === f.id}
              className={`flota-conductores-filter-btn${filterId === f.id ? " flota-conductores-filter-btn--active" : ""}`}
              onClick={() => setFilterId(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flota-conductores-sort">
          <span>Ordenar:</span>
          <select value={sortId} onChange={(e) => setSortId(e.target.value)} aria-label="Ordenar conductores">
            {FLOTA_CONDUCTOR_SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {conductores.length === 0 ? (
        <div
          style={{
            background: ui.surface,
            borderRadius: 14,
            padding: "40px 20px",
            textAlign: "center",
            border: `1px solid ${ui.border}`,
            boxShadow: ui.shadow,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 650, color: ui.tx, marginBottom: 6 }}>
            Sin conductores todavía
          </div>
          <div style={{ fontSize: 13, color: ui.muted }}>Comparte el código con tus conductores</div>
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            background: ui.surface,
            borderRadius: 12,
            padding: "24px 16px",
            textAlign: "center",
            border: `1px solid ${ui.border}`,
            color: ui.muted,
            fontSize: 13,
          }}
        >
          Ningún conductor coincide con el filtro
        </div>
      ) : (
        <>
          <div className="flota-conductores-count">
            {rows.length} de {conductores.length} conductores
          </div>
          <div className="flota-conductores-list">
            {rows.map((row) => {
              const c = row.conductor;
              const uid = c.user_id;
              return (
                <EmpresaFlotaConductorCard
                  key={c.id}
                  row={row}
                  expanded={expandedId === c.id}
                  onToggleExpand={() => toggleExpand(c.id)}
                  ui={ui}
                  empresaTone={empresaTone}
                  conductoresDemoUi={conductoresDemoUi}
                  liveLocation={uid ? ubicacionConductorByUid[uid] : null}
                  ubicacionRefresh={uid ? ubicacionRefreshByUid[uid] : null}
                  fmtDur={fmtDur}
                  formatLugar={formatLugar}
                  nowMs={nowMs}
                  telefonoValue={resolveConductorTelefonoMovil(c)}
                  onToggleActivo={onToggleActivo}
                  onRefreshUbicacion={onRefreshUbicacion}
                  onAsignarServicio={onAsignarServicio}
                  onVerServicio={openServicioModal}
                  onSaveVehiculo={onSaveVehiculo}
                  onSaveTelefono={onSaveTelefono}
                  empresaNombre={empresaNombre}
                  empresaUserId={empresaUserId}
                  showToast={showToast}
                />
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onRefreshList}
        style={{
          width: "100%",
          marginTop: 14,
          background: ui.surface,
          color: ui.subtle,
          border: `1px solid ${ui.border}`,
          borderRadius: 12,
          padding: "12px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: ui.shadow,
        }}
      >
        Actualizar listado
      </button>

      <EmpresaFlotaConductorServicioModal
        open={!!modalServicio}
        onClose={closeServicioModal}
        conductorNombre={modalConductor?.nombre}
        servicio={modalServicio}
        flotaStops={flotaStops}
        flotaEvs={flotaEvs}
        nowMs={nowMs}
        ubicInfo={modalUid ? ubicacionConductorByUid[modalUid] : null}
        ubicRefresh={modalUid ? ubicacionRefreshByUid[modalUid] : null}
        normaC={modalUid ? conductoresByUid[modalUid]?.norma : null}
        conductor={modalConductor}
        nombreConductor={nombreConductor}
        nombreResponsable={nombreResponsable}
        onRefreshUbicacion={
          modalUid ? () => onRefreshUbicacion(modalUid) : undefined
        }
        onAnular={
          modalServicio?.id
            ? () => {
                onAnularServicio?.(modalServicio.id);
                closeServicioModal();
              }
            : undefined
        }
        onAsignarConductor={
          modalServicio?.id
            ? () => onAsignarConductorServicio?.(modalServicio.id)
            : undefined
        }
        onEditarServicio={
          modalServicio?.id
            ? () => {
                onEditarServicio?.(modalServicio.id);
                closeServicioModal();
              }
            : undefined
        }
        onDcdt={
          modalServicio?.id ? () => onDcdtServicio?.(modalServicio.id) : undefined
        }
        empresaNombre={empresaNombre}
        empresaUserId={empresaUserId}
        showToast={showToast}
        fmtDur={fmtDur}
        ui={ui}
      />
    </div>
  );
}

export const EmpresaFlotaConductoresPanel = memo(EmpresaFlotaConductoresPanelImpl);
