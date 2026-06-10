import React, { useCallback, useEffect, useMemo, useState } from "react";
import { UI_TOKENS } from "../../ui/visualTokens.js";
import { EMPRESA_PAGE_SHELL_CLASS } from "../../ui/empresaPageShell.js";
import { ESTADO_LABEL, SERVICIO_ESTADOS_DB } from "../../domain/fleet/serviceStatus.js";
import {
  applyDatePreset,
  clearEstadisticasFilters,
  createDefaultEstadisticasFilters,
  DATE_PRESETS,
  hasValidDateRange,
} from "../../domain/empresa/empresaEstadisticasFilters.js";
import {
  applyEstadisticasFilters,
  buildEstadisticasCsv,
  buildFilterOptions,
  buildServicioEstadisticaRows,
  computeEstadisticasKpis,
  computeEstadisticasRankings,
  downloadCsv,
  ESTADISTICAS_PAGE_SIZE,
  filterTableSearch,
  loadEstadisticasRawData,
  paginateRows,
  sortEstadisticasTable,
} from "../../domain/empresa/empresaEstadisticasModel.js";

const card = UI_TOKENS.surface;
const border = UI_TOKENS.border;
const tx = UI_TOKENS.ink;
const su = UI_TOKENS.muted;
const accent = UI_TOKENS.brand;

const selectStyle = {
  padding: "7px 9px",
  borderRadius: 8,
  border: `1px solid ${border}`,
  fontSize: 12,
  background: card,
  color: tx,
  minWidth: 0,
  width: "100%",
};

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: su,
  marginBottom: 4,
  letterSpacing: 0.3,
};

