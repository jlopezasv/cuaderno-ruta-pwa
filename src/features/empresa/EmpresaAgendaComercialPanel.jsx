import React, { useCallback, useEffect, useMemo, useState } from "react";
import { UI_TOKENS } from "../../ui/visualTokens.js";
import {
  AGENDA_VISTAS,
  DOLORES_DETECTADOS,
  ESTADOS_COMERCIALES,
  SISTEMAS_ACTUALES,
  TIPOS_ACCION,
  TIPOS_RUTA,
  TIPOS_VEHICULO,
  estadoComercialLabel,
  tipoAccionLabel,
} from "../../domain/empresa/agendaComercialConstants.js";
import { AGENDA_CONTEXT, AGENDA_UI_COPY } from "../../domain/empresa/agendaComercialContext.js";
import {
  accionToForm,
  adminAgendaApi,
  applyAgendaListFilters,
  buildAgendaProspectoRows,
  computeAgendaKpis,
  emptyAccionForm,
  emptyContactoForm,
  emptyProspectoForm,
  empresaCrmApi,
  formatFechaHora,
  listAccionesAgenda,
  prospectoToForm,
  toggleArray,
} from "../../domain/empresa/agendaComercialModel.js";

const card = UI_TOKENS.surface;
const border = UI_TOKENS.border;
const tx = UI_TOKENS.ink;
const su = UI_TOKENS.muted;
const accent = UI_TOKENS.brand;

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${border}`,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: card,
  color: tx,
};

const labelStyle = { fontSize: 10, fontWeight: 700, color: su, marginBottom: 4, letterSpacing: 0.3 };

const btn = (primary = false) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: primary ? "none" : `1px solid ${border}`,
  background: primary ? accent : card,
  color: primary ? "#fff" : tx,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
});

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 160px", minWidth: 120 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: su, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}

function ChipGroup({ options, selected, onToggle }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((opt) => {
        const id = typeof opt === "string" ? opt : opt.id;
        const label = typeof opt === "string" ? opt : opt.label;
        const on = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            style={{
              padding: "5px 10px",
              borderRadius: 20,
              border: `1px solid ${on ? accent : border}`,
              background: on ? UI_TOKENS.brandSoft : card,
              color: on ? accent : tx,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        zIndex: 400,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "12px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: card,
          borderRadius: "16px 16px 12px 12px",
          width: "100%",
          maxWidth: wide ? 720 : 520,
          maxHeight: "92vh",
          overflow: "auto",
          padding: "18px 20px",
          boxShadow: "0 20px 40px rgba(15,23,42,.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: tx }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ ...btn(), padding: "6px 10px" }}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const DEFAULT_FILTERS = {
  q: "",
  estadoComercial: "",
  localidad: "",
  camionesMin: "",
  tipoRuta: "",
  sistemaActual: "",
  soloPendientesSeguimiento: false,
};

export function EmpresaAgendaComercialPanel({
  empresaId,
  showToast,
  contextKey = AGENDA_CONTEXT.EMPRESA_CRM,
}) {
  const api = contextKey === AGENDA_CONTEXT.ADMIN ? adminAgendaApi : empresaCrmApi;
  const copy = AGENDA_UI_COPY[contextKey] || AGENDA_UI_COPY[AGENDA_CONTEXT.EMPRESA_CRM];
  const isAdminAgenda = contextKey === AGENDA_CONTEXT.ADMIN;
  const tenantKey = isAdminAgenda ? null : empresaId;

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [agendaVista, setAgendaVista] = useState(AGENDA_VISTAS.TODAS);
  const [fichaId, setFichaId] = useState(null);
  const [modalEmpresa, setModalEmpresa] = useState(null);
  const [modalContacto, setModalContacto] = useState(null);
  const [modalAccion, setModalAccion] = useState(null);
  const [fichaTab, setFichaTab] = useState("empresa");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!isAdminAgenda && !empresaId) return;
    setLoading(true);
    try {
      const data = await api.fetchBundle(tenantKey);
      setBundle(data);
      setTableMissing(!!data.tableMissing);
    } catch (_) {
      showToast?.("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [api, empresaId, isAdminAgenda, showToast, tenantKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => buildAgendaProspectoRows(bundle || {}), [bundle]);
  const filtered = useMemo(
    () => applyAgendaListFilters(rows, filters, agendaVista),
    [rows, filters, agendaVista],
  );
  const kpis = useMemo(() => computeAgendaKpis(rows), [rows]);
  const accionesVista = useMemo(
    () => listAccionesAgenda(filtered, agendaVista),
    [filtered, agendaVista],
  );
  const fichaRow = useMemo(() => rows.find((r) => r.id === fichaId) || null, [rows, fichaId]);

  async function handleSaveProspecto(form, id) {
    setSaving(true);
    try {
      await api.saveProspecto(tenantKey, form, id);
      showToast?.(id ? "Registro actualizado" : "Registro creado");
      setModalEmpresa(null);
      await reload();
    } catch (e) {
      showToast?.(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContacto(prospectoId, form, id) {
    setSaving(true);
    try {
      await api.saveContacto(tenantKey, prospectoId, form, id);
      showToast?.("Contacto guardado");
      setModalContacto(null);
      await reload();
    } catch (e) {
      showToast?.(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAccion(prospectoId, form, id) {
    setSaving(true);
    try {
      await api.saveAccion(tenantKey, prospectoId, form, id);
      showToast?.("Cita guardada");
      setModalAccion(null);
      await reload();
    } catch (e) {
      showToast?.(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdminAgenda && !empresaId) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: su, fontSize: 14 }}>
        {copy.emptyLoading || "Cargando…"}
      </div>
    );
  }

  const sqlBanner = tableMissing ? (
    <div
      style={{
        padding: "14px 16px",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: 12,
        fontSize: 13,
        marginBottom: 14,
        lineHeight: 1.5,
      }}
    >
      <strong>Base de datos pendiente.</strong> Aplica la migración{" "}
      <code>{copy.sqlMigration}</code> en Supabase para guardar datos.
    </div>
  ) : null;

  return (
    <div style={{ marginTop: isAdminAgenda ? 0 : 8 }}>
      {sqlBanner}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <div style={{ flex: "1 1 200px" }}>
          <h2 style={{ margin: 0, fontSize: isAdminAgenda ? 22 : 18, fontWeight: 700 }}>{copy.title}</h2>
          <div style={{ fontSize: 13, color: su, marginTop: 4 }}>{copy.subtitle}</div>
        </div>
        <button
          type="button"
          style={btn(true)}
          disabled={tableMissing}
          onClick={() => setModalEmpresa({ form: emptyProspectoForm() })}
        >
          {copy.newEntityButton}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Kpi label="Registradas" value={kpis.empresasRegistradas} />
        <Kpi label="Pend. contactar" value={kpis.pendientesContactar} />
        <Kpi label="Demos previstas" value={kpis.demosPrevistas} />
        <Kpi label="Pruebas activas" value={kpis.pruebasActivas} />
        <Kpi label="Seg. vencidos" value={kpis.seguimientosVencidos} />
        <Kpi label="Citas semana" value={kpis.citasSemana} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {[
          ["Todas", AGENDA_VISTAS.TODAS],
          ["Hoy", AGENDA_VISTAS.HOY],
          ["Esta semana", AGENDA_VISTAS.SEMANA],
          ["Próximas citas", AGENDA_VISTAS.PROXIMAS],
          ["Vencidas", AGENDA_VISTAS.VENCIDAS],
        ].map(([label, id]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAgendaVista(id)}
            style={{
              ...btn(agendaVista === id),
              background: agendaVista === id ? accent : card,
              color: agendaVista === id ? "#fff" : tx,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {agendaVista !== AGENDA_VISTAS.TODAS && accionesVista.length > 0 ? (
        <div
          style={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: su, marginBottom: 8, textTransform: "uppercase" }}>
            Citas en vista
          </div>
          {accionesVista.slice(0, 8).map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 0",
                borderBottom: `1px solid ${border}`,
                fontSize: 13,
              }}
            >
              <span>
                <strong>{formatFechaHora(a.fecha_hora)}</strong> · {tipoAccionLabel(a.tipo)} · {a.prospectoNombre}
              </span>
              <button type="button" style={{ ...btn(), padding: "2px 8px" }} onClick={() => setFichaId(a.prospectoId)}>
                Ver
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          background: card,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Field label="Buscar">
            <input
              style={inputStyle}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Empresa, contacto, teléfono…"
            />
          </Field>
          <Field label="Estado">
            <select
              style={inputStyle}
              value={filters.estadoComercial}
              onChange={(e) => setFilters((f) => ({ ...f, estadoComercial: e.target.value }))}
            >
              <option value="">Todos</option>
              {ESTADOS_COMERCIALES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Localidad">
            <input
              style={inputStyle}
              value={filters.localidad}
              onChange={(e) => setFilters((f) => ({ ...f, localidad: e.target.value }))}
            />
          </Field>
          <Field label="Camiones mín.">
            <input
              type="number"
              min={0}
              style={inputStyle}
              value={filters.camionesMin}
              onChange={(e) => setFilters((f) => ({ ...f, camionesMin: e.target.value }))}
            />
          </Field>
          <Field label="Tipo ruta">
            <select
              style={inputStyle}
              value={filters.tipoRuta}
              onChange={(e) => setFilters((f) => ({ ...f, tipoRuta: e.target.value }))}
            >
              <option value="">Todas</option>
              {TIPOS_RUTA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sistema actual">
            <select
              style={inputStyle}
              value={filters.sistemaActual}
              onChange={(e) => setFilters((f) => ({ ...f, sistemaActual: e.target.value }))}
            >
              <option value="">Todos</option>
              {SISTEMAS_ACTUALES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={filters.soloPendientesSeguimiento}
            onChange={(e) => setFilters((f) => ({ ...f, soloPendientesSeguimiento: e.target.checked }))}
          />
          Solo pendientes de seguimiento (citas vencidas)
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: su }}>Cargando agenda…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: su, background: card, borderRadius: 12, border: `1px solid ${border}` }}>
          Sin empresas en esta vista. Pulsa «Nueva empresa» para empezar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((row) => (
            <div
              key={row.id}
              style={{
                background: card,
                border: `1px solid ${row.seguimientoVencido ? "#fca5a5" : border}`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{row.nombre}</div>
                  <div style={{ fontSize: 12, color: su, marginTop: 2 }}>
                    {row.localidad || "—"} · {row.num_camiones ?? "—"} camiones · {row.estadoLabel}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {row.contactoPrincipal} · {row.telefonoPrincipal}
                  </div>
                  <div style={{ fontSize: 11, color: su, marginTop: 4 }}>
                    Próxima: {row.proximaCitaLabel} · {row.ultimaNotaCorta}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
                  <button type="button" style={btn()} onClick={() => setFichaId(row.id)}>
                    Ver ficha
                  </button>
                  <button
                    type="button"
                    style={btn()}
                    onClick={() => setModalContacto({ prospectoId: row.id, form: emptyContactoForm() })}
                  >
                    + Contacto
                  </button>
                  <button
                    type="button"
                    style={btn()}
                    onClick={() =>
                      setModalAccion({
                        prospectoId: row.id,
                        form: { ...emptyAccionForm(), contacto_nombre: row.contactoPrincipal !== "—" ? row.contactoPrincipal : "" },
                      })
                    }
                  >
                    + Cita
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalEmpresa ? (
        <ProspectoFormModal
          title={modalEmpresa.id ? "Editar empresa" : "Nueva empresa objetivo"}
          initial={modalEmpresa.form}
          saving={saving}
          onSave={(form) => handleSaveProspecto(form, modalEmpresa.id)}
          onClose={() => setModalEmpresa(null)}
        />
      ) : null}

      {modalContacto ? (
        <ContactoFormModal
          initial={modalContacto.form}
          saving={saving}
          onSave={(form) => handleSaveContacto(modalContacto.prospectoId, form, modalContacto.id)}
          onClose={() => setModalContacto(null)}
        />
      ) : null}

      {modalAccion ? (
        <AccionFormModal
          initial={modalAccion.form}
          saving={saving}
          onSave={(form) => handleSaveAccion(modalAccion.prospectoId, form, modalAccion.id)}
          onClose={() => setModalAccion(null)}
        />
      ) : null}

      {fichaRow ? (
        <FichaModal
          row={fichaRow}
          tab={fichaTab}
          onTab={setFichaTab}
          onClose={() => setFichaId(null)}
          onEdit={() => setModalEmpresa({ id: fichaRow.id, form: prospectoToForm(fichaRow) })}
          onAddContacto={() => setModalContacto({ prospectoId: fichaRow.id, form: emptyContactoForm() })}
          onEditContacto={(c) => setModalContacto({ prospectoId: fichaRow.id, id: c.id, form: { ...c, es_principal: !!c.es_principal } })}
          onDeleteContacto={async (id) => {
            if (!confirm("¿Eliminar contacto?")) return;
            await api.deleteContacto(id);
            await reload();
          }}
          onAddAccion={() =>
            setModalAccion({
              prospectoId: fichaRow.id,
              form: {
                ...emptyAccionForm(),
                contacto_nombre: fichaRow.contactoPrincipal !== "—" ? fichaRow.contactoPrincipal : "",
              },
            })
          }
          onEditAccion={(a) => setModalAccion({ prospectoId: fichaRow.id, id: a.id, form: accionToForm(a) })}
          onToggleAccion={async (a) => {
            await api.toggleAccionCompletada(a, !a.completada);
            await reload();
          }}
          onDeleteAccion={async (id) => {
            if (!confirm("¿Eliminar cita?")) return;
            await api.deleteAccion(id);
            await reload();
          }}
          onDeleteProspecto={async () => {
            if (!confirm("¿Eliminar empresa y todos sus datos?")) return;
            await api.deleteProspecto(fichaRow.id);
            setFichaId(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ProspectoFormModal({ title, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (key, val) => set(key, toggleArray(form[key], val));

  return (
    <Modal title={title} onClose={onClose} wide>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Field label="Nombre empresa *">
          <input style={inputStyle} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Field>
        <Field label="CIF">
          <input style={inputStyle} value={form.cif} onChange={(e) => set("cif", e.target.value)} />
        </Field>
        <Field label="Dirección">
          <input style={inputStyle} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
        </Field>
        <Field label="Localidad">
          <input style={inputStyle} value={form.localidad} onChange={(e) => set("localidad", e.target.value)} />
        </Field>
        <Field label="Provincia">
          <input style={inputStyle} value={form.provincia} onChange={(e) => set("provincia", e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input style={inputStyle} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </Field>
        <Field label="Email">
          <input style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Web">
          <input style={inputStyle} value={form.web} onChange={(e) => set("web", e.target.value)} />
        </Field>
        <Field label="Sector / actividad">
          <input style={inputStyle} value={form.sector} onChange={(e) => set("sector", e.target.value)} />
        </Field>
        <Field label="Estado comercial">
          <select style={inputStyle} value={form.estado_comercial} onChange={(e) => set("estado_comercial", e.target.value)}>
            {ESTADOS_COMERCIALES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nº camiones (aprox.)">
          <input
            type="number"
            min={0}
            style={inputStyle}
            value={form.num_camiones}
            onChange={(e) => set("num_camiones", e.target.value)}
          />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={labelStyle}>Tipos de vehículos</div>
        <ChipGroup options={TIPOS_VEHICULO} selected={form.tipos_vehiculos} onToggle={(v) => toggle("tipos_vehiculos", v)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={labelStyle}>Tipo de rutas</div>
        <ChipGroup options={TIPOS_RUTA} selected={form.tipos_rutas} onToggle={(v) => toggle("tipos_rutas", v)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={labelStyle}>Sistemas actuales</div>
        <ChipGroup options={SISTEMAS_ACTUALES} selected={form.sistemas_actuales} onToggle={(v) => toggle("sistemas_actuales", v)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={labelStyle}>Dolor detectado</div>
        <ChipGroup options={DOLORES_DETECTADOS} selected={form.dolores} onToggle={(v) => toggle("dolores", v)} />
      </div>
      <Field label="Última nota">
        <textarea
          style={{ ...inputStyle, minHeight: 60, marginTop: 12 }}
          value={form.ultima_nota}
          onChange={(e) => set("ultima_nota", e.target.value)}
        />
      </Field>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button type="button" style={btn(true)} disabled={saving} onClick={() => onSave(form)}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}

function ContactoFormModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title="Contacto" onClose={onClose}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Field label="Nombre *">
          <input style={inputStyle} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Field>
        <Field label="Cargo">
          <input style={inputStyle} value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input style={inputStyle} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </Field>
        <Field label="Email">
          <input style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <input style={inputStyle} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>
      </div>
      <Field label="Observaciones">
        <textarea
          style={{ ...inputStyle, minHeight: 70, marginTop: 10 }}
          value={form.observaciones}
          onChange={(e) => set("observaciones", e.target.value)}
          placeholder="Ej: Hablar por la mañana"
        />
      </Field>
      <label style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 12 }}>
        <input type="checkbox" checked={!!form.es_principal} onChange={(e) => set("es_principal", e.target.checked)} />
        Contacto principal
      </label>
      <button type="button" style={{ ...btn(true), marginTop: 14 }} disabled={saving} onClick={() => onSave(form)}>
        Guardar contacto
      </button>
    </Modal>
  );
}

function AccionFormModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title="Cita / acción" onClose={onClose}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Field label="Tipo">
          <select style={inputStyle} value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
            {TIPOS_ACCION.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" style={inputStyle} value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
        <Field label="Hora">
          <input type="time" style={inputStyle} value={form.hora} onChange={(e) => set("hora", e.target.value)} />
        </Field>
        <Field label="Persona contacto">
          <input style={inputStyle} value={form.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} />
        </Field>
      </div>
      <Field label="Resultado">
        <input style={{ ...inputStyle, marginTop: 10 }} value={form.resultado} onChange={(e) => set("resultado", e.target.value)} />
      </Field>
      <Field label="Próxima acción">
        <input style={{ ...inputStyle, marginTop: 10 }} value={form.proxima_accion} onChange={(e) => set("proxima_accion", e.target.value)} />
      </Field>
      <Field label="Notas">
        <textarea style={{ ...inputStyle, minHeight: 70, marginTop: 10 }} value={form.notas} onChange={(e) => set("notas", e.target.value)} />
      </Field>
      <label style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 12 }}>
        <input type="checkbox" checked={!!form.completada} onChange={(e) => set("completada", e.target.checked)} />
        Completada
      </label>
      <button type="button" style={{ ...btn(true), marginTop: 14 }} disabled={saving} onClick={() => onSave(form)}>
        Guardar cita
      </button>
    </Modal>
  );
}

function FichaModal({
  row,
  tab,
  onTab,
  onClose,
  onEdit,
  onAddContacto,
  onEditContacto,
  onDeleteContacto,
  onAddAccion,
  onEditAccion,
  onToggleAccion,
  onDeleteAccion,
  onDeleteProspecto,
}) {
  const tabs = [
    ["empresa", "Empresa"],
    ["contactos", "Contactos"],
    ["infra", "Infraestructura"],
    ["citas", "Citas"],
  ];

  return (
    <Modal title={row.nombre} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            style={{
              ...btn(tab === id),
              background: tab === id ? accent : card,
              color: tab === id ? "#fff" : tx,
            }}
          >
            {label}
          </button>
        ))}
        <button type="button" style={{ ...btn(), marginLeft: "auto" }} onClick={onEdit}>
          Editar ficha
        </button>
      </div>

      {tab === "empresa" ? (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <p>
            <strong>Estado:</strong> {estadoComercialLabel(row.estado_comercial)}
          </p>
          <p>
            {[row.direccion, row.localidad, row.provincia].filter(Boolean).join(", ") || "—"}
          </p>
          <p>
            Tel: {row.telefono || "—"} · Email: {row.email || "—"}
          </p>
          <p>Web: {row.web || "—"} · Sector: {row.sector || "—"}</p>
          <p>CIF: {row.cif || "—"}</p>
          <p>
            <strong>Última nota:</strong> {row.ultima_nota || "—"}
          </p>
        </div>
      ) : null}

      {tab === "contactos" ? (
        <div>
          <button type="button" style={{ ...btn(true), marginBottom: 10 }} onClick={onAddContacto}>
            + Añadir contacto
          </button>
          {(row.contactos || []).map((c) => (
            <div key={c.id} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>
                {c.nombre}
                {c.es_principal ? " · Principal" : ""}
              </div>
              <div style={{ fontSize: 12, color: su }}>{c.cargo || "—"}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {c.telefono} · {c.email} · WA: {c.whatsapp || "—"}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, fontStyle: "italic" }}>{c.observaciones}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button type="button" style={btn()} onClick={() => onEditContacto(c)}>
                  Editar
                </button>
                <button type="button" style={btn()} onClick={() => onDeleteContacto(c.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "infra" ? (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p>
            <strong>Camiones:</strong> {row.num_camiones ?? "—"}
          </p>
          <p>
            <strong>Vehículos:</strong> {(row.tipos_vehiculos || []).join(", ") || "—"}
          </p>
          <p>
            <strong>Rutas:</strong> {(row.tipos_rutas || []).join(", ") || "—"}
          </p>
          <p>
            <strong>Sistemas:</strong> {(row.sistemas_actuales || []).join(", ") || "—"}
          </p>
          <p>
            <strong>Dolores:</strong> {(row.dolores || []).join(", ") || "—"}
          </p>
        </div>
      ) : null}

      {tab === "citas" ? (
        <div>
          <button type="button" style={{ ...btn(true), marginBottom: 10 }} onClick={onAddAccion}>
            + Añadir cita
          </button>
          {(row.acciones || []).map((a) => (
            <div
              key={a.id}
              style={{
                border: `1px solid ${border}`,
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                opacity: a.completada ? 0.65 : 1,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {formatFechaHora(a.fecha_hora)} · {tipoAccionLabel(a.tipo)}
                {a.completada ? " ✓" : ""}
              </div>
              <div style={{ fontSize: 12 }}>Contacto: {a.contacto_nombre || "—"}</div>
              <div style={{ fontSize: 12 }}>Resultado: {a.resultado || "—"}</div>
              <div style={{ fontSize: 12 }}>Próxima: {a.proxima_accion || "—"}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{a.notas}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" style={btn()} onClick={() => onToggleAccion(a)}>
                  {a.completada ? "Reabrir" : "Completar"}
                </button>
                <button type="button" style={btn()} onClick={() => onEditAccion(a)}>
                  Editar
                </button>
                <button type="button" style={btn()} onClick={() => onDeleteAccion(a.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" style={{ ...btn(), marginTop: 16, color: "#b91c1c", borderColor: "#fecaca" }} onClick={onDeleteProspecto}>
        Eliminar empresa
      </button>
    </Modal>
  );
}
