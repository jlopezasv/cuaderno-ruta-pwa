import { useState } from "react";
import { DECA_VIVO_UNIDADES } from "../../domain/dcdt/decaVivoConstants.js";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  marginBottom: 8,
};

const TITLES = {
  carga: "Registrar carga",
  descarga: "Registrar descarga",
  retorno: "Registrar retorno / envases",
  devolucion: "Registrar devolución",
  incidencia: "Registrar incidencia",
};

export function RegistroMovimientoModal({
  open,
  tipo = "carga",
  stockActual = [],
  busy,
  onClose,
  onConfirm,
}) {
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("palets");
  const [pesoKg, setPesoKg] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [destinoModo, setDestinoModo] = useState("luego");
  const [repartos, setRepartos] = useState([{ nombre: "", cantidad: "" }]);
  const [observaciones, setObservaciones] = useState("");
  const [documentoRef, setDocumentoRef] = useState("");

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    const payload = {
      tipo,
      descripcion_mercancia: descripcion.trim() || (tipo === "incidencia" ? "Incidencia operativa" : ""),
      cantidad: cantidad !== "" ? Number(cantidad) : null,
      unidad,
      peso_kg: pesoKg !== "" ? Number(pesoKg) : null,
      origen_nombre: origen.trim() || null,
      destino_nombre:
        destinoModo === "luego" && tipo === "carga"
          ? null
          : (destino.trim() || (tipo === "retorno" ? "Pendiente de asignar" : null)),
      observaciones: observaciones.trim() || null,
      documento_referencia: documentoRef.trim() || null,
      repartos:
        tipo === "carga" && destinoModo === "repartos"
          ? repartos.filter((r) => r.nombre.trim() && r.cantidad)
          : null,
      destino_pendiente: tipo === "carga" && destinoModo === "luego",
    };
    await onConfirm(payload);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 820,
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
          padding: 16,
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>{TITLES[tipo] || "Registrar"}</div>

        {tipo === "descarga" && stockActual.length ? (
          <div style={{ marginBottom: 10, fontSize: 12, color: "#64748b" }}>
            A bordo: {stockActual.map((l) => l.descripcion_mercancia).join(", ")}
          </div>
        ) : null}

        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción mercancía / elemento *"
          style={inputStyle}
          required
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input
            type="number"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Cantidad"
            style={inputStyle}
          />
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)} style={inputStyle}>
            {DECA_VIVO_UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <input
          type="number"
          min="0"
          value={pesoKg}
          onChange={(e) => setPesoKg(e.target.value)}
          placeholder="Peso kg (opcional)"
          style={inputStyle}
        />

        {(tipo === "retorno" || tipo === "devolucion") && (
          <input
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="Origen *"
            style={inputStyle}
            required
          />
        )}

        {tipo === "carga" ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>¿Destinos/repartos?</div>
            <select value={destinoModo} onChange={(e) => setDestinoModo(e.target.value)} style={inputStyle}>
              <option value="luego">Añadir luego</option>
              <option value="unico">Un destino</option>
              <option value="repartos">Varios repartos</option>
            </select>
            {destinoModo === "unico" ? (
              <input
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Destino"
                style={inputStyle}
              />
            ) : null}
            {destinoModo === "repartos"
              ? repartos.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6, marginBottom: 6 }}>
                    <input
                      value={r.nombre}
                      onChange={(e) => {
                        const next = [...repartos];
                        next[i] = { ...next[i], nombre: e.target.value };
                        setRepartos(next);
                      }}
                      placeholder={`Destino ${i + 1}`}
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                    <input
                      value={r.cantidad}
                      onChange={(e) => {
                        const next = [...repartos];
                        next[i] = { ...next[i], cantidad: e.target.value };
                        setRepartos(next);
                      }}
                      placeholder="Cant."
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                  </div>
                ))
              : null}
          </>
        ) : tipo === "retorno" || tipo === "devolucion" ? (
          <input
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Destino previsto (almacén, cargador…)"
            style={inputStyle}
          />
        ) : null}

        <input
          value={documentoRef}
          onChange={(e) => setDocumentoRef(e.target.value)}
          placeholder="Albarán / referencia (opcional)"
          style={inputStyle}
        />
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Observaciones"
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
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onClose} style={{ ...inputStyle, background: "#f8fafc", cursor: "pointer" }}>
          Cancelar
        </button>
      </form>
    </div>
  );
}
