import { useEffect, useRef, useState } from "react";
import {
  EU_COUNTRY_OPTIONS,
  defaultStopCountry,
  lookupPostalCode,
} from "../../../domain/geo/postalCodeLookup.js";
import { stopGeoToPlace, stopMissingPostalWarning } from "../../../domain/geo/stopGeoModel.js";
import { geocodeQueryFromPlace } from "../../../domain/service/serviceOperationalPlaces.js";
import { ContratoParteStopBlock } from "../../dcdt/ContratoParteStopBlock.jsx";

const THEMES = {
  empresa: {
    bg: "#f8fafc",
    tx: "#0f172a",
    su: "#64748b",
    border: "#dbe4ee",
    accent: "#2563eb",
    inputBg: "#f8fafc",
    warn: "#b45309",
    ok: "#15803d",
    block: "#ffffff",
  },
  dark: {
    bg: "#0f172a",
    tx: "#f1f5f9",
    su: "#64748b",
    border: "#334155",
    accent: "#38bdf8",
    inputBg: "#0f172a",
    warn: "#fbbf24",
    ok: "#22c55e",
    block: "#1e293b",
  },
};

const GRID_CSS = `
.stop-geo-servicio-grid .stop-geo-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin-bottom: 8px;
}
.stop-geo-servicio-grid .stop-geo-row-3 {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr;
  gap: 10px 12px;
  margin-bottom: 8px;
}
@media (max-width: 900px) {
  .stop-geo-servicio-grid .stop-geo-row-2,
  .stop-geo-servicio-grid .stop-geo-row-3 {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
`;

function fieldLabel(theme, text) {
  return (
    <div style={{ fontSize: 10, color: theme.su, fontWeight: 700, marginBottom: 2, letterSpacing: 0.2 }}>
      {text}
    </div>
  );
}

