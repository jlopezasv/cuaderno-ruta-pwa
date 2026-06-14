import { useMemo, useState } from "react";
import { PARTE_TIPO } from "../../domain/dcdt/dcdtConstants.js";
import {
  createParteTransporteRapido,
  parteToDisplayLine,
} from "../../domain/dcdt/partesTransporteModel.js";

const UI = {
  border: "#dbe4ee",
  soft: "#f8fafc",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
  green: "#15803d",
  amber: "#b45309",
};

export function DcdtPartePicker({
  label,
  role,
  empresaId,
  partes = [],
  selectedParteId = null,
  busy = false,
  onSelect,
  onCancel,
}) {
  const [quickNombre, setQuickNombre] = useState("");
  const [quickNif, setQuickNif] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const tipo = role === "cargador" ? PARTE_TIPO.CARGADOR : PARTE_TIPO.DESTINATARIO;

  const filtered = useMemo(() => {
    return (partes || []).filter((p) => {
      const t = String(p.tipo || "").toLowerCase();
      if (role === "cargador") return t === PARTE_TIPO.CARGADOR || t === "expedidor";
      return t === PARTE_TIPO.DESTINATARIO;
    });
  }, [partes, role]);

  async function crearRapido() {
    if (!quickNombre.trim()) {
      setErr("Indica nombre o razón social");
      return;
    }
    setCreating(true);
    setErr("");
    try {
      const empId = empresaId || filtered[0]?.empresaId || partes[0]?.empresaId;
      if (!empId) throw new Error("Empresa no disponible");
      const saved = await createParteTransporteRapido({
        empresaId: empId,
        tipo,
        nombre: quickNombre.trim(),
        nif: quickNif.trim() || null,
      });
      await onSelect(saved.id, saved);
      setQuickNombre("");
      setQuickNif("");
    } catch (e) {
      setErr(e?.message || "No se pudo crear");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={{
        margin: "4px 0 10px",
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid #fcd34d`,
        background: "#fffbeb",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: UI.amber, marginBottom: 8 }}>
        Seleccionar {label.toLowerCase()}
      </div>
      <select
        autoFocus
        disabled={busy || creating}
        value={selectedParteId || ""}
        onChange={(e) => {
          const id = e.target.value;
          if (id) void onSelect(id);
        }}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${UI.border}`,
          fontSize: 13,
          marginBottom: 8,
          boxSizing: "border-box",
        }}
      >
        <option value="">— Elegir del catálogo —</option>
        {filtered.map((p) => (
          <option key={p.id} value={p.id}>
            {parteToDisplayLine(p)}
            {p.nif ? ` · ${p.nif}` : ""}
          </option>
        ))}
      </select>
      {filtered.length === 0 ? (
        <div style={{ fontSize: 11, color: UI.su, marginBottom: 8 }}>Sin partes en catálogo. Crea uno rápido:</div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input
          value={quickNombre}
          onChange={(e) => setQuickNombre(e.target.value)}
          placeholder="Nombre / razón social *"
          style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${UI.border}`, fontSize: 12 }}
        />
        <input
          value={quickNif}
          onChange={(e) => setQuickNif(e.target.value)}
          placeholder="CIF/NIF"
          style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${UI.border}`, fontSize: 12 }}
        />
      </div>
      {err ? <div style={{ fontSize: 11, color: "#b91c1c", marginBottom: 6 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy || creating}
          onClick={crearRapido}
          style={{
            background: UI.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 700,
            cursor: busy || creating ? "default" : "pointer",
          }}
        >
          {creating ? "Guardando…" : "+ Crear y usar"}
        </button>
        <button
          type="button"
          disabled={busy || creating}
          onClick={onCancel}
          style={{
            background: UI.soft,
            color: UI.su,
            border: `1px solid ${UI.border}`,
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function DcdtParteConfirmFlash({ label }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: UI.green,
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        padding: "6px 10px",
        margin: "4px 0 8px",
      }}
    >
      ✓ {label} guardado correctamente
    </div>
  );
}
