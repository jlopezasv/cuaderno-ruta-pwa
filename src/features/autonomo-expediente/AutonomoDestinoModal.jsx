import { useMemo, useState } from "react";
import {
  deleteAutonomoDestino,
  loadAutonomoDestinos,
  searchAutonomoDestinos,
  upsertAutonomoDestino,
} from "../../modules/autonomo-expediente/autonomoDestinoCatalog.js";

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${UI.line}`,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 15,
  marginBottom: 8,
};

const emptyForm = () => ({
  id: null,
  nombre: "",
  direccion: "",
  cp: "",
  ciudad: "",
  contacto: "",
  telefono: "",
  fecha: "",
});

function DestinoDeleteConfirm({ destino, onCancel, onConfirm, busy }) {
  return (
    <div
      style={{
        background: UI.dangerBg,
        border: "1px solid #fecaca",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: UI.tx, marginBottom: 6 }}>
        ¿Eliminar «{destino.nombre}»?
      </div>
      <div style={{ fontSize: 12, color: UI.su, lineHeight: 1.45, marginBottom: 12 }}>
        Solo se quita del catálogo. Los destinos ya registrados en expedientes no se borran.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: "10px 8px",
            borderRadius: 10,
            border: "none",
            background: UI.danger,
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Sí, eliminar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "10px 8px",
            borderRadius: 10,
            border: `1px solid ${UI.line}`,
            background: "#fff",
            color: UI.tx,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function AutonomoDestinoModal({ open, onClose, uid, onConfirm, busy = false, showToast }) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState("search");
  const [catalogTick, setCatalogTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);

  const catalog = useMemo(() => loadAutonomoDestinos(uid), [uid, open, catalogTick]);
  const results = useMemo(() => searchAutonomoDestinos(uid, query), [uid, query, catalog]);

  if (!open) return null;

  function buildPayload(destino) {
    return {
      cliente: destino.nombre,
      direccion: destino.direccion,
      cp: destino.cp,
      ciudad: destino.ciudad,
      fecha: form.fecha || null,
    };
  }

  function pick(destino) {
    onConfirm?.(buildPayload(destino));
  }

  function confirmSave() {
    if (!String(form.nombre || "").trim()) return;
    const saved = {
      id: form.id || undefined,
      nombre: form.nombre.trim(),
      direccion: form.direccion,
      cp: form.cp,
      ciudad: form.ciudad,
      contacto: form.contacto,
      telefono: form.telefono,
    };
    if (uid) upsertAutonomoDestino(uid, saved);
    onConfirm?.(buildPayload(saved));
  }

  function startEdit(destino, event) {
    event?.preventDefault();
    event?.stopPropagation();
    setForm({
      id: destino.id,
      nombre: destino.nombre,
      direccion: destino.direccion || "",
      cp: destino.cp || "",
      ciudad: destino.ciudad || "",
      contacto: destino.contacto || "",
      telefono: destino.telefono || "",
      fecha: "",
    });
    setMode("new");
    setPendingDelete(null);
  }

  function requestDelete(destino, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (busy) return;
    setPendingDelete(destino);
  }

  function confirmDelete() {
    if (!pendingDelete || !uid) {
      showToast?.("No se pudo eliminar el destino");
      return;
    }
    deleteAutonomoDestino(uid, pendingDelete.id, { nombre: pendingDelete.nombre });
    setPendingDelete(null);
    setCatalogTick((n) => n + 1);
    showToast?.("Destino eliminado del catálogo");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13000,
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
          overflow: "auto",
          padding: "16px 16px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>Añadir destino</div>
        <div style={{ fontSize: 13, color: UI.su, marginBottom: 14 }}>Busca un destino guardado o crea uno nuevo.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { id: "search", label: "Buscar" },
            { id: "new", label: form.id ? "Editar destino" : "Nuevo destino" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setPendingDelete(null);
                if (t.id === "new" && !form.id) setForm(emptyForm());
              }}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                border: `1px solid ${mode === t.id ? UI.accent : UI.line}`,
                background: mode === t.id ? "#eff6ff" : UI.bg,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === "search" ? (
          <>
            <input
              style={inputStyle}
              placeholder="Buscar destino…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {pendingDelete ? (
              <DestinoDeleteConfirm
                destino={pendingDelete}
                busy={busy}
                onCancel={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflow: "auto" }}>
              {(results.length ? results : catalog).slice(0, 12).map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: 6,
                    border: `1px solid ${UI.line}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: UI.bg,
                  }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(d)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      border: "none",
                      padding: "12px 14px",
                      background: "transparent",
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: UI.tx }}>{d.nombre}</div>
                    <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
                      {[d.direccion, d.cp, d.ciudad].filter(Boolean).join(" · ") || "Sin dirección"}
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => startEdit(d, e)}
                    style={{
                      flexShrink: 0,
                      alignSelf: "center",
                      padding: "8px 8px",
                      borderRadius: 8,
                      border: `1px solid ${UI.line}`,
                      background: "#fff",
                      color: UI.tx,
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => requestDelete(d, e)}
                    aria-label={`Eliminar ${d.nombre}`}
                    style={{
                      flexShrink: 0,
                      alignSelf: "center",
                      marginRight: 8,
                      padding: "8px 8px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: UI.danger,
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
              {!catalog.length && !query ? (
                <div style={{ fontSize: 13, color: UI.su, textAlign: "center", padding: 16 }}>
                  Sin destinos guardados. Crea el primero en «Nuevo destino».
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {[
              ["nombre", "Cliente / destinatario *"],
              ["direccion", "Dirección"],
              ["cp", "CP"],
              ["ciudad", "Ciudad"],
              ["contacto", "Persona contacto"],
              ["telefono", "Teléfono"],
            ].map(([k, label]) => (
              <label key={k} style={{ display: "block" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: UI.su }}>{label}</span>
                <input
                  style={inputStyle}
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                />
              </label>
            ))}
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: UI.su }}>Fecha entrega (opcional)</span>
              <input
                style={inputStyle}
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </label>
            <button
              type="button"
              disabled={busy || !form.nombre.trim()}
              onClick={confirmSave}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 12px",
                borderRadius: 12,
                border: "none",
                background: UI.accent,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                opacity: busy || !form.nombre.trim() ? 0.6 : 1,
              }}
            >
              {form.id ? "Guardar y añadir" : "Guardar destino"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
