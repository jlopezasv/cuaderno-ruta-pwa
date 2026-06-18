import { useEffect } from "react";
import {
  cargadorOptionsForDescargaLink,
  cargadorParteIdFromStop,
  descargaCargadorLinkPending,
  isDescargaStop,
} from "../../domain/dcdt/descargaCargadorLink.js";

const UI = {
  border: "#dbe4ee",
  su: "#64748b",
  tx: "#0f172a",
  warn: "#b45309",
  warnBg: "#fffbeb",
};

export function DescargaCargadorOrigenField({
  stop,
  index,
  allStops = [],
  partesCatalog = [],
  onPatchStop,
  onChange,
  themeKey = "empresa",
}) {
  const theme = themeKey === "dark" ? { ...UI, tx: "#f1f5f9", su: "#94a3b8" } : UI;

  if (!isDescargaStop(stop)) return null;

  const options = cargadorOptionsForDescargaLink(allStops, partesCatalog);
  const value = cargadorParteIdFromStop(stop) || "";
  const pending = descargaCargadorLinkPending(stop, allStops);
  const soleOptionId = options.length === 1 ? options[0].id : null;

  useEffect(() => {
    if (!soleOptionId || value) return;
    const patch = { cargador_parte_id: soleOptionId };
    if (typeof onPatchStop === "function") {
      onPatchStop(index, patch);
    } else {
      onChange?.(index, "cargador_parte_id", soleOptionId);
    }
  }, [soleOptionId, value, index, onPatchStop, onChange]);

  if (!options.length) {
    return (
      <div style={{ marginTop: 8, fontSize: 11, color: theme.su, lineHeight: 1.4 }}>
        Vincula primero un cargador en las paradas de carga para asociar esta descarga.
      </div>
    );
  }

  if (options.length === 1) return null;

  const inp = {
    width: "100%",
    background: themeKey === "dark" ? "#0f172a" : "#f8fafc",
    border: `1px solid ${pending ? "#fcd34d" : theme.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: theme.tx,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 6,
  };

  function apply(val) {
    const patch = { cargador_parte_id: val || null };
    if (typeof onPatchStop === "function") {
      onPatchStop(index, patch);
    } else {
      onChange?.(index, "cargador_parte_id", val || null);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 10,
          color: theme.su,
          fontWeight: 800,
          letterSpacing: 0.3,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        Origen de la mercancía
      </div>
      <div style={{ fontSize: 11, color: theme.su, marginBottom: 6, lineHeight: 1.4 }}>
        Esta descarga corresponde a la carga de…
      </div>
      <select value={value} onChange={(e) => apply(e.target.value)} style={inp}>
        <option value="">— Seleccionar cargador de origen —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {pending ? (
        <div
          style={{
            fontSize: 11,
            color: theme.warn,
            background: theme.warnBg,
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "6px 10px",
            lineHeight: 1.4,
          }}
        >
          Pendiente: elige a qué cargador pertenece esta descarga para vincularla al DeCA correcto.
        </div>
      ) : null}
    </div>
  );
}
