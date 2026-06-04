import React, { useEffect, useState } from "react";
import { formatConductorTelefonoDisplay } from "./conductorTelefonoMovil.js";

export function ConductorTelefonoMovilField({
  conductorId,
  value,
  editable = true,
  onSave,
  ui,
  compact = false,
}) {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  async function commit() {
    const next = String(draft || "").trim();
    const prev = String(value || "").trim();
    if (next === prev || !conductorId || !onSave) return;
    setSaving(true);
    try {
      await onSave(conductorId, next);
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = {
    fontSize: compact ? 10 : 11,
    fontWeight: 650,
    color: ui?.muted || "#64748b",
    marginBottom: compact ? 4 : 6,
    display: "block",
  };

  if (!editable) {
    return (
      <div style={{ marginTop: compact ? 4 : 8 }}>
        {!compact && <span style={labelStyle}>Teléfono móvil</span>}
        <div style={{ fontSize: compact ? 11 : 13, color: ui?.tx || "#0f172a", fontWeight: 600 }}>
          📞 {formatConductorTelefonoDisplay(value)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: compact ? 6 : 10 }}>
      <label style={labelStyle}>Teléfono móvil</label>
      <input
        type="tel"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        placeholder="600 123 123"
        disabled={saving}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: ui?.surfaceSoft || "#f8fafc",
          border: `1px solid ${ui?.border || "#dbe4ee"}`,
          borderRadius: 8,
          padding: compact ? "6px 10px" : "8px 11px",
          fontSize: compact ? 12 : 13,
          color: ui?.tx || "#0f172a",
          outline: "none",
        }}
      />
      {saving && (
        <div style={{ fontSize: 10, color: ui?.muted || "#64748b", marginTop: 4 }}>Guardando…</div>
      )}
    </div>
  );
}
