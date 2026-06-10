import { useCallback, useEffect, useState } from "react";
import { getSession } from "../data/supabaseClient.js";
import { PROP_UI, NAV_ITEMS, PAGE_SIZE, fmtD, fmtT } from "../features/superadmin/propietarioTheme.js";
import {
  createSuperadminEmpresa,
  fetchPanelQuery,
  fetchSuperadminDashboard,
  fetchSuperadminEmpresaDetail,
  fetchSupportServicioDiagnostic,
  resetSuperadminPassword,
  toggleSuperadminConductor,
  toggleSuperadminEmpresa,
  toggleSuperadminOfficeUser,
} from "../features/superadmin/superadminApi.js";
import { PropietarioSoporte } from "../features/superadmin/PropietarioSoporte.jsx";
import { PropietarioFilters } from "../features/superadmin/PropietarioFilters.jsx";
import { AdminAgendaComercialPanel } from "../features/superadmin/AdminAgendaComercialPanel.jsx";
import { DEFAULT_FILTERS, VIEW_PANEL_MAP, filtersForApi } from "../features/superadmin/propietarioFiltersModel.js";

const EMPTY_FORM = {
  nombre: "",
  cif: "",
  telefono: "",
  email: "",
  direccion: "",
  ciudad: "",
  cp: "",
};

const cardStyle = {
  background: PROP_UI.card,
  border: `1px solid ${PROP_UI.border}`,
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 1px 3px rgba(15,23,42,.04)",
};

const btnGhost = {
  background: PROP_UI.card,
  color: PROP_UI.text,
  border: `1px solid ${PROP_UI.border}`,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnPrimary = {
  ...btnGhost,
  background: PROP_UI.navActive,
  color: "#fff",
  border: "none",
};

function StatusPill({ active }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 999,
        background: active ? PROP_UI.successBg : PROP_UI.dangerBg,
        color: active ? PROP_UI.success : PROP_UI.danger,
      }}
    >
      {active ? "Activa" : "Inactiva"}
    </span>
  );
}

function MetricCard({ label, value }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: PROP_UI.text }}>{value}</div>
      <div style={{ fontSize: 12, color: PROP_UI.sub, marginTop: 4 }}>{label}</div>
    </div>
  );
}

const cellTd = {
  padding: "10px 12px",
  color: PROP_UI.text,
  verticalAlign: "middle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 0,
};

function SectionBlock({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: PROP_UI.text }}>{title}</div>
      {children}
    </div>
  );
}

function Pagination({ page, totalPages, total, onPage }) {
  if (!total) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 10,
        fontSize: 13,
        color: PROP_UI.sub,
      }}
    >
      <span>
        {total} registro{total !== 1 ? "s" : ""} · Página {page + 1} de {totalPages}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={btnGhost} disabled={page <= 0} onClick={() => onPage(page - 1)}>
          ← Anterior
        </button>
        <button
          type="button"
          style={btnGhost}
          disabled={page >= totalPages - 1}
          onClick={() => onPage(page + 1)}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

