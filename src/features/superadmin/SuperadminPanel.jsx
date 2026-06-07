import { useCallback, useEffect, useState } from "react";
import {
  createSuperadminEmpresa,
  fetchSuperadminDashboard,
  fetchSuperadminEmpresaDetail,
  fetchSuperadminEmpresas,
  resetSuperadminPassword,
  toggleSuperadminConductor,
  toggleSuperadminEmpresa,
  toggleSuperadminOfficeUser,
} from "./superadminApi.js";

const UI = {
  bg: "#F0F4F8",
  card: "#FFFFFF",
  text: "#0F172A",
  sub: "#64748B",
  accent: "#F59E0B",
  header: "#1E293B",
};

function fmtD(d) {
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

function fmtT(d) {
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

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.07)",
        borderRadius: 10,
        padding: "12px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const EMPTY_FORM = {
  nombre: "",
  cif: "",
  telefono: "",
  email: "",
  direccion: "",
  ciudad: "",
  cp: "",
};

export function SuperadminPanel() {
  const [vista, setVista] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast(""), 4500);
  }, []);

  const loadDashboard = useCallback(async () => {
    const data = await fetchSuperadminDashboard();
    setStats(data.stats || null);
  }, []);

  const loadEmpresas = useCallback(async () => {
    const data = await fetchSuperadminEmpresas();
    setEmpresas(data.empresas || []);
  }, []);

  const loadDetail = useCallback(async (empresaId) => {
    const data = await fetchSuperadminEmpresaDetail(empresaId);
    setDetail(data);
    setDetailId(empresaId);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (vista === "dashboard") await loadDashboard();
      else if (vista === "empresas") await loadEmpresas();
      else if (vista === "detalle" && detailId) await loadDetail(detailId);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
    setLoading(false);
  }, [vista, detailId, loadDashboard, loadEmpresas, loadDetail, showToast]);

  useEffect(() => {
    refresh();
  }, [vista]);

  async function openDetail(empresaId) {
    setVista("detalle");
    setLoading(true);
    try {
      await loadDetail(empresaId);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      showToast("❌ Nombre y email obligatorios");
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
      showToast("✅ Empresa creada");
      await loadEmpresas();
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
    setCreateLoading(false);
  }

  async function runToggle(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
      showToast("✅ Actualizado");
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
    setBusy(false);
  }

  if (loading && !stats && !empresas.length && !detail) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: UI.sub }}>
        ⏳ Cargando panel propietario...
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 88px", background: UI.bg, minHeight: "100vh" }}>
      <div
        style={{
          background: UI.header,
          borderRadius: 16,
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>
          PANEL PROPIETARIO
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: UI.accent, marginBottom: 12 }}>
          ⚡ Gestión plataforma
        </div>
        {stats && vista === "dashboard" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            <StatCard label="Empresas activas" value={stats.empresasActivas} color="#F59E0B" />
            <StatCard label="Conductores activos" value={stats.conductoresActivos} color="#22C55E" />
            <StatCard label="Usuarios oficina" value={stats.usuariosOficinaActivos} color="#06B6D4" />
            <StatCard label="Servicios activos" value={stats.serviciosActivos} color="#A78BFA" />
            <StatCard label="Servicios del mes" value={stats.serviciosMes} color="#38BDF8" />
            <StatCard label="Documentos subidos" value={stats.documentosSubidos} color="#FB7185" />
            <StatCard
              label="Empresas sin actividad (30d)"
              value={stats.empresasSinActividad}
              color="#F87171"
            />
            <StatCard label="Empresas totales" value={stats.empresasTotal} color="#E2E8F0" />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { id: "dashboard", label: "📊 Dashboard" },
          { id: "empresas", label: "🏢 Empresas" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setVista(t.id);
              setDetail(null);
              setDetailId(null);
            }}
            style={{
              flex: "1 1 120px",
              background: vista === t.id ? UI.header : UI.card,
              color: vista === t.id ? UI.accent : UI.sub,
              border: `2px solid ${vista === t.id ? "#334155" : "#E2E8F0"}`,
              borderRadius: 10,
              padding: "10px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
        {vista === "detalle" && (
          <button
            type="button"
            onClick={() => setVista("empresas")}
            style={{
              flex: "1 1 120px",
              background: UI.card,
              color: UI.sub,
              border: "2px solid #E2E8F0",
              borderRadius: 10,
              padding: "10px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ← Empresas
          </button>
        )}
      </div>

      {vista === "empresas" && (
        <>
          {!createOpen ? (
            <button
              type="button"
              onClick={() => {
                setCreateOpen(true);
                setCreateResult(null);
              }}
              style={{
                width: "100%",
                background: "#22C55E",
                color: "white",
                border: "none",
                borderRadius: 12,
                padding: "13px",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                marginBottom: 14,
              }}
            >
              + Crear empresa
            </button>
          ) : (
            <div
              style={{
                background: UI.card,
                borderRadius: 14,
                padding: 18,
                marginBottom: 14,
                boxShadow: "0 2px 6px rgba(0,0,0,.05)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: UI.text, marginBottom: 14 }}>
                Nueva empresa
              </div>
              {[
                { k: "nombre", ph: "Nombre empresa *", label: "Nombre" },
                { k: "cif", ph: "CIF", label: "CIF" },
                { k: "telefono", ph: "Teléfono", label: "Teléfono" },
                { k: "email", ph: "Email jefe de flota *", label: "Email jefe" },
                { k: "direccion", ph: "Dirección", label: "Dirección" },
                { k: "ciudad", ph: "Ciudad", label: "Ciudad" },
                { k: "cp", ph: "Código postal", label: "CP" },
              ].map(({ k, ph, label }) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: UI.sub, fontWeight: 700, marginBottom: 4 }}>
                    {label.toUpperCase()}
                  </div>
                  <input
                    type="text"
                    value={createForm[k]}
                    onChange={(e) => setCreateForm((p) => ({ ...p, [k]: e.target.value }))}
                    placeholder={ph}
                    style={{
                      width: "100%",
                      background: "#F8FAFC",
                      border: "2px solid #E2E8F0",
                      borderRadius: 9,
                      padding: "11px 13px",
                      fontSize: 14,
                      color: UI.text,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
              {createResult && (
                <div
                  style={{
                    background: "#F0FDF4",
                    border: "1px solid #BBF7D0",
                    borderRadius: 9,
                    padding: "12px 14px",
                    marginBottom: 12,
                    fontSize: 13,
                    color: "#166534",
                    lineHeight: 1.5,
                  }}
                >
                  <div>
                    <strong>Código empresa:</strong>{" "}
                    {createResult.empresa?.codigoEquipo || "—"}
                  </div>
                  <div>
                    <strong>Email:</strong> {createResult.jefeFlota?.email}
                  </div>
                  <div>
                    <strong>Contraseña temporal:</strong> {createResult.jefeFlota?.password}
                  </div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateResult(null);
                  }}
                  style={{
                    background: "#334155",
                    color: "white",
                    border: "none",
                    borderRadius: 9,
                    padding: "11px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createLoading}
                  style={{
                    background: createLoading ? "#475569" : "#22C55E",
                    color: "white",
                    border: "none",
                    borderRadius: 9,
                    padding: "11px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: createLoading ? "default" : "pointer",
                  }}
                >
                  {createLoading ? "⏳ Creando..." : "✓ Crear"}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {empresas.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: UI.sub }}>
                Sin empresas en producción
              </div>
            )}
            {empresas.map((e) => (
              <div
                key={e.id}
                style={{
                  background: UI.card,
                  borderRadius: 14,
                  padding: "14px 16px",
                  boxShadow: "0 2px 6px rgba(0,0,0,.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: UI.text }}>{e.nombre}</div>
                    {e.cif && (
                      <div style={{ fontSize: 12, color: UI.sub }}>CIF: {e.cif}</div>
                    )}
                    <div style={{ fontSize: 11, color: UI.sub, marginTop: 2 }}>
                      Alta: {fmtD(e.createdAt)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: e.activa ? "#DCFCE7" : "#FEE2E2",
                      color: e.activa ? "#166534" : "#991B1B",
                    }}
                  >
                    {e.activa ? "ACTIVA" : "INACTIVA"}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 8,
                    marginBottom: 10,
                    fontSize: 12,
                  }}
                >
                  <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ color: UI.sub, fontSize: 10, fontWeight: 700 }}>CÓDIGO</div>
                    <div style={{ fontWeight: 800, color: UI.accent, fontFamily: "monospace" }}>
                      {e.codigoEquipo || "—"}
                    </div>
                  </div>
                  <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ color: UI.sub, fontSize: 10, fontWeight: 700 }}>ÚLTIMO SERVICIO</div>
                    <div style={{ fontWeight: 700 }}>{fmtT(e.ultimoServicio)}</div>
                  </div>
                  <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "8px 10px" }}>
                    Conductores: <strong>{e.conductores}</strong>
                  </div>
                  <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "8px 10px" }}>
                    Oficina: <strong>{e.usuariosOficina}</strong> · Servicios:{" "}
                    <strong>{e.servicios}</strong>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => openDetail(e.id)}
                    style={{
                      background: "#EFF6FF",
                      color: "#1D4ED8",
                      border: "1px solid #BFDBFE",
                      borderRadius: 9,
                      padding: "8px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Ver detalle
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runToggle(() => toggleSuperadminEmpresa(e.id, !e.activa))
                    }
                    style={{
                      background: e.activa ? "#FFFBEB" : "#F0FDF4",
                      color: e.activa ? "#B45309" : "#166534",
                      border: `1px solid ${e.activa ? "#FDE68A" : "#BBF7D0"}`,
                      borderRadius: 9,
                      padding: "8px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {e.activa ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {vista === "detalle" && detail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              background: UI.card,
              borderRadius: 14,
              padding: 16,
              boxShadow: "0 2px 6px rgba(0,0,0,.05)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: UI.text, marginBottom: 8 }}>
              {detail.empresa?.nombre}
            </div>
            <div style={{ fontSize: 13, color: UI.sub, lineHeight: 1.6 }}>
              {detail.empresa?.cif && <div>CIF: {detail.empresa.cif}</div>}
              <div>Código: {detail.empresa?.codigoEquipo || "—"}</div>
              <div>Alta: {fmtD(detail.empresa?.createdAt)}</div>
              {detail.empresa?.email && <div>Email: {detail.empresa.email}</div>}
              {detail.empresa?.telefono && <div>Tel: {detail.empresa.telefono}</div>}
              {(detail.empresa?.direccion || detail.empresa?.ciudad) && (
                <div>
                  {[detail.empresa.direccion, detail.empresa.ciudad, detail.empresa.cp]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
              {detail.empresa?.subscription && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  Plan: {detail.empresa.subscription.plan} · Estado:{" "}
                  {detail.empresa.subscription.status}
                </div>
              )}
            </div>
          </div>

          <Section title={`Conductores (${detail.conductores?.length || 0})`}>
            {(detail.conductores || []).map((c) => (
              <Row
                key={c.id}
                title={c.nombre}
                sub={`${c.matricula || "Sin matrícula"} · ${c.activo ? "Activo" : "Inactivo"}`}
                actions={
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runToggle(() => toggleSuperadminConductor(c.id, !c.activo))
                      }
                      style={btnSmall}
                    >
                      {c.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runToggle(async () => {
                          const r = await resetSuperadminPassword(c.userId);
                          showToast(`🔑 ${r.message}`);
                        })
                      }
                      style={btnSmall}
                    >
                      Reset pass
                    </button>
                  </>
                }
              />
            ))}
            {!detail.conductores?.length && <EmptyRow text="Sin conductores" />}
          </Section>

          <Section title={`Usuarios oficina (${detail.officeUsers?.length || 0})`}>
            {(detail.officeUsers || []).map((u) => (
              <Row
                key={u.id}
                title={u.nombre}
                sub={`${u.email || "—"} · ${u.rol} · ${u.puedeVerTodos ? "ve todos" : "solo suyos"} · ${u.activo ? "Activo" : "Inactivo"}`}
                actions={
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runToggle(() => toggleSuperadminOfficeUser(u.id, !u.activo))
                      }
                      style={btnSmall}
                    >
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runToggle(async () => {
                          const r = await resetSuperadminPassword(u.userId);
                          showToast(`🔑 ${r.message}`);
                        })
                      }
                      style={btnSmall}
                    >
                      Reset pass
                    </button>
                  </>
                }
              />
            ))}
            {!detail.officeUsers?.length && <EmptyRow text="Sin usuarios de oficina" />}
          </Section>

          <Section title="Servicios">
            <div style={{ fontSize: 13, color: UI.sub, marginBottom: 8 }}>
              Activos: {detail.servicios?.stats?.activos} · Completados:{" "}
              {detail.servicios?.stats?.completados} · Anulados:{" "}
              {detail.servicios?.stats?.anulados}
            </div>
            {(detail.servicios?.recientes || []).map((s) => (
              <Row
                key={s.id}
                title={s.referencia || s.origen || s.id.slice(0, 8)}
                sub={`${s.estado} · ${fmtT(s.createdAt)}`}
              />
            ))}
          </Section>

          <Section title={`Documentos (${detail.documentos?.cantidad || 0})`}>
            {(detail.documentos?.recientes || []).map((d) => (
              <Row
                key={d.id}
                title={d.nombre || d.tipo || "Documento"}
                sub={fmtT(d.createdAt)}
              />
            ))}
            {!detail.documentos?.recientes?.length && <EmptyRow text="Sin documentos recientes" />}
          </Section>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1E293B",
            color: "white",
            padding: "10px 20px",
            borderRadius: 11,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 700,
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

const btnSmall = {
  background: "#F1F5F9",
  color: "#334155",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

function Section({ title, children }) {
  return (
    <div
      style={{
        background: UI.card,
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 2px 6px rgba(0,0,0,.05)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: UI.sub,
          letterSpacing: 0.5,
          marginBottom: 10,
        }}
      >
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Row({ title, sub, actions }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid #F1F5F9",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: UI.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: UI.sub }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{ fontSize: 12, color: UI.sub, textAlign: "center", padding: "12px 0" }}>
      {text}
    </div>
  );
}
