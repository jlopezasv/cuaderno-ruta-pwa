import { useCallback, useEffect, useState } from "react";
import { DECA_AUTONOMO_ESTADO, DECA_PORTES_OPTIONS } from "../../domain/dcdt/decaAutonomoConstants.js";
import {
  canEditAutonomoDeca,
  createAutonomoDeca,
  saveAutonomoDecaDatos,
} from "../../domain/dcdt/decaAutonomoModel.js";
import { generateAndPersistAutonomoDecaPdf } from "../../domain/dcdt/decaAutonomoPdf.js";
import {
  autonomoDecaDatosFromProfile,
  mergeAutonomoDecaDatos,
} from "./decaAutonomoFormDefaults.js";

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#dbe4ee",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
  danger: "#b91c1c",
};

const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: UI.muted,
  marginBottom: 4,
  letterSpacing: 0.3,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${UI.border}`,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 15,
  color: UI.tx,
  background: "#fff",
  marginBottom: 10,
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: UI.accent,
          letterSpacing: 0.6,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function patchPath(datos, path, value) {
  const next = mergeAutonomoDecaDatos(datos);
  const keys = path.split(".");
  if (keys.length === 1) {
    next[keys[0]] = value;
    return next;
  }
  if (keys.length === 2) {
    next[keys[0]] = { ...next[keys[0]], [keys[1]]: value };
    return next;
  }
  if (keys.length >= 3) {
    const [a, b, c] = keys;
    next[a] = { ...next[a], [b]: { ...next[a]?.[b], [c]: value } };
    return next;
  }
  return next;
}

export function AutonomoDecaFormModal({
  open,
  onClose,
  deca = null,
  profile = {},
  showToast,
  onSaved,
}) {
  const isNew = !deca?.id;
  const readOnly = deca && !canEditAutonomoDeca(deca);
  const [datos, setDatos] = useState(() =>
    deca?.datos ? mergeAutonomoDecaDatos(deca.datos) : autonomoDecaDatosFromProfile(profile),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setDatos(
      deca?.datos ? mergeAutonomoDecaDatos(deca.datos) : autonomoDecaDatosFromProfile(profile),
    );
  }, [open, deca?.id, profile]);

  const set = useCallback((path, value) => {
    setDatos((prev) => patchPath(prev, path, value));
  }, []);

  async function handleSave(andPdf = false) {
    setError("");
    if (!String(datos.origen?.lugar || "").trim() || !String(datos.destino?.lugar || "").trim()) {
      setError("Indica al menos origen y destino (lugar).");
      return;
    }
    if (!String(datos.vehiculo?.matricula || "").trim()) {
      setError("La matrícula de la tractora es obligatoria.");
      return;
    }
    setSaving(true);
    try {
      let row = deca;
      if (isNew) {
        row = await createAutonomoDeca({ datos, profile });
      } else {
        row = await saveAutonomoDecaDatos(deca.id, datos);
      }
      if (andPdf) {
        const result = await generateAndPersistAutonomoDecaPdf(row);
        row = result.deca;
        showToast?.("PDF DeCA generado con QR");
      } else {
        showToast?.(isNew ? "DeCA guardado" : "Cambios guardados");
      }
      onSaved?.(row);
      onClose?.();
    } catch (e) {
      setError(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15,23,42,.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          background: UI.card,
          borderRadius: "16px 16px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -8px 40px rgba(15,23,42,.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${UI.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx }}>
              {isNew ? "Crear DeCA" : readOnly ? "Ver DeCA" : "Editar DeCA"}
            </div>
            <div style={{ fontSize: 11, color: UI.muted, marginTop: 2 }}>
              Documento de Control del Transporte
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: UI.muted,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 8px", background: UI.bg }}>
          <Section title="Transporte">
            <Field label="Fecha">
              <input
                type="date"
                value={datos.fecha || ""}
                disabled={readOnly}
                onChange={(e) => set("fecha", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Matrícula tractora">
              <input
                value={datos.vehiculo?.matricula || ""}
                disabled={readOnly}
                onChange={(e) => set("vehiculo.matricula", e.target.value)}
                style={inputStyle}
                placeholder="1234 ABC"
              />
            </Field>
            <Field label="Matrícula remolque (opcional)">
              <input
                value={datos.vehiculo?.remolque || ""}
                disabled={readOnly}
                onChange={(e) => set("vehiculo.remolque", e.target.value)}
                style={inputStyle}
                placeholder="R-5678"
              />
            </Field>
          </Section>

          <Section title="Origen / carga">
            <Field label="Lugar">
              <input
                value={datos.origen?.lugar || ""}
                disabled={readOnly}
                onChange={(e) => set("origen.lugar", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Dirección">
              <input
                value={datos.origen?.direccion || ""}
                disabled={readOnly}
                onChange={(e) => set("origen.direccion", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Código postal">
              <input
                value={datos.origen?.codigo_postal || ""}
                disabled={readOnly}
                onChange={(e) => set("origen.codigo_postal", e.target.value)}
                style={inputStyle}
              />
            </Field>
          </Section>

          <Section title="Destino / descarga">
            <Field label="Lugar">
              <input
                value={datos.destino?.lugar || ""}
                disabled={readOnly}
                onChange={(e) => set("destino.lugar", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Dirección">
              <input
                value={datos.destino?.direccion || ""}
                disabled={readOnly}
                onChange={(e) => set("destino.direccion", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Código postal">
              <input
                value={datos.destino?.codigo_postal || ""}
                disabled={readOnly}
                onChange={(e) => set("destino.codigo_postal", e.target.value)}
                style={inputStyle}
              />
            </Field>
          </Section>

          <Section title="Partes">
            <Field label="Cargador contractual">
              <input
                value={datos.partes?.cargador?.nombre || ""}
                disabled={readOnly}
                onChange={(e) => set("partes.cargador.nombre", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="NIF/CIF cargador">
              <input
                value={datos.partes?.cargador?.nif || ""}
                disabled={readOnly}
                onChange={(e) => set("partes.cargador.nif", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Transportista efectivo">
              <input
                value={datos.partes?.transportista?.nombre || ""}
                disabled={readOnly}
                onChange={(e) => set("partes.transportista.nombre", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="NIF/CIF transportista">
              <input
                value={datos.partes?.transportista?.nif || ""}
                disabled={readOnly}
                onChange={(e) => set("partes.transportista.nif", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Destinatario">
              <input
                value={datos.partes?.destinatario?.nombre || ""}
                disabled={readOnly}
                onChange={(e) => set("partes.destinatario.nombre", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="NIF/CIF destinatario">
              <input
                value={datos.partes?.destinatario?.nif || ""}
                disabled={readOnly}
                onChange={(e) => set("partes.destinatario.nif", e.target.value)}
                style={inputStyle}
              />
            </Field>
          </Section>

          <Section title="Mercancía">
            <Field label="Tipo / descripción">
              <input
                value={datos.mercancia?.descripcion || ""}
                disabled={readOnly}
                onChange={(e) => set("mercancia.descripcion", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Bultos">
                <input
                  value={datos.mercancia?.bultos ?? ""}
                  disabled={readOnly}
                  onChange={(e) => set("mercancia.bultos", e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Palets">
                <input
                  value={datos.mercancia?.palets ?? ""}
                  disabled={readOnly}
                  onChange={(e) => set("mercancia.palets", e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
            <Field label="Peso aprox. (kg)">
              <input
                value={datos.mercancia?.peso_kg ?? ""}
                disabled={readOnly}
                onChange={(e) => set("mercancia.peso_kg", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Portes">
              <select
                value={datos.mercancia?.portes || DECA_PORTES_OPTIONS[2].id}
                disabled={readOnly}
                onChange={(e) => set("mercancia.portes", e.target.value)}
                style={inputStyle}
              >
                {DECA_PORTES_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Observaciones">
              <textarea
                value={datos.observaciones || ""}
                disabled={readOnly}
                onChange={(e) => set("observaciones", e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
              />
            </Field>
          </Section>

          <Section title="Conductor">
            <Field label="Nombre">
              <input
                value={datos.conductor?.nombre || ""}
                disabled={readOnly}
                onChange={(e) => set("conductor.nombre", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="DNI/NIF (opcional)">
              <input
                value={datos.conductor?.dni || ""}
                disabled={readOnly}
                onChange={(e) => set("conductor.dni", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Teléfono (opcional)">
              <input
                value={datos.conductor?.telefono || ""}
                disabled={readOnly}
                onChange={(e) => set("conductor.telefono", e.target.value)}
                style={inputStyle}
              />
            </Field>
          </Section>

          {error ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                color: UI.danger,
                marginBottom: 10,
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        {!readOnly ? (
          <div
            style={{
              padding: "12px 16px 16px",
              borderTop: `1px solid ${UI.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: UI.card,
            }}
          >
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              style={{
                width: "100%",
                minHeight: 48,
                border: "none",
                borderRadius: 12,
                background: "#166534",
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Generando…" : "Guardar y descargar PDF"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              style={{
                width: "100%",
                minHeight: 44,
                border: `1px solid ${UI.border}`,
                borderRadius: 12,
                background: "#fff",
                color: UI.tx,
                fontSize: 14,
                fontWeight: 700,
                cursor: saving ? "default" : "pointer",
              }}
            >
              Guardar borrador
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