function PanelTable({ columns, rows, onRowClick }) {
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  padding: "10px 12px",
                  fontWeight: 700,
                  color: PROP_UI.sub,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  width: c.width,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ padding: 24, textAlign: "center", color: PROP_UI.sub }}>
                Sin registros
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row._key}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                borderTop: `1px solid ${PROP_UI.border}`,
                cursor: onRowClick ? "pointer" : "default",
              }}
            >
              {columns.map((c) => (
                <td key={c.key} style={cellTd} title={typeof row[c.key] === "string" ? row[c.key] : undefined}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SERVICIO_COLUMNS = [
  { key: "refServicio", label: "Ref.", width: "10%" },
  { key: "cliente", label: "Cliente", width: "14%" },
  { key: "ruta", label: "Ruta", width: "18%" },
  { key: "estado", label: "Estado", width: "10%" },
  { key: "fecha", label: "Fecha", width: "12%", render: (r) => fmtT(r.fecha) },
  { key: "empresaNombre", label: "Empresa", width: "14%" },
  { key: "conductoresAsignados", label: "Conductores", width: "14%" },
];

export default function PropietarioLayout({ sbSignOut, getUserId }) {
  const session = getSession();
  const userEmail = session?.user?.email || "jlopezasv@gmail.com";
  const userName = session?.user?.user_metadata?.nombre || "José";

  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [empresasMeta, setEmpresasMeta] = useState([]);

  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [panelRows, setPanelRows] = useState([]);
  const [panelMeta, setPanelMeta] = useState({ total: 0, totalPages: 1, page: 0 });
  const [detail, setDetail] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [servicioDetail, setServicioDetail] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  const showToast = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast(""), 4500);
  }, []);

  useEffect(() => {
    fetchPanelQuery({ view: "meta", filters: {}, page: 0 })
      .then((data) => setEmpresasMeta(data.empresas || []))
      .catch(() => {});
  }, []);

  const loadTab = useCallback(async () => {
    if (tab === "soporte" || tab === "agenda_comercial") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (tab === "dashboard") {
        const [dash, alertData] = await Promise.all([
          fetchSuperadminDashboard(),
          fetchPanelQuery({ view: "dashboard_alerts", filters: filtersForApi(appliedFilters), page: 0 }),
        ]);
        setDashboard(dash);
        setAlerts(alertData.alerts || null);
        setPanelRows([]);
      } else if (tab === "empresas" && detailId) {
        const data = await fetchSuperadminEmpresaDetail(detailId);
        setDetail(data);
      } else {
        const view = VIEW_PANEL_MAP[tab];
        if (view) {
          const data = await fetchPanelQuery({
            view,
            filters: filtersForApi(appliedFilters),
            page,
            pageSize: PAGE_SIZE,
          });
          setPanelRows(data.rows || []);
          setPanelMeta({
            total: data.total || 0,
            totalPages: data.totalPages || 1,
            page: data.page || 0,
          });
        }
      }
    } catch (e) {
      showToast(`Error: ${e.message}`);
    }
    setLoading(false);
  }, [tab, detailId, page, appliedFilters, showToast]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  function applyFilters() {
    setAppliedFilters({ ...filters });
    setPage(0);
  }

  function changeTab(next) {
    setTab(next);
    setPage(0);
    setServicioDetail(null);
    if (next !== "empresas") {
      setDetailId(null);
      setDetail(null);
    }
  }
  async function openDetail(id) {
    setDetailId(id);
    setDetail(null);
  }

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
  }

  async function handleCreate() {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      showToast("Nombre y email obligatorios");
      return;
    }
    setCreateLoading(true);
    try {
      const data = await createSuperadminEmpresa({
        nombre: createForm.nombre.trim(),
        cif: createForm.cif.trim(),
        telefono: createForm.telefono.trim(),
        email: createForm.email.trim(),
        direccion: createForm.direccion.trim(),
        ciudad: createForm.ciudad.trim(),
        cp: createForm.cp.trim(),
      });
      setCreateResult(data);
      setCreateForm(EMPTY_FORM);
      showToast("Empresa creada");
      const meta = await fetchPanelQuery({ view: "meta", filters: {}, page: 0 });
      setEmpresasMeta(meta.empresas || []);
      await loadTab();
    } catch (e) {
      showToast(e.message);
    }
    setCreateLoading(false);
  }

  async function runAction(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await loadTab();
      showToast("Actualizado");
    } catch (e) {
      showToast(e.message);
    }
    setBusy(false);
  }

  async function openServicioDetail(id) {
    setBusy(true);
    try {
      const data = await fetchSupportServicioDiagnostic(id);
      setServicioDetail(data);
    } catch (e) {
      showToast(e.message);
    }
    setBusy(false);
  }

  function envioLabel(estado) {
    const map = {
      enviado: "Enviado",
      sent: "Enviado",
      pendiente: "Pendiente",
      simulado: "Simulado",
      error: "Error",
      sin_envio: "Sin envío",
    };
    return map[estado] || estado || "—";
  }

  const content = loading ? (
    <div style={{ padding: 48, textAlign: "center", color: PROP_UI.sub }}>Cargando…</div>
  ) : tab === "dashboard" && dashboard ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <MetricCard label="Empresas activas" value={dashboard.stats.empresasActivas} />
        <MetricCard label="Empresas totales" value={dashboard.stats.empresasTotal} />
        <MetricCard label="Conductores activos" value={dashboard.stats.conductoresActivos} />
        <MetricCard label="Usuarios oficina" value={dashboard.stats.usuariosOficinaActivos} />
        <MetricCard label="Servicios activos" value={dashboard.stats.serviciosActivos} />
        <MetricCard label="Servicios del mes" value={dashboard.stats.serviciosMes} />
        <MetricCard label="Documentos subidos" value={dashboard.stats.documentosSubidos} />
        <MetricCard label="Sin actividad (30d)" value={dashboard.stats.empresasSinActividad} />
      </div>
      <SectionBlock title="Últimas empresas">
        <PanelTable
          columns={[
            { key: "nombre", label: "Empresa", width: "40%" },
            { key: "codigoEquipo", label: "Código", width: "20%" },
            { key: "activa", label: "Estado", width: "15%", render: (r) => <StatusPill active={r.activa} /> },
            { key: "createdAt", label: "Alta", width: "25%", render: (r) => fmtD(r.createdAt) },
          ]}
          rows={(dashboard.ultimasEmpresas || []).map((e) => ({ ...e, _key: e.id }))}
        />
      </SectionBlock>
      <SectionBlock title="Últimos servicios">
        <PanelTable
          columns={SERVICIO_COLUMNS}
          rows={(dashboard.ultimosServicios || []).map((s) => ({ ...s, _key: s.id }))}
        />
      </SectionBlock>
      <SectionBlock title="Más actividad (30 días)">
        <PanelTable
          columns={[
            { key: "nombre", label: "Empresa", width: "60%" },
            { key: "servicios30d", label: "Servicios", width: "20%" },
            { key: "id", label: "", width: "20%", render: () => "" },
          ]}
          rows={(dashboard.empresasMasActividad || []).map((e) => ({ ...e, _key: e.id }))}
        />
      </SectionBlock>
      {alerts && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <MetricCard label="Servicios sin conductor" value={alerts.serviciosSinConductor} />
            <MetricCard label="Envíos pendientes" value={alerts.enviosPendientes} />
            <MetricCard label="Envíos con error" value={alerts.enviosError} />
            <MetricCard label="Cond. sin ubicación (7d)" value={alerts.conductoresSinUbicacion} />
            <MetricCard label="Oficina inactivos" value={alerts.usuariosOficinaInactivos} />
          </div>
          <SectionBlock title="Empresas sin actividad (30 días)">
            <PanelTable
              columns={[
                { key: "nombre", label: "Empresa", width: "55%" },
                { key: "ultimoServicio", label: "Último servicio", width: "45%", render: (r) => fmtT(r.ultimoServicio) },
              ]}
              rows={(alerts.empresasSinActividad || []).map((e) => ({ ...e, _key: e.id }))}
              onRowClick={(r) => { changeTab("empresas"); openDetail(r.id); }}
            />
          </SectionBlock>
          <SectionBlock title="Últimas empresas creadas">
            <PanelTable
              columns={[
                { key: "nombre", label: "Empresa", width: "40%" },
                { key: "codigoEquipo", label: "Código", width: "20%" },
                { key: "activa", label: "Estado", width: "15%", render: (r) => <StatusPill active={r.activa} /> },
                { key: "createdAt", label: "Alta", width: "25%", render: (r) => fmtD(r.createdAt) },
              ]}
              rows={(alerts.ultimasEmpresasCreadas || []).map((e) => ({ ...e, _key: e.id }))}
              onRowClick={(r) => { changeTab("empresas"); openDetail(r.id); }}
            />
          </SectionBlock>
        </>
      )}
    </div>
  ) : tab === "empresas" && detailId && detail ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button type="button" onClick={closeDetail} style={btnGhost}>
        ← Volver a empresas
      </button>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{detail.empresa?.nombre}</div>
        <div style={{ fontSize: 13, color: PROP_UI.sub, lineHeight: 1.6 }}>
          {detail.empresa?.cif && <div>CIF: {detail.empresa.cif}</div>}
          <div>Código: {detail.empresa?.codigoEquipo || "—"}</div>
          <div>Alta: {fmtD(detail.empresa?.createdAt)}</div>
          {detail.empresa?.email && <div>Email: {detail.empresa.email}</div>}
          {detail.empresa?.telefono && <div>Tel: {detail.empresa.telefono}</div>}
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Conductores</div>
        {(detail.conductores || []).map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${PROP_UI.border}` }}>
            <div>
              <div style={{ fontWeight: 600 }}>{c.nombre}</div>
              <div style={{ fontSize: 12, color: PROP_UI.sub }}>{c.matricula || "—"} · {c.activo ? "Activo" : "Inactivo"}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" disabled={busy} style={btnGhost} onClick={() => runAction(() => toggleSuperadminConductor(c.id, !c.activo))}>
                {c.activo ? "Desactivar" : "Activar"}
              </button>
              <button type="button" disabled={busy} style={btnGhost} onClick={() => runAction(async () => { const r = await resetSuperadminPassword(c.userId); showToast(r.message); })}>
                Reset pass
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Usuarios oficina</div>
        {(detail.officeUsers || []).map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${PROP_UI.border}` }}>
            <div>
              <div style={{ fontWeight: 600 }}>{u.nombre}</div>
              <div style={{ fontSize: 12, color: PROP_UI.sub }}>{u.email} · {u.rol} · {u.activo ? "Activo" : "Inactivo"}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" disabled={busy} style={btnGhost} onClick={() => runAction(() => toggleSuperadminOfficeUser(u.id, !u.activo))}>
                {u.activo ? "Desactivar" : "Activar"}
              </button>
              <button type="button" disabled={busy} style={btnGhost} onClick={() => runAction(async () => { const r = await resetSuperadminPassword(u.userId); showToast(r.message); })}>
                Reset pass
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Servicios</div>
        <div style={{ fontSize: 13, color: PROP_UI.sub, marginBottom: 8 }}>
          Activos {detail.servicios?.stats?.activos} · Completados {detail.servicios?.stats?.completados} · Anulados {detail.servicios?.stats?.anulados}
        </div>
        <PanelTable
          columns={SERVICIO_COLUMNS}
          rows={(detail.servicios?.recientes || []).map((s) => ({ ...s, _key: s.id }))}
        />
      </div>
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Documentos ({detail.documentos?.cantidad || 0})</div>
        {(detail.documentos?.recientes || []).map((d) => (
          <div key={d.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${PROP_UI.border}` }}>
            {d.nombre || d.tipo} · {fmtT(d.createdAt)}
          </div>
        ))}
      </div>
    </div>
  ) : tab === "empresas" ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={btnPrimary} onClick={() => { setCreateOpen(true); setCreateResult(null); }}>
          + Crear empresa
        </button>
      </div>
      {createOpen && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Nueva empresa</div>
          {[
            { k: "nombre", ph: "Nombre empresa *" },
            { k: "cif", ph: "CIF" },
            { k: "telefono", ph: "Teléfono" },
            { k: "email", ph: "Email jefe de flota *" },
            { k: "direccion", ph: "Dirección" },
            { k: "ciudad", ph: "Ciudad" },
            { k: "cp", ph: "Código postal" },
          ].map(({ k, ph }) => (
            <input
              key={k}
              type="text"
              value={createForm[k]}
              placeholder={ph}
              onChange={(e) => setCreateForm((p) => ({ ...p, [k]: e.target.value }))}
              style={{ width: "100%", marginBottom: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${PROP_UI.border}`, fontSize: 14, boxSizing: "border-box" }}
            />
          ))}
          {createResult && (
            <div style={{ background: PROP_UI.successBg, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13, color: PROP_UI.success }}>
              Código: {createResult.empresa?.codigoEquipo} · Email: {createResult.jefeFlota?.email} · Pass: {createResult.jefeFlota?.password}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btnGhost} onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="button" style={btnPrimary} disabled={createLoading} onClick={handleCreate}>
              {createLoading ? "Creando…" : "Crear empresa"}
            </button>
          </div>
        </div>
      )}
      <PanelTable
        columns={[
          { key: "nombre", label: "Empresa", width: "16%" },
          { key: "cif", label: "CIF", width: "10%", render: (r) => r.cif || "—" },
          { key: "codigoEquipo", label: "Código", width: "9%", render: (r) => <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.codigoEquipo || "—"}</span> },
          { key: "activa", label: "Estado", width: "8%", render: (r) => <StatusPill active={r.activa} /> },
          { key: "conductores", label: "Cond.", width: "8%", render: (r) => `${r.conductoresActivos}/${r.conductoresTotales}` },
          { key: "office", label: "Oficina", width: "8%", render: (r) => `${r.officeActivos}/${r.officeTotales}` },
          { key: "serviciosActivos", label: "Serv. act.", width: "8%" },
          { key: "serviciosMes", label: "Serv. mes", width: "8%" },
          { key: "ultimaActividad", label: "Última act.", width: "12%", render: (r) => fmtT(r.ultimaActividad) },
          {
            key: "actions",
            label: "",
            width: "13%",
            render: (r) => (
              <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" style={btnGhost} onClick={() => openDetail(r.id)}>Ver</button>
                <button type="button" style={btnGhost} disabled={busy} onClick={() => runAction(() => toggleSuperadminEmpresa(r.id, !r.activa))}>
                  {r.activa ? "Off" : "On"}
                </button>
              </div>
            ),
          },
        ]}
        rows={panelRows.map((e) => ({ ...e, _key: e.id }))}
        onRowClick={(r) => openDetail(r.id)}
      />
      <Pagination page={panelMeta.page} totalPages={panelMeta.totalPages} total={panelMeta.total} onPage={setPage} />
    </div>
  ) : tab === "conductores" ? (
    <div>
      <PanelTable
        columns={[
          { key: "nombre", label: "Nombre", width: "14%" },
          { key: "email", label: "Email", width: "14%", render: (r) => r.email || "—" },
          { key: "telefono", label: "Teléfono", width: "10%", render: (r) => r.telefono || "—" },
          { key: "empresaNombre", label: "Empresa", width: "14%" },
          { key: "activo", label: "Estado", width: "8%", render: (r) => (r.activo ? "Activo" : "Inactivo") },
          { key: "ultimaUbicacion", label: "Últ. ubicación", width: "12%", render: (r) => fmtT(r.ultimaUbicacion) },
          { key: "serviciosActivos", label: "Serv. act.", width: "8%" },
          { key: "ultimoServicio", label: "Últ. servicio", width: "12%", render: (r) => fmtT(r.ultimoServicio) },
          {
            key: "actions",
            label: "",
            width: "8%",
            render: (r) => (
              <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" style={btnGhost} onClick={() => { changeTab("empresas"); openDetail(r.empresaId); }}>Ver</button>
                <button type="button" style={btnGhost} disabled={busy} onClick={() => runAction(() => toggleSuperadminConductor(r.id, !r.activo))}>
                  {r.activo ? "Off" : "On"}
                </button>
              </div>
            ),
          },
        ]}
        rows={panelRows.map((c) => ({ ...c, _key: c.id }))}
      />
      <Pagination page={panelMeta.page} totalPages={panelMeta.totalPages} total={panelMeta.total} onPage={setPage} />
    </div>
  ) : tab === "usuarios" ? (
    <div>
      <PanelTable
        columns={[
          { key: "nombre", label: "Nombre", width: "16%" },
          { key: "email", label: "Email", width: "18%" },
          { key: "empresaNombre", label: "Empresa", width: "16%" },
          { key: "rol", label: "Rol", width: "10%" },
          { key: "puedeVerTodos", label: "Ver todos", width: "8%", render: (r) => (r.puedeVerTodos ? "Sí" : "No") },
          { key: "activo", label: "Estado", width: "8%", render: (r) => (r.activo ? "Activo" : "Inactivo") },
          {
            key: "actions",
            label: "",
            width: "24%",
            render: (r) => (
              <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  style={btnGhost}
                  disabled={busy}
                  onClick={() => runAction(async () => { const res = await resetSuperadminPassword(r.userId); showToast(res.message); })}
                >
                  Reset pass
                </button>
                <button type="button" style={btnGhost} disabled={busy} onClick={() => runAction(() => toggleSuperadminOfficeUser(r.id, !r.activo))}>
                  {r.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            ),
          },
        ]}
        rows={panelRows.map((u) => ({ ...u, _key: u.id }))}
      />
      <Pagination page={panelMeta.page} totalPages={panelMeta.totalPages} total={panelMeta.total} onPage={setPage} />
    </div>
  ) : tab === "servicios" ? (
    <div>
      {servicioDetail?.servicio && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Detalle servicio · {servicioDetail.servicio.refServicio}</div>
            <button type="button" style={btnGhost} onClick={() => setServicioDetail(null)}>Cerrar</button>
          </div>
          <div style={{ fontSize: 13, color: PROP_UI.sub, lineHeight: 1.6 }}>
            <div>{servicioDetail.servicio.cliente} · {servicioDetail.servicio.ruta}</div>
            <div>Estado: {servicioDetail.servicio.estado} · Conductor: {servicioDetail.conductorPrincipal || "—"}</div>
          </div>
        </div>
      )}
      <PanelTable
        columns={[
          { key: "refServicio", label: "Ref.", width: "9%" },
          { key: "cliente", label: "Cliente", width: "11%" },
          { key: "empresaNombre", label: "Empresa", width: "11%" },
          { key: "responsable", label: "Responsable", width: "10%" },
          { key: "conductoresAsignados", label: "Conductores", width: "11%" },
          { key: "ruta", label: "Origen → destino", width: "14%" },
          { key: "estado", label: "Estado", width: "8%" },
          { key: "fechaSalida", label: "Salida", width: "10%", render: (r) => fmtT(r.fechaSalida) },
          { key: "documentos", label: "Docs", width: "5%" },
          { key: "incidencias", label: "Inc.", width: "5%" },
          {
            key: "actions",
            label: "",
            width: "6%",
            render: (r) => (
              <button type="button" style={btnGhost} onClick={() => openServicioDetail(r.id)}>Ver</button>
            ),
          },
        ]}
        rows={panelRows.map((s) => ({ ...s, _key: s.id }))}
      />
      <Pagination page={panelMeta.page} totalPages={panelMeta.totalPages} total={panelMeta.total} onPage={setPage} />
    </div>
  ) : tab === "documentos" ? (
    <div>
      <PanelTable
        columns={[
          { key: "refServicio", label: "Servicio", width: "14%" },
          { key: "empresaNombre", label: "Empresa", width: "16%" },
          { key: "cliente", label: "Cliente", width: "16%" },
          { key: "estadoEnvio", label: "Envío", width: "12%", render: (r) => envioLabel(r.estadoEnvio) },
          { key: "fecha", label: "Fecha", width: "14%", render: (r) => fmtT(r.fecha) },
          { key: "numDocumentos", label: "Nº docs", width: "8%" },
          {
            key: "actions",
            label: "",
            width: "20%",
            render: (r) => (
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" style={btnGhost} onClick={() => openServicioDetail(r.servicioId)}>Ver</button>
                {(r.estadoEnvio === "error" || r.estadoEnvio === "pendiente") && (
                  <button type="button" style={btnGhost} disabled title="Reenvío manual pendiente de integrar">
                    Reenviar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        rows={panelRows.map((d) => ({ ...d, _key: d.servicioId }))}
      />
      <Pagination page={panelMeta.page} totalPages={panelMeta.totalPages} total={panelMeta.total} onPage={setPage} />
    </div>
  ) : tab === "agenda_comercial" ? (
    <AdminAgendaComercialPanel showToast={showToast} />
  ) : tab === "soporte" ? (
    <PropietarioSoporte
      showToast={showToast}
      busy={busy}
      setBusy={setBusy}
      runReload={loadTab}
      onVerEmpresaServicios={(empresaId) => {
        setAppliedFilters((f) => ({ ...f, empresaId }));
        setFilters((f) => ({ ...f, empresaId }));
        changeTab("servicios");
      }}
    />
  ) : null;

  return (
    <div style={{ minHeight: "100vh", background: PROP_UI.bg, fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <header
        style={{
          background: PROP_UI.headerBg,
          borderBottom: `1px solid ${PROP_UI.border}`,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: PROP_UI.sub, fontWeight: 700, letterSpacing: 0.8 }}>
            CUADERNO DE RUTA · Panel Propietario
          </div>
          <div style={{ fontSize: 13, color: PROP_UI.text, marginTop: 2 }}>
            {userName} · {userEmail}
          </div>
        </div>
        <button
          type="button"
          style={btnGhost}
          onClick={async () => {
            await sbSignOut();
            window.location.reload();
          }}
        >
          Salir
        </button>
      </header>

      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>
        <nav
          style={{
            width: 200,
            flexShrink: 0,
            background: PROP_UI.card,
            borderRight: `1px solid ${PROP_UI.border}`,
            padding: "16px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => changeTab(item.id)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                background: tab === item.id ? "#f1f5f9" : "transparent",
                color: tab === item.id ? PROP_UI.navActive : PROP_UI.navIdle,
                fontWeight: tab === item.id ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: "20px 24px 40px", maxWidth: 1200, minWidth: 0, overflow: "hidden" }}>
          {tab !== "soporte" && tab !== "agenda_comercial" && !(tab === "empresas" && detailId) && (
            <PropietarioFilters
              filters={filters}
              onChange={setFilters}
              empresasOptions={empresasMeta}
              tab={tab}
              onApply={applyFilters}
            />
          )}
          {content}
        </main>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: PROP_UI.navActive,
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
