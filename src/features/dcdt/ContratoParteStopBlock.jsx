import { useEffect, useMemo, useRef, useState } from "react";
import { isDemoApp } from "../../config/appEnvironment.js";
import { getAuthUid } from "../../data/supabaseClient.js";
import { defaultStopCountry } from "../../domain/geo/postalCodeLookup.js";
import {
  applyParteUbicacionToStop,
  filterPartesForStop,
  stopContractualBlockLabel,
} from "../../domain/dcdt/dcdtFormReadiness.js";
import { PARTE_TIPO } from "../../domain/dcdt/dcdtConstants.js";
import {
  createParteTransporte,
  fetchPartesTransporte,
  parteToDisplayLine,
  suggestParteTipoForStop,
  updateParteTransporte,
} from "../../domain/dcdt/partesTransporteModel.js";

const UI = {
  border: "#dbe4ee",
  bg: "#f8fafc",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
  card: "#ffffff",
};

const TIPO_OPTIONS = [
  { id: PARTE_TIPO.CARGADOR, label: "Cargador" },
  { id: PARTE_TIPO.DESTINATARIO, label: "Destinatario" },
  { id: "expedidor", label: "Expedidor" },
  { id: PARTE_TIPO.OPERADOR, label: "Operador" },
];

function emptyForm(parteTipo) {
  return {
    tipo: parteTipo,
    nombre: "",
    nif: "",
    domicilioFiscal: "",
    direccionOperativa: "",
    ciudad: "",
    codigoPostal: "",
    pais: defaultStopCountry(),
    contactoNombre: "",
    contactoTelefono: "",
    contactoEmail: "",
  };
}

function parteToForm(parte) {
  if (!parte) return emptyForm(PARTE_TIPO.OPERADOR);
  return {
    tipo: parte.tipo,
    nombre: parte.nombre || "",
    nif: parte.nif || "",
    domicilioFiscal: parte.domicilioFiscal || "",
    direccionOperativa: parte.direccionOperativa || "",
    ciudad: parte.ciudad || "",
    codigoPostal: parte.codigoPostal || "",
    pais: parte.pais || defaultStopCountry(),
    contactoNombre: parte.contactoNombre || "",
    contactoTelefono: parte.contactoTelefono || "",
    contactoEmail: parte.contactoEmail || "",
  };
}

function btnStyle(theme, variant = "ghost") {
  if (variant === "primary") {
    return {
      background: theme.accent,
      color: "#fff",
      border: "none",
      borderRadius: 8,
      padding: "6px 10px",
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
    };
  }
  return {
    background: "transparent",
    color: theme.accent,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function FieldRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ fontSize: 11, color: UI.tx, lineHeight: 1.45, marginBottom: 3 }}>
      <span style={{ color: UI.su, fontWeight: 700 }}>{label}: </span>
      {value}
    </div>
  );
}

