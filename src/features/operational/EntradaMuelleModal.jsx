import { useMemo, useState } from "react";
import { loadAutonomoAlmacenes, searchAutonomoAlmacenes } from "../../modules/autonomo-expediente/autonomoAlmacenCatalog.js";
import { TIPO_PREVISTO, TIPO_PREVISTO_LABELS } from "../../modules/autonomo-expediente/operacionMuelleModel.js";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  marginBottom: 8,
};

export function EntradaMuelleModal({ open, uid, busy, onClose, onConfirm }) {
  const [query, setQuery] = useState("");
  const [lugarNombre, setLugarNombre] = useState("");
  const [lugarDireccion, setLugarDireccion] = useState("");
  const [tipoPrevisto, setTipoPrevisto] = useState(TIPO_PREVISTO.INDEFINIDO);
  const [observacion, setObservacion] = useState("");

  const lugares = useMemo(() => {
    const all = loadAutonomoAlmacenes(uid);
    return query.trim() ? searchAutonomoAlmacenes(uid, query) : all.slice(0, 8);
  }, [uid, query]);

  if (!open) return null;

  function pickLugar(l) {
    setLugarNombre(l.nombre);
    setLugarDireccion(l.direccion || "");
    setQuery("");
  }

  async function submit(e) {
    e.preventDefault();
    const nombre = lugarNombre.trim() || query.trim();
    if (!nombre) return;
    await onConfirm({
      lugar: { nombre, direccion: lugarDireccion.trim() || null },
      tipo_previsto: tipoPrevisto,
      observacion: observacion.trim() || null,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 800,
        background: "rgba(15,23,42,.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          padding: "16px 16px 24px",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Entrada en muelle</div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Lugar actual</label>
        <input
          value={query || lugarNombre}
          onChange={(e) => {
            setQuery(e.target.value);
            setLugarNombre(e.target.value);
          }}
          placeholder="Buscar o escribir lugar…"
          style={inputStyle}
          required
        />
        {lugares.length && query ? (
          <div style={{ marginBottom: 8 }}>
            {lugares.slice(0, 5).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => pickLugar(l)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  marginBottom: 4,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {l.nombre}
                {l.direccion ? ` · ${l.direccion}` : ""}
              </button>
            ))}
          </div>
        ) : null}

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Operación prevista</label>
        <select value={tipoPrevisto} onChange={(e) => setTipoPrevisto(e.target.value)} style={inputStyle}>
          {Object.entries(TIPO_PREVISTO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Observación (opcional)</label>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "none",
            background: "#0f766e",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: busy ? "wait" : "pointer",
            marginBottom: 8,
          }}
        >
          {busy ? "Registrando…" : "Confirmar entrada"}
        </button>
        <button type="button" onClick={onClose} style={{ ...inputStyle, background: "#f8fafc", cursor: "pointer" }}>
          Cancelar
        </button>
      </form>
    </div>
  );
}
