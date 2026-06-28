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
  nombre: "",
  direccion: "",
  cp: "",
  ciudad: "",
  pais: "ES",
  contacto: "",
  telefono: "",
  cif: "",
});

const emptyMercancia = () => ({
  descripcion: "",
  palets: "",
  bultos: "",
  peso_kg: "",
});

function AlmacenDeleteConfirm({ almacen, onCancel, onConfirm, busy }) {
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
        ¿Eliminar «{almacen.nombre}»?
      </div>
      <div style={{ fontSize: 12, color: UI.su, lineHeight: 1.45, marginBottom: 12 }}>
        Solo se quita del catálogo. Las cargas ya registradas en expedientes no se borran.
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

export function AutonomoRegistrarCargaModal({
  open,
  onClose,
  uid,
  onConfirm,
  busy = false,
  showToast,
  retornoMode = false,
  retornoDesdeStopId = null,
}) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [mercancia, setMercancia] = useState(emptyMercancia);
  const [mode, setMode] = useState("search");
  const [alcance, setAlcance] = useState(SERVICIO_ALCANCE_DEFAULT);
  const [requiereDeca, setRequiereDeca] = useState(null);
  const [catalogTick, setCatalogTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);

  const catalog = useMemo(() => loadAutonomoAlmacenes(uid), [uid, open, catalogTick]);
  const results = useMemo(() => searchAutonomoAlmacenes(uid, query), [uid, query, catalog]);

  if (!open) return null;

  function buildPayload(almacen) {
    const merc = {};
    if (mercancia.descripcion?.trim()) merc.descripcion = mercancia.descripcion.trim();
    if (mercancia.palets !== "") merc.palets = mercancia.palets;
    if (mercancia.bultos !== "") merc.bultos = mercancia.bultos;
    if (mercancia.peso_kg !== "") merc.peso_kg = mercancia.peso_kg;
    return {
      almacen,
      alcance,
      mercancia: Object.keys(merc).length ? merc : null,
      esRetorno: retornoMode,
      retornoDesdeStopId,
      requiereDeca: retornoMode ? requiereDeca : null,
    };
  }

  function pick(almacen) {
    onConfirm?.(buildPayload(almacen));
  }

  function confirmNew() {
    if (!String(form.nombre || "").trim()) return;
    onConfirm?.(buildPayload({ ...form }));
  }

  function requestDelete(almacen, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (busy) return;
    setPendingDelete(almacen);
  }

  function confirmDelete() {
    if (!pendingDelete || !uid) {
      showToast?.("No se pudo eliminar el almacén");
      return;
    }
    deleteAutonomoAlmacen(uid, pendingDelete.id, { nombre: pendingDelete.nombre });
    setPendingDelete(null);
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
        <div style={{ fontSize: 17, fontWeight: 800, color: UI.tx, marginBottom: 4 }}>
          {retornoMode ? "Registrar retorno / nueva carga" : "Registrar carga"}
        </div>
        <div style={{ fontSize: 13, color: UI.su, marginBottom: 14 }}>
          {retornoMode ? "Mercancía recogida en destino." : "Elige almacén o crea uno nuevo."}
        </div>

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
            DeCA nacional se genera tras terminar la carga, antes de circular.
          </div>
        </div>

        {retornoMode ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: UI.su, marginBottom: 6 }}>¿REQUIERE DeCA?</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { v: true, label: "Sí, requiere DeCA" },
                { v: false, label: "No requiere DeCA" },
              ].map(({ v, label }) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setRequiereDeca(v)}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 10,
                    border: `1px solid ${requiereDeca === v ? UI.accent : UI.line}`,
                    background: requiereDeca === v ? "#eff6ff" : UI.bg,
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ marginBottom: 12, padding: "10px 12px", background: UI.bg, borderRadius: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: UI.su, marginBottom: 6 }}>MERCANCÍA (opcional)</div>
          {[
            ["descripcion", "Mercancía"],
            ["palets", "Palets"],
            ["bultos", "Bultos"],
            ["peso_kg", "Peso (kg)"],
          ].map(([k, label]) => (
            <input
              key={k}
              style={{ ...inputStyle, marginBottom: 6 }}
              placeholder={label}
              value={mercancia[k]}
              onChange={(e) => setMercancia((m) => ({ ...m, [k]: e.target.value }))}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { id: "search", label: "Buscar" },
            { id: "new", label: "Nuevo almacén" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setPendingDelete(null);
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
              placeholder="Buscar almacén…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {pendingDelete ? (
              <AlmacenDeleteConfirm
                almacen={pendingDelete}
                busy={busy}
                onCancel={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
              />
            ) : null}
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
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => requestDelete(a, e)}
                    aria-label={`Eliminar ${a.nombre}`}
                    style={{
                      flexShrink: 0,
                      alignSelf: "center",
                      marginRight: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: UI.danger,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: busy ? "default" : "pointer",
                      opacity: busy ? 0.6 : 1,
                      touchAction: "manipulation",
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
              ["pais", "País"],
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