const btnStyle = (primary = false) => ({
  padding: "8px 12px",
  borderRadius: 8,
  border: primary ? "none" : `1px solid ${border}`,
  background: primary ? accent : card,
  color: primary ? "#fff" : tx,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

function FilterField({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 120, flex: "1 1 150px" }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: su, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tx, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 11, color: su, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function RankingBlock({ title, items }) {
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: su, textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </div>
      {!items?.length ? (
        <div style={{ fontSize: 12, color: su }}>Sin datos</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((it) => (
            <li
              key={it.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 13,
                padding: "4px 0",
                borderBottom: `1px solid ${border}`,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              <strong style={{ flexShrink: 0 }}>{it.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PairStat({ title, aLabel, aVal, bLabel, bVal }) {
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: su, textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
        <span>
          {aLabel}: <strong>{aVal}</strong>
        </span>
        <span>
          {bLabel}: <strong>{bVal}</strong>
        </span>
      </div>
    </div>
  );
}

const TABLE_COLS = [
  { key: "fecha", label: "Fecha" },
  { key: "referencia", label: "Referencia" },
  { key: "cliente", label: "Cliente" },
  { key: "origen", label: "Origen" },
  { key: "destino", label: "Destino" },
  { key: "conductor", label: "Conductor" },
  { key: "estado", label: "Estado" },
  { key: "numCmr", label: "Nº CMR" },
  { key: "remitente", label: "Remitente" },
  { key: "destinatario", label: "Destinatario" },
  { key: "transportista", label: "Transportista" },
  { key: "lugarCarga", label: "Lugar carga" },
  { key: "lugarEntrega", label: "Lugar entrega" },
  { key: "mercancia", label: "Mercancía" },
  { key: "peso", label: "Peso kg" },
  { key: "bultos", label: "Bultos" },
  { key: "matricula", label: "Matrícula" },
  { key: "incidencias", label: "Inc." },
  { key: "docs", label: "Docs" },
  { key: "muelle", label: "Muelle min" },
  { key: "envio", label: "Doc. enviada" },
  { key: "estadoEnvio", label: "Estado envío" },
];

export function EmpresaEstadisticasPanel({ empresaId, capabilities, getUserId, sbSelect, showToast }) {
  const [draftFilters, setDraftFilters] = useState(() => createDefaultEstadisticasFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultEstadisticasFilters());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [tableSearch, setTableSearch] = useState("");
  const [sortKey, setSortKey] = useState("fecha");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);

  const officeUser = capabilities?.officeUser || null;
  const uid = getUserId?.() || null;

  const conductorByUid = useMemo(() => {
    const map = {};
    for (const c of rawData?.conductores || []) {
      if (c?.user_id) map[c.user_id] = c;
    }
    return map;
  }, [rawData?.conductores]);

  const baseRows = useMemo(() => {
    if (!rawData) return [];
    return buildServicioEstadisticaRows(rawData, { officeUser, uid, conductorByUid });
  }, [rawData, officeUser, uid, conductorByUid]);

  const filteredRows = useMemo(
    () => applyEstadisticasFilters(baseRows, appliedFilters),
    [baseRows, appliedFilters],
  );

  const filterOptions = useMemo(
    () => buildFilterOptions(baseRows, rawData?.conductores || []),
    [baseRows, rawData?.conductores],
  );

  const kpis = useMemo(() => computeEstadisticasKpis(filteredRows), [filteredRows]);
  const rankings = useMemo(() => computeEstadisticasRankings(filteredRows), [filteredRows]);

  const tableRows = useMemo(() => {
    const searched = filterTableSearch(filteredRows, tableSearch);
    return sortEstadisticasTable(searched, sortKey, sortDir);
  }, [filteredRows, tableSearch, sortKey, sortDir]);

  const pagination = useMemo(() => paginateRows(tableRows, page, ESTADISTICAS_PAGE_SIZE), [tableRows, page]);

  const loadData = useCallback(
    async (filters) => {
      if (!empresaId) return;
      if (!hasValidDateRange(filters)) {
        showToast?.("Indica fecha desde y hasta");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await loadEstadisticasRawData({
          empresaId,
          fechaDesde: filters.fechaDesde,
          fechaHasta: filters.fechaHasta,
          sbSelectFn: sbSelect,
        });
        setRawData(data);
        setPage(1);
      } catch (e) {
        setError("No se pudieron cargar las estadísticas. Inténtalo de nuevo.");
        showToast?.("Error cargando estadísticas");
      } finally {
        setLoading(false);
      }
    },
    [empresaId, sbSelect, showToast],
  );

  useEffect(() => {
    if (empresaId) void loadData(appliedFilters);
  }, [empresaId]);

  function setDraft(key, value) {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply() {
    const datesChanged =
      draftFilters.fechaDesde !== appliedFilters.fechaDesde ||
      draftFilters.fechaHasta !== appliedFilters.fechaHasta;
    setAppliedFilters({ ...draftFilters });
    setPage(1);
    if (datesChanged || !rawData) void loadData(draftFilters);
  }

  function handleClear() {
    const cleared = clearEstadisticasFilters();
    setDraftFilters(cleared);
    setAppliedFilters(cleared);
    void loadData(cleared);
  }

  function handlePreset(preset) {
    const next = applyDatePreset(draftFilters, preset);
    setDraftFilters(next);
    setAppliedFilters(next);
    void loadData(next);
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "fecha" ? "desc" : "asc");
    }
  }

  function handleExport() {
    const csv = buildEstadisticasCsv(tableRows);
    downloadCsv(csv);
    showToast?.("CSV exportado");
  }

  if (!empresaId) {
    return (
      <div className={EMPRESA_PAGE_SHELL_CLASS} style={{ color: su, fontSize: 14 }}>
        Cargando empresa…
      </div>
    );
  }

  return (
    <div className={EMPRESA_PAGE_SHELL_CLASS}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 750, color: tx }}>Estadísticas operativas</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: su }}>
          Análisis filtrable de servicios, CMR, incidencias y documentación (últimos 30 días por defecto).
        </p>
      </div>

      {/* Filtros */}
      <div
        style={{
          background: card,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            ["Últimos 7 días", DATE_PRESETS.last7],
            ["Últimos 30 días", DATE_PRESETS.last30],
            ["Este mes", DATE_PRESETS.thisMonth],
            ["Mes anterior", DATE_PRESETS.prevMonth],
          ].map(([label, preset]) => (
            <button key={preset} type="button" onClick={() => handlePreset(preset)} style={btnStyle(false)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FilterField label="Fecha desde">
            <input
              type="date"
              value={draftFilters.fechaDesde}
              onChange={(e) => setDraft("fechaDesde", e.target.value)}
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Fecha hasta">
            <input
              type="date"
              value={draftFilters.fechaHasta}
              onChange={(e) => setDraft("fechaHasta", e.target.value)}
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Cliente">
            <select
              value={draftFilters.cliente}
              onChange={(e) => setDraft("cliente", e.target.value)}
              style={selectStyle}
              disabled={!filterOptions.clientes.length}
            >
              <option value="">Todos</option>
              {filterOptions.clientes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Conductor">
            <select
              value={draftFilters.conductorId}
              onChange={(e) => setDraft("conductorId", e.target.value)}
              style={selectStyle}
              disabled={!filterOptions.conductores.length}
            >
              <option value="">Todos</option>
              {filterOptions.conductores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Estado servicio">
            <select
              value={draftFilters.estadoServicio}
              onChange={(e) => setDraft("estadoServicio", e.target.value)}
              style={selectStyle}
            >
              <option value="">Todos</option>
              {SERVICIO_ESTADOS_DB.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e] || e}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Origen">
            <input
              type="text"
              value={draftFilters.origen}
              onChange={(e) => setDraft("origen", e.target.value)}
              placeholder="Filtrar origen"
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Destino">
            <input
              type="text"
              value={draftFilters.destino}
              onChange={(e) => setDraft("destino", e.target.value)}
              placeholder="Filtrar destino"
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Tipo documento">
            <select
              value={draftFilters.tipoDocumento}
              onChange={(e) => setDraft("tipoDocumento", e.target.value)}
              style={selectStyle}
              disabled={!filterOptions.docTipos.length}
            >
              <option value="">Todos</option>
              {filterOptions.docTipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Tipo incidencia (fase)">
            <select
              value={draftFilters.tipoIncidencia}
              onChange={(e) => setDraft("tipoIncidencia", e.target.value)}
              style={selectStyle}
              disabled={!filterOptions.fasesInc.length}
            >
              <option value="">Todos</option>
              {filterOptions.fasesInc.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Remitente CMR">
            <input
              type="text"
              value={draftFilters.remitenteCmr}
              onChange={(e) => setDraft("remitenteCmr", e.target.value)}
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Destinatario CMR">
            <input
              type="text"
              value={draftFilters.destinatarioCmr}
              onChange={(e) => setDraft("destinatarioCmr", e.target.value)}
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Mercancía CMR">
            <input
              type="text"
              value={draftFilters.mercanciaCmr}
              onChange={(e) => setDraft("mercanciaCmr", e.target.value)}
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="Matrícula">
            <input
              type="text"
              value={draftFilters.matricula}
              onChange={(e) => setDraft("matricula", e.target.value)}
              style={selectStyle}
            />
          </FilterField>
          <FilterField label="CMR">
            <select value={draftFilters.conCmr} onChange={(e) => setDraft("conCmr", e.target.value)} style={selectStyle}>
              <option value="">Todos</option>
              <option value="si">Con CMR</option>
              <option value="no">Sin CMR</option>
            </select>
          </FilterField>
          <FilterField label="Incidencias">
            <select
              value={draftFilters.conIncidencias}
              onChange={(e) => setDraft("conIncidencias", e.target.value)}
              style={selectStyle}
            >
              <option value="">Todos</option>
              <option value="si">Con incidencias</option>
              <option value="no">Sin incidencias</option>
            </select>
          </FilterField>
          <FilterField label="Documentos">
            <select
              value={draftFilters.conDocumentos}
              onChange={(e) => setDraft("conDocumentos", e.target.value)}
              style={selectStyle}
            >
              <option value="">Todos</option>
              <option value="si">Con documentos</option>
              <option value="no">Sin documentos</option>
            </select>
          </FilterField>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" onClick={handleApply} style={btnStyle(true)}>
            Aplicar filtros
          </button>
          <button type="button" onClick={handleClear} style={btnStyle(false)}>
            Limpiar filtros
          </button>
          <button type="button" onClick={handleExport} style={btnStyle(false)} disabled={!filteredRows.length}>
            Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: su, fontSize: 14 }}>Cargando datos…</div>
      ) : null}
      {error ? (
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#b91c1c", marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {!loading && !filteredRows.length ? (
        <div style={{ padding: 32, textAlign: "center", color: su, fontSize: 14, background: card, borderRadius: 12, border: `1px solid ${border}` }}>
          Sin datos para estos filtros
        </div>
      ) : null}

      {!loading && filteredRows.length > 0 ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <KpiCard label="Servicios totales" value={kpis.serviciosTotales} />
            <KpiCard label="Completados" value={kpis.serviciosCompletados} />
            <KpiCard label="En curso" value={kpis.serviciosEnCurso} />
            <KpiCard label="Pendientes" value={kpis.serviciosPendientes} />
            <KpiCard label="Sin conductor" value={kpis.serviciosSinConductor} />
            <KpiCard label="CMR escaneados" value={kpis.cmrEscaneados} />
            <KpiCard label="Con CMR" value={kpis.serviciosConCmr} />
            <KpiCard label="Sin CMR" value={kpis.serviciosSinCmr} />
            <KpiCard label="Documentos" value={kpis.documentosExtra} />
            <KpiCard label="Incidencias" value={kpis.incidenciasRegistradas} />
            <KpiCard label="Serv. c/ incid." value={kpis.serviciosConIncidencias} />
            <KpiCard label="Peso total kg" value={kpis.pesoTotalKg} />
            <KpiCard label="Peso medio kg" value={kpis.pesoMedioKg} />
            <KpiCard label="Muelle medio min" value={kpis.tiempoMedioMuelleMin} />
            <KpiCard label="Envíos doc." value={kpis.enviosDocumentacion} />
            <KpiCard label="Envíos OK / error" value={`${kpis.enviosCorrectos} / ${kpis.enviosConError}`} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <RankingBlock title="Top clientes (servicios)" items={rankings.topClientesServicios} />
            <RankingBlock title="Top clientes (incidencias)" items={rankings.topClientesIncidencias} />
            <RankingBlock title="Top remitentes CMR" items={rankings.topRemitentesCmr} />
            <RankingBlock title="Top destinatarios CMR" items={rankings.topDestinatariosCmr} />
            <RankingBlock title="Top mercancías CMR" items={rankings.topMercanciasCmr} />
            <RankingBlock title="Top matrículas CMR" items={rankings.topMatriculasCmr} />
            <RankingBlock title="Incidencias por fase" items={rankings.incidenciasPorFase} />
            <RankingBlock title="Servicios por estado" items={rankings.serviciosPorEstado} />
            <RankingBlock title="Documentos por tipo" items={rankings.documentosPorTipo} />
            <PairStat title="CMR con/sin número" aLabel="Con nº" aVal={rankings.cmrConNumero} bLabel="Sin nº" bVal={rankings.cmrSinNumero} />
            <PairStat title="CMR con/sin geo" aLabel="Con geo" aVal={rankings.cmrConGeo} bLabel="Sin geo" bVal={rankings.cmrSinGeo} />
            <PairStat title="Documentación" aLabel="Completa" aVal={rankings.docCompleta} bLabel="Incompleta" bVal={rankings.docIncompleta} />
          </div>

          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 14, color: tx }}>Detalle de servicios</strong>
              <input
                type="search"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar en tabla…"
                style={{ ...selectStyle, flex: "1 1 200px", maxWidth: 320 }}
              />
              <span style={{ fontSize: 12, color: su }}>
                {pagination.totalRows} filas · pág. {pagination.page}/{pagination.totalPages}
              </span>
            </div>

            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${border}`, textAlign: "left" }}>
                    {TABLE_COLS.map((col) => {
                      const sortable = ["fecha", "cliente", "peso", "incidencias"].includes(col.key);
                      return (
                        <th
                          key={col.key}
                          style={{
                            padding: "8px 6px",
                            color: su,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            cursor: sortable ? "pointer" : "default",
                          }}
                          onClick={sortable ? () => toggleSort(col.key) : undefined}
                        >
                          {col.label}
                          {sortable && sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((row) => (
                    <tr key={row.servicioId} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: "7px 6px", whiteSpace: "nowrap" }}>{row.fechaServicioLabel}</td>
                      <td style={{ padding: "7px 6px" }}>{row.referencia}</td>
                      <td style={{ padding: "7px 6px" }}>{row.cliente}</td>
                      <td style={{ padding: "7px 6px" }}>{row.origen}</td>
                      <td style={{ padding: "7px 6px" }}>{row.destino}</td>
                      <td style={{ padding: "7px 6px" }}>{row.conductorNombre}</td>
                      <td style={{ padding: "7px 6px" }}>{row.estadoLabel}</td>
                      <td style={{ padding: "7px 6px" }}>{row.numCmr}</td>
                      <td style={{ padding: "7px 6px" }}>{row.remitente}</td>
                      <td style={{ padding: "7px 6px" }}>{row.destinatario}</td>
                      <td style={{ padding: "7px 6px" }}>{row.transportista}</td>
                      <td style={{ padding: "7px 6px" }}>{row.lugarCargaCmr}</td>
                      <td style={{ padding: "7px 6px" }}>{row.lugarEntregaCmr}</td>
                      <td style={{ padding: "7px 6px" }}>{row.mercancia}</td>
                      <td style={{ padding: "7px 6px" }}>{row.pesoKg ?? "—"}</td>
                      <td style={{ padding: "7px 6px" }}>{row.bultos ?? "—"}</td>
                      <td style={{ padding: "7px 6px" }}>{row.matricula}</td>
                      <td style={{ padding: "7px 6px" }}>{row.incidenciasCount}</td>
                      <td style={{ padding: "7px 6px" }}>{row.documentosCount}</td>
                      <td style={{ padding: "7px 6px" }}>{row.tiempoMuelleMinutos ?? "—"}</td>
                      <td style={{ padding: "7px 6px" }}>{row.documentacionEnviada ? "Sí" : "No"}</td>
                      <td style={{ padding: "7px 6px" }}>{row.estadoEnvioDocumentacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  style={btnStyle(false)}
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  style={btnStyle(false)}
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
