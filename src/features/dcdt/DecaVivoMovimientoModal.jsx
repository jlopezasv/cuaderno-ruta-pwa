import { useMemo, useState } from "react";
import {
  DECA_VIVO_MOVIMIENTO,
  DECA_VIVO_MOVIMIENTO_LABELS,
  DECA_VIVO_UNIDADES,
} from "../../domain/dcdt/decaVivoConstants.js";
import { validarMovimientoDeCaVivo } from "../../domain/dcdt/decaVivoStock.js";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #dbe4ee",
  fontSize: 14,
  boxSizing: "border-box",
};

export function DecaVivoMovimientoModal({
  initialTipo = DECA_VIVO_MOVIMIENTO.CARGA,
  presetUnidad = "",
  stops = [],
  stockActual = [],
  labels = DECA_VIVO_MOVIMIENTO_LABELS,
  onClose,
  onSubmit,
  busy = false,
}) {
  const [tipo, setTipo] = useState(initialTipo);
  const [paradaId, setParadaId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState(presetUnidad || "palets");
  const [pesoKg, setPesoKg] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [documentoRef, setDocumentoRef] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [error, setError] = useState("");

  const stopOptions = useMemo(
    () =>
      (stops || []).map((s) => ({
        id: s.id,
        label: [s.nombre, s.direccion, s.tipo].filter(Boolean).join(" · ") || s.id?.slice(0, 8),
      })),
    [stops],
  );

  const selectedStop = stops.find((s) => s.id === paradaId);

  function buildPayload() {
    return {
      tipo_movimiento: tipo,
      parada_id: paradaId || null,
      lugar_nombre: selectedStop?.nombre || selectedStop?.direccion || null,
      lugar_direccion: selectedStop?.direccion || null,
      descripcion_mercancia: descripcion,
      categoria_mercancia: categoria || null,
      cantidad: cantidad !== "" ? Number(cantidad) : null,
      unidad: unidad || null,
      peso_kg: pesoKg !== "" ? Number(pesoKg) : null,
      origen_nombre: origen || null,
      destino_nombre: destino || null,
      observaciones: observaciones || null,
      documento_referencia: documentoRef || null,
      motivo_ajuste: motivoAjuste || null,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = buildPayload();
    const check = validarMovimientoDeCaVivo(payload, stockActual);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError("");
    await onSubmit(payload);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 750,
        background: "rgba(15,23,42,.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 0,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
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
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Registrar movimiento</div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Tipo
        </label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        {stopOptions.length ? (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
              Parada / lugar
            </label>
            <select
              value={paradaId}
              onChange={(e) => setParadaId(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }}
            >
              <option value="">— Seleccionar parada —</option>
              {stopOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Mercancía o elemento *
        </label>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej. Alimentación refrigerada, palets vacíos…"
          style={{ ...inputStyle, marginBottom: 10 }}
          required
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Categoría
        </label>
        <input
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder="Opcional"
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
              Cantidad
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
              Unidad
            </label>
            <select value={unidad} onChange={(e) => setUnidad(e.target.value)} style={inputStyle}>
              {DECA_VIVO_UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Peso (kg)
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={pesoKg}
          onChange={(e) => setPesoKg(e.target.value)}
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Origen
        </label>
        <input value={origen} onChange={(e) => setOrigen(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Destino previsto
        </label>
        <input value={destino} onChange={(e) => setDestino(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

        {tipo === DECA_VIVO_MOVIMIENTO.AJUSTE_MANUAL ? (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
              Motivo del ajuste *
            </label>
            <textarea
              value={motivoAjuste}
              onChange={(e) => setMotivoAjuste(e.target.value)}
              rows={2}
              style={{ ...inputStyle, marginBottom: 10, resize: "vertical" }}
              required
            />
          </>
        ) : null}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Albarán / referencia
        </label>
        <input
          value={documentoRef}
          onChange={(e) => setDocumentoRef(e.target.value)}
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>
          Observaciones
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          style={{ ...inputStyle, marginBottom: 12, resize: "vertical" }}
        />

        {error ? <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>{error}</div> : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "none",
            background: "#166534",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            cursor: busy ? "wait" : "pointer",
            marginBottom: 8,
          }}
        >
          {busy ? "Guardando…" : "Registrar y actualizar DeCA"}
        </button>
        <button type="button" onClick={onClose} style={{ ...inputStyle, background: "#f8fafc", cursor: "pointer" }}>
          Cancelar
        </button>
      </form>
    </div>
  );
}
