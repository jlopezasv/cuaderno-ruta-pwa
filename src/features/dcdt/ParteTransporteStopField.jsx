import { useEffect, useMemo, useState } from "react";
import {
  createParteTransporteRapido,
  fetchPartesTransporte,
  parteToDisplayLine,
  suggestParteTipoForStop,
} from "../../domain/dcdt/partesTransporteModel.js";
import { PARTE_TIPO_LABELS } from "../../domain/dcdt/dcdtConstants.js";

const UI = {
  border: "#dbe4ee",
  bg: "#f8fafc",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
};

export function ParteTransporteStopField({
  stop,
  index,
  onChange,
  empresaId,
  themeKey = "empresa",
  compact = false,
}) {
  const theme = themeKey === "dark" ? { ...UI, bg: "#0f172a", tx: "#f1f5f9" } : UI;
  const [partes, setPartes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickNombre, setQuickNombre] = useState("");
  const [quickDir, setQuickDir] = useState("");
  const [quickNif, setQuickNif] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickErr, setQuickErr] = useState("");

  const parteTipo = stop?.parte_transporte_tipo || suggestParteTipoForStop(stop?.tipo);
  const parteId = stop?.parte_transporte_id || "";

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

  const filtered = useMemo(() => {
    const t = String(parteTipo || "").toLowerCase();
    return partes.filter((p) => p.tipo === t || p.tipo === "operador" || p.tipo === "destinatario");
  }, [partes, parteTipo]);

  const selected = partes.find((p) => p.id === parteId);
  const inp = {
    width: "100%",
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: compact ? 6 : 8,
    padding: compact ? "6px 8px" : "8px 10px",
    fontSize: compact ? 12 : 13,
    color: theme.tx,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: compact ? 4 : 6,
  };
  const lbl = { fontSize: 10, color: theme.su, fontWeight: 700, marginBottom: 2 };

  async function guardarRapido() {
    if (!quickNombre.trim() || !quickDir.trim()) {
      setQuickErr("Nombre y dirección obligatorios");
      return;
    }
    setQuickSaving(true);
    setQuickErr("");
    try {
      const created = await createParteTransporteRapido({
        empresaId,
        tipo: parteTipo,
        nombre: quickNombre.trim(),
        direccion: quickDir.trim(),
        nif: quickNif.trim() || null,
        ciudad: stop?.nombre?.trim() || null,
      });
      setPartes((prev) => [...prev, created]);
      onChange(index, "parte_transporte_id", created.id);
      onChange(index, "parte_transporte_tipo", created.tipo);
      setQuickOpen(false);
      setQuickNombre("");
      setQuickDir("");
      setQuickNif("");
    } catch (e) {
      setQuickErr(e?.message || "No se pudo crear");
    } finally {
      setQuickSaving(false);
    }
  }

  if (!empresaId) return null;

  return (
    <div style={{ marginTop: compact ? 6 : 10 }}>
      <div style={lbl}>Parte DCDT ({PARTE_TIPO_LABELS[parteTipo] || "Parte"})</div>
      <select
        value={parteId}
        onChange={(e) => {
          const id = e.target.value;
          onChange(index, "parte_transporte_id", id || null);
          const hit = partes.find((p) => p.id === id);
          if (hit) onChange(index, "parte_transporte_tipo", hit.tipo);
        }}
        style={inp}
      >
        <option value="">{loading ? "Cargando…" : "— Del catálogo —"}</option>
        {filtered.map((p) => (
          <option key={p.id} value={p.id}>
            {parteToDisplayLine(p)}
            {p.nif ? ` · ${p.nif}` : ""}
          </option>
        ))}
      </select>
      {!quickOpen ? (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          style={{
            width: "100%",
            background: "transparent",
            border: `1px dashed ${theme.border}`,
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: theme.accent,
            cursor: "pointer",
          }}
        >
          + Crear rápido (nombre + dirección)
        </button>
      ) : (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10 }}>
          <input value={quickNombre} onChange={(e) => setQuickNombre(e.target.value)} placeholder="Nombre" style={inp} />
          <input value={quickDir} onChange={(e) => setQuickDir(e.target.value)} placeholder="Dirección" style={inp} />
          <input value={quickNif} onChange={(e) => setQuickNif(e.target.value)} placeholder="CIF (opcional)" style={inp} />
          {quickErr ? <div style={{ fontSize: 10, color: "#b91c1c" }}>{quickErr}</div> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => setQuickOpen(false)} style={{ flex: 1, fontSize: 11 }}>
              Cancelar
            </button>
            <button type="button" disabled={quickSaving} onClick={guardarRapido} style={{ flex: 1, fontSize: 11, fontWeight: 800 }}>
              {quickSaving ? "…" : "Crear"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