export function ContratoParteStopBlock({
  stop,
  index,
  onChange,
  onPatchStop = null,
  empresaId,
  themeKey = "empresa",
  onPartesChange = null,
}) {
  const theme = themeKey === "dark" ? { ...UI, bg: "#0f172a", tx: "#f1f5f9", card: "#1e293b" } : UI;
  const blockLabel = stopContractualBlockLabel(stop);
  const parteTipo = stop?.parte_transporte_tipo || suggestParteTipoForStop(stop?.tipo);
  const parteId = stop?.parte_transporte_id ? String(stop.parte_transporte_id) : "";

  const [partes, setPartes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("idle");
  const [form, setForm] = useState(() => emptyForm(parteTipo));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [demoToast, setDemoToast] = useState("");
  const [pendingParteId, setPendingParteId] = useState("");
  const [confirmLabel, setConfirmLabel] = useState("");
  const demoToastTimer = useRef(null);
  const confirmTimer = useRef(null);

  useEffect(
    () => () => {
      if (demoToastTimer.current) clearTimeout(demoToastTimer.current);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (parteId) setPendingParteId(parteId);
    else if (mode !== "select") setPendingParteId("");
  }, [parteId, mode]);

  useEffect(() => {
    if (!empresaId) return;
    let cancelled = false;
    setLoading(true);
    fetchPartesTransporte(empresaId)
      .then((rows) => {
        if (!cancelled) setPartes(rows);
      })
      .catch(() => {
        if (!cancelled) setPartes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [empresaId]);

  const filtered = useMemo(() => filterPartesForStop(partes, stop), [partes, stop]);
  const selected = partes.find((p) => String(p.id) === parteId);

  const inp = {
    width: "100%",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: theme.tx,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 6,
  };
  const sectionLbl = {
    fontSize: 10,
    color: theme.su,
    fontWeight: 800,
    letterSpacing: 0.3,
    marginBottom: 6,
    textTransform: "uppercase",
  };

  function syncPartes(next) {
    setPartes(next);
    onPartesChange?.(next);
  }

  function showDemoTechnicalToast(message) {
    if (!isDemoApp() || !message) return;
    setDemoToast(message);
    if (demoToastTimer.current) clearTimeout(demoToastTimer.current);
    demoToastTimer.current = setTimeout(() => setDemoToast(""), 12000);
  }

  function reportError(e, context) {
    const technical = e?.message || "Error al guardar";
    console.error(`[DCDT ${blockLabel}] ${context}`, {
      empresaId,
      parteTipo,
      authUid: getAuthUid(),
      error: e,
      supabase: e?.supabase,
    });
    if (isDemoApp()) {
      setErr(technical);
      showDemoTechnicalToast(`[DEMO técnico] ${technical}`);
    } else {
      setErr("No se pudo guardar. Inténtalo de nuevo.");
    }
  }

  function applyStopPartePatch(patch) {
    if (typeof onPatchStop === "function") {
      onPatchStop(index, patch);
      return;
    }
    for (const [field, val] of Object.entries(patch)) {
      onChange(index, field, val);
    }
  }

  function showConfirmSelection(label) {
    setConfirmLabel(label);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmLabel(""), 2800);
  }

  function linkParte(parte) {
    const patch = {
      parte_transporte_id: parte.id,
      parte_transporte_tipo: parte.tipo,
    };
    const stopTipo = String(stop?.tipo || "").toLowerCase();
    const parteTipoNorm = String(parte?.tipo || "").toLowerCase();
    const parteNombre = String(parte?.nombre || "").trim();
    if (parteNombre) {
      const isCargaCargador =
        stopTipo === "carga" &&
        (parteTipoNorm === PARTE_TIPO.CARGADOR || parteTipoNorm === "expedidor");
      const isDescargaDestinatario =
        stopTipo === "descarga" && parteTipoNorm === PARTE_TIPO.DESTINATARIO;
      if (isCargaCargador || isDescargaDestinatario) {
        patch.empresa = parteNombre;
      }
    }
    applyStopPartePatch(patch);
    setMode("idle");
    setPendingParteId("");
    setErr("");
    showConfirmSelection(`${blockLabel} seleccionado`);
  }

  function confirmPendingSelection() {
    const id = pendingParteId || parteId;
    if (!id) {
      setErr("Selecciona una opción del catálogo");
      return;
    }
    const hit = partes.find((p) => p.id === id);
    if (!hit) {
      setErr("Parte no encontrada en catálogo");
      return;
    }
    linkParte(hit);
  }

  function quitarParte() {
    applyStopPartePatch({ parte_transporte_id: null, parte_transporte_tipo: null });
    setMode("idle");
    setPendingParteId("");
    setErr("");
    setConfirmLabel("");
  }

  async function guardarForm(isEdit) {
    if (!form.nombre.trim()) {
      setErr("Nombre / razón social obligatorio");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        empresaId,
        tipo: form.tipo || parteTipo,
        nombre: form.nombre.trim(),
        nif: form.nif.trim() || null,
        domicilioFiscal: form.domicilioFiscal.trim() || null,
        direccionOperativa: form.direccionOperativa.trim() || null,
        ciudad: form.ciudad.trim() || null,
        codigoPostal: form.codigoPostal.trim() || null,
        pais: form.pais.trim() || defaultStopCountry(),
        contactoNombre: form.contactoNombre.trim() || null,
        contactoTelefono: form.contactoTelefono.trim() || null,
        contactoEmail: form.contactoEmail.trim() || null,
      };
      const saved = isEdit
        ? await updateParteTransporte(selected.id, payload)
        : await createParteTransporte(payload);
      const next = isEdit
        ? partes.map((p) => (p.id === saved.id ? saved : p))
        : [...partes, saved];
      syncPartes(next);
      linkParte(saved);
      setForm(emptyForm(parteTipo));
    } catch (e) {
      reportError(e, isEdit ? "editar" : "crear");
    } finally {
      setSaving(false);
    }
  }

  function renderForm(isEdit) {
    return (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10, background: theme.card }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.tx, marginBottom: 8 }}>
          {isEdit ? `Editar ${blockLabel.toLowerCase()}` : `Crear ${blockLabel.toLowerCase()}`}
        </div>
        <select
          value={form.tipo}
          onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
          style={inp}
          disabled={isEdit}
        >
          {TIPO_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre / razón social *" style={inp} />
        <input value={form.nif} onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))} placeholder="CIF/NIF" style={inp} />
        <input value={form.domicilioFiscal} onChange={(e) => setForm((f) => ({ ...f, domicilioFiscal: e.target.value }))} placeholder="Domicilio fiscal" style={inp} />
        <input value={form.direccionOperativa} onChange={(e) => setForm((f) => ({ ...f, direccionOperativa: e.target.value }))} placeholder="Dirección operativa" style={inp} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={form.ciudad} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} placeholder="Ciudad" style={{ ...inp, marginBottom: 0 }} />
          <input value={form.codigoPostal} onChange={(e) => setForm((f) => ({ ...f, codigoPostal: e.target.value }))} placeholder="CP" style={{ ...inp, marginBottom: 0 }} />
        </div>
        <input value={form.pais} onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))} placeholder="País" style={{ ...inp, marginTop: 6 }} />
        <input value={form.contactoNombre} onChange={(e) => setForm((f) => ({ ...f, contactoNombre: e.target.value }))} placeholder="Contacto (opcional)" style={inp} />
        <input value={form.contactoTelefono} onChange={(e) => setForm((f) => ({ ...f, contactoTelefono: e.target.value }))} placeholder="Teléfono contacto" style={inp} />
        <input value={form.contactoEmail} onChange={(e) => setForm((f) => ({ ...f, contactoEmail: e.target.value }))} placeholder="Email contacto" style={inp} />
        {err ? <div style={{ fontSize: 10, color: "#b91c1c", marginBottom: 6 }}>{err}</div> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" onClick={() => { setMode("idle"); setErr(""); }} style={btnStyle(theme)}>
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={() => void guardarForm(isEdit)} style={btnStyle(theme, "primary")}>
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear y vincular"}
          </button>
        </div>
      </div>
    );
  }

  if (!empresaId) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {demoToast ? (
        <div
          role="status"
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 12000,
            background: "#7f1d1d",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 11,
            lineHeight: 1.45,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          }}
        >
          {demoToast}
        </div>
      ) : null}

      <div style={sectionLbl}>Bloque B — {blockLabel}</div>

      {confirmLabel ? (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#15803d",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          ✓ {confirmLabel}
        </div>
      ) : null}

      {parteId && loading && mode !== "create" && mode !== "edit" ? (
        <div style={{ fontSize: 11, color: theme.su, marginBottom: 8, lineHeight: 1.4 }}>
          Cargando {blockLabel.toLowerCase()} guardado…
        </div>
      ) : null}

      {selected && mode !== "select" && mode !== "create" && mode !== "edit" ? (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, background: theme.card }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: theme.tx, marginBottom: 8 }}>{blockLabel}</div>
          <FieldRow label="Nombre / razón social" value={selected.nombre} />
          <FieldRow label="CIF/NIF" value={selected.nif} />
          <FieldRow label="Domicilio fiscal" value={selected.domicilioFiscal} />
          <FieldRow label="Dirección operativa" value={selected.direccionOperativa} />
          <FieldRow label="Ciudad" value={selected.ciudad} />
          <FieldRow label="Código postal" value={selected.codigoPostal} />
          <FieldRow label="País" value={selected.pais} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <button type="button" onClick={() => setMode("select")} style={btnStyle(theme)}>
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(parteToForm(selected));
                setMode("edit");
              }}
              style={btnStyle(theme)}
            >
              Editar
            </button>
            <button type="button" onClick={quitarParte} style={btnStyle(theme)}>
              Quitar
            </button>
            <button
              type="button"
              onClick={() => applyParteUbicacionToStop(selected, onChange, index)}
              style={btnStyle(theme, "primary")}
            >
              Usar datos para ubicación operativa
            </button>
          </div>
        </div>
      ) : null}

      {(mode === "select" || !parteId || (parteId && !selected)) && mode !== "create" && mode !== "edit" ? (
        <div style={{ marginTop: 0 }}>
          <>
            <select
              value={pendingParteId || ""}
              onChange={(e) => {
                setPendingParteId(e.target.value);
                setErr("");
              }}
              style={inp}
            >
              <option value="">{loading ? "Cargando catálogo…" : `— Seleccionar ${blockLabel.toLowerCase()} —`}</option>
              {filtered.map((p) => (
                <option key={p.id} value={p.id}>
                  {parteToDisplayLine(p)}
                  {p.nif ? ` · ${p.nif}` : ""}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              <button type="button" onClick={confirmPendingSelection} style={btnStyle(theme, "primary")}>
                Confirmar selección
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm(parteTipo));
                  setMode("create");
                  setErr("");
                }}
                style={btnStyle(theme)}
              >
                + Crear {blockLabel.toLowerCase()}
              </button>
              {parteId && mode === "select" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setPendingParteId("");
                  }}
                  style={btnStyle(theme)}
                >
                  Ver tarjeta
                </button>
              ) : null}
            </div>
          </>
        </div>
      ) : null}

      {mode === "create" ? renderForm(false) : null}
      {mode === "edit" && selected ? renderForm(true) : null}
    </div>
  );
}

/** @deprecated Usar ContratoParteStopBlock */
export function ParteTransporteStopField(props) {
  return <ContratoParteStopBlock {...props} />;
}
