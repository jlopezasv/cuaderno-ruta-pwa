import { useMemo, useState } from "react";
import {
  deleteAutonomoAlmacen,
  loadAutonomoAlmacenes,
  searchAutonomoAlmacenes,
} from "../../modules/autonomo-expediente/autonomoAlmacenCatalog.js";
import {
  SERVICIO_ALCANCE,
  SERVICIO_ALCANCE_DEFAULT,
  SERVICIO_ALCANCE_LABELS,
} from "../../domain/service/servicioAlcance.js";

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  accent: "#2563eb",
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
  nombre: "",
  direccion: "",
  cp: "",
  ciudad: "",
  contacto: "",
  telefono: "",
  cif: "",
});

export function AutonomoRegistrarCargaModal({ open, onClose, uid, onConfirm, busy = false, showToast }) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState("search");
  const [alcance, setAlcance] = useState(SERVICIO_ALCANCE_DEFAULT);
  const [catalogTick, setCatalogTick] = useState(0);

  const catalog = useMemo(() => loadAutonomoAlmacenes(uid), [uid, open, catalogTick]);
  const results = useMemo(() => searchAutonomoAlmacenes(uid, query), [uid, query, catalog]);

  if (!open) return null;

  function pick(almacen) {
    onConfirm?.({ almacen, alcance });
  }

  function confirmNew() {
    if (!String(form.nombre || "").trim()) return;
    onConfirm?.({ almacen: { ...form }, alcance });
  }

  function handleDeleteAlmacen(almacen, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (busy) return;
    const label = almacen.nombre || "este almacén";
    const ok = window.confirm(
      `¿Eliminar «${label}» del catálogo?\n\nLas cargas ya registradas en expedientes no se borran.`,
    );
    if (!ok) return;
    deleteAutonomoAlmacen(uid, almacen.id);
    setCatalogTick((n) => n + 1);
    showToast?.("Almacén eliminado del catálogo");
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
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>Registrar carga</div>
        <div style={{ fontSize: 13, color: UI.su, marginBottom: 14 }}>Elige almacén o crea uno nuevo.</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: UI.su, marginBottom: 6 }}>ALCANCE DEL TRANSPORTE</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[SERVICIO_ALCANCE.NACIONAL, SERVICIO_ALCANCE.INTERNACIONAL].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAlcance(id)}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  borderRadius: 10,
                  border: `1px solid ${alcance === id ? UI.accent : UI.line}`,
                  background: alcance === id ? "#eff6ff" : UI.bg,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {SERVICIO_ALCANCE_LABELS[id]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: UI.su, marginTop: 6, lineHeight: 1.4 }}>
            DeCA solo se genera en cargas nacionales al cerrar el expediente.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { id: "search", label: "Buscar" },
            { id: "new", label: "Nuevo almacén" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
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
              placeholder="Buscar almacén…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflow: "auto" }}>
              {(results.length ? results : catalog).slice(0, 12).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: 8,
                    border: `1px solid ${UI.line}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: UI.bg,
                  }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(a)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      border: "none",
                      padding: "12px 14px",
                      background: "transparent",
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: UI.tx }}>{a.nombre}</div>
                    <div style={{ fontSize: 12, color: UI.su, marginTop: 4 }}>
                      {[a.direccion, a.cp, a.ciudad].filter(Boolean).join(" · ") || "Sin dirección"}
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => handleDeleteAlmacen(a, e)}
                    aria-label={`Eliminar ${a.nombre}`}
                    style={{
                      flexShrink: 0,
                      alignSelf: "center",
                      marginRight: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: busy ? "default" : "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
              {!catalog.length && !query ? (
                <div style={{ fontSize: 13, color: UI.su, textAlign: "center", padding: 16 }}>
                  Sin almacenes guardados. Crea el primero en «Nuevo almacén».
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {[
              ["nombre", "Nombre almacén *"],
              ["direccion", "Dirección"],
              ["cp", "CP"],
              ["ciudad", "Ciudad"],
              ["contacto", "Persona contacto"],
              ["telefono", "Teléfono"],
              ["cif", "CIF"],
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
            <button
              type="button"
              disabled={busy || !form.nombre.trim()}
              onClick={confirmNew}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 12px",
                borderRadius: 12,
                border: "none",
                background: "#15803d",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                opacity: busy || !form.nombre.trim() ? 0.6 : 1,
              }}
            >
              Registrar carga aquí
            </button>
          </>
        )}
      </div>
    </div>
  );
}