function blockTitle(theme, text) {
  return (
    <div
      style={{
        fontSize: 10,
        color: theme.su,
        fontWeight: 800,
        letterSpacing: 0.35,
        marginBottom: 8,
        marginTop: 4,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}

function applyPostalSuggestion(stop, result, onChange, index) {
  if (!result) return;
  if (result.ciudad && !String(stop?.nombre || "").trim()) {
    onChange(index, "nombre", result.ciudad);
  }
  if (result.provincia && !String(stop?.provincia || "").trim()) {
    onChange(index, "provincia", result.provincia);
  }
  if (result.pais && !String(stop?.pais || "").trim()) {
    onChange(index, "pais", result.pais);
  }
  if (result.lat != null && (stop?.lat == null || stop?.lat === "")) {
    onChange(index, "lat", result.lat);
  }
  if (result.lon != null && (stop?.lon == null || stop?.lon === "")) {
    onChange(index, "lon", result.lon);
  }
}

/**
 * Campos geográficos + bloques operativo/documental por parada.
 * layout: "default" | "servicio-grid"
 */
export function StopGeoFieldsForm({
  stop,
  index,
  onChange,
  onPatchStop = null,
  themeKey = "empresa",
  compact = false,
  layout = "default",
  showGeoStatus = true,
  empresaId = null,
  onPartesChange = null,
}) {
  const theme = THEMES[themeKey] || THEMES.empresa;
  const isGrid = layout === "servicio-grid" || !compact;
  const inp = {
    width: "100%",
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    borderRadius: isGrid ? 8 : compact ? 6 : 9,
    padding: isGrid ? "8px 10px" : compact ? "6px 8px" : "9px 10px",
    fontSize: isGrid ? 13 : compact ? 12 : 13,
    color: theme.tx,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: isGrid ? 6 : compact ? 4 : 6,
  };

  const [lookupStatus, setLookupStatus] = useState("idle");
  const [lookupHint, setLookupHint] = useState("");
  const lastLookupKey = useRef("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const cp = String(stop?.codigo_postal || "").trim();
    const pais = String(stop?.pais || "").trim() || defaultStopCountry();
    if (cp.length < 4) {
      setLookupStatus("idle");
      if (!cp) setLookupHint("");
      return;
    }
    const key = `${pais}|${cp}`;
    if (key === lastLookupKey.current) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookupStatus("loading");
      const result = await lookupPostalCode({ pais, codigoPostal: cp });
      if (cancelled) return;
      lastLookupKey.current = key;
      if (!result) {
        setLookupStatus("miss");
        setLookupHint("CP no encontrado — completa ciudad manualmente");
        return;
      }
      setLookupStatus("ok");
      setLookupHint(
        result.provincia
          ? `Sugerido: ${result.ciudad}, ${result.provincia}`
          : `Sugerido: ${result.ciudad}`,
      );
      applyPostalSuggestion(stop, result, onChangeRef.current, index);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stop?.pais, stop?.codigo_postal, index]);

  const handleField = (field, value) => {
    if (field === "detalles") {
      if (typeof onPatchStop === "function") {
        onPatchStop(index, { detalles: value, notas: value });
      } else {
        onChange(index, "detalles", value);
        onChange(index, "notas", value);
      }
      return;
    }
    if (field === "codigo_postal" || field === "pais") {
      lastLookupKey.current = "";
    }
    onChange(index, field, value);
  };

  const missingCp = stopMissingPostalWarning(stop);
  const geoQuery = geocodeQueryFromPlace(stopGeoToPlace(stop));
  const hasCoords = stop?.lat != null && stop?.lon != null;

  const lookupLine =
    lookupStatus === "loading" ? (
      <div style={{ fontSize: 10, color: theme.su, marginBottom: 4 }}>Buscando localidad…</div>
    ) : lookupHint ? (
      <div
        style={{
          fontSize: 10,
          color: lookupStatus === "ok" ? theme.ok : theme.warn,
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        {lookupHint}
      </div>
    ) : null;

  const cpWarning = missingCp ? (
    <div style={{ fontSize: 10, color: theme.warn, marginBottom: 6, lineHeight: 1.35 }}>
      Sin código postal: la ubicación puede ser menos precisa.
    </div>
  ) : null;

  const geoStatusLine =
    showGeoStatus && geoQuery ? (
      <div style={{ fontSize: 10, color: hasCoords ? theme.ok : theme.su, fontWeight: 600, lineHeight: 1.35 }}>
        {hasCoords ? `✓ Coordenadas listas · ${geoQuery}` : `Geocodificará: ${geoQuery}`}
      </div>
    ) : null;

  const ubicacionBlock = (
    <div
      style={{
        background: theme.block,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: isGrid ? "10px 12px" : "8px 10px",
        marginBottom: 8,
      }}
    >
      {blockTitle(theme, "Bloque A — Ubicación operativa")}
      <div className={isGrid ? "stop-geo-row-3" : undefined} style={!isGrid ? { display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "1fr 120px", gap: 6 } : undefined}>
        <div>
          {fieldLabel(theme, "Ciudad")}
          <input value={stop?.nombre || ""} onChange={(e) => handleField("nombre", e.target.value)} placeholder="El Ejido" style={inp} />
        </div>
        <div>
          {fieldLabel(theme, "Código postal")}
          <input
            value={stop?.codigo_postal || ""}
            onChange={(e) => handleField("codigo_postal", e.target.value.toUpperCase())}
            placeholder="04700"
            style={inp}
          />
        </div>
        <div>
          {fieldLabel(theme, "País")}
          <select value={stop?.pais || defaultStopCountry()} onChange={(e) => handleField("pais", e.target.value)} style={inp}>
            {EU_COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {lookupLine}
      {cpWarning}
      <div className={isGrid ? "stop-geo-row-2" : undefined}>
        <div>
          {fieldLabel(theme, "Dirección")}
          <input
            value={stop?.direccion || ""}
            onChange={(e) => handleField("direccion", e.target.value)}
            placeholder="Calle, polígono, nave…"
            style={inp}
          />
        </div>
        <div>
          {fieldLabel(theme, "Muelle / operador")}
          <input
            value={stop?.empresa || ""}
            onChange={(e) => handleField("empresa", e.target.value)}
            placeholder="Polígono sector 20 — solo informativo"
            style={{ ...inp, color: theme.su }}
          />
        </div>
      </div>
      <div>
        {fieldLabel(theme, "Detalles operativos")}
        <input
          value={stop?.detalles ?? stop?.notas ?? ""}
          onChange={(e) => handleField("detalles", e.target.value)}
          placeholder="Puerta, horario, referencia muelle…"
          style={{ ...inp, marginBottom: showGeoStatus ? 4 : 0 }}
        />
      </div>
      {geoStatusLine}
    </div>
  );

  if (isGrid) {
    return (
      <div className="stop-geo-servicio-grid">
        <style>{GRID_CSS}</style>
        {ubicacionBlock}
        {empresaId ? (
          <ContratoParteStopBlock
            stop={stop}
            index={index}
            onChange={onChange}
            onPatchStop={onPatchStop}
            empresaId={empresaId}
            themeKey={themeKey}
            onPartesChange={onPartesChange}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {ubicacionBlock}
      {empresaId ? (
        <ContratoParteStopBlock
          stop={stop}
          index={index}
          onChange={onChange}
          empresaId={empresaId}
          themeKey={themeKey}
          onPartesChange={onPartesChange}
        />
      ) : null}
    </div>
  );
}
