import { useEffect, useState } from "react";

export function ConductorVehiculoEmpresaFields({
  conductorId,
  matricula = "",
  remolque = "",
  editable = true,
  onSave,
  ui,
  compact = false,
}) {
  const [draftMatricula, setDraftMatricula] = useState(matricula || "");
  const [draftRemolque, setDraftRemolque] = useState(remolque || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftMatricula(matricula || "");
    setDraftRemolque(remolque || "");
  }, [matricula, remolque]);

  async function commit() {
    if (!conductorId || !onSave) return;
    const nextM = String(draftMatricula || "").trim();
    const nextR = String(draftRemolque || "").trim();
    const prevM = String(matricula || "").trim();
    const prevR = String(remolque || "").trim();
    if (nextM === prevM && nextR === prevR) return;
    setSaving(true);
    try {
      await onSave(conductorId, { matricula: nextM, remolque: nextR });
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = {
    fontSize: compact ? 10 : 11,
    fontWeight: 650,
    color: ui?.muted || ui?.su || "#64748b",
    marginBottom: compact ? 4 : 6,
    display: "block",
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: ui?.surfaceSoft || "#f8fafc",
    border: `1px solid ${ui?.border || "#dbe4ee"}`,
    borderRadius: 8,
    padding: compact ? "6px 10px" : "8px 11px",
    fontSize: compact ? 12 : 13,
    color: ui?.tx || "#0f172a",
    outline: "none",
  };

  if (!editable) {
    return (
      <div style={{ marginTop: compact ? 4 : 8, fontSize: compact ? 11 : 12, color: ui?.tx || "#0f172a" }}>
        {matricula ? <div>🚛 {matricula}</div> : null}
        {remolque ? <div style={{ marginTop: 2, color: ui?.muted || "#64748b" }}>🔗 {remolque}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ marginTop: compact ? 6 : 10 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
          gap: compact ? 6 : 8,
        }}
      >
        <div>
          <label style={labelStyle}>Matrícula tractora</label>
          <input
            type="text"
            value={draftMatricula}
            onChange={(e) => setDraftMatricula(e.target.value)}
            onBlur={() => void commit()}
            placeholder="1234 ABC"
            disabled={saving}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Matrícula remolque</label>
          <input
            type="text"
            value={draftRemolque}
            onChange={(e) => setDraftRemolque(e.target.value)}
            onBlur={() => void commit()}
            placeholder="R-5678 XYZ"
            disabled={saving}
            style={inputStyle}
          />
        </div>
      </div>
      {saving ? (
        <div style={{ fontSize: 10, color: ui?.muted || "#64748b", marginTop: 4 }}>Guardando vehículo…</div>
      ) : null}
    </div>
  );
}
