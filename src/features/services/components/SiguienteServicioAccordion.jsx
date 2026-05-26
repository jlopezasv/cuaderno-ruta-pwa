import { useMemo } from "react";
import { getServiceClient, getServiceNumberForDisplay } from "../../../domain/service/serviceIdentity.js";
import { getServiceOperationalPresentation } from "../../../domain/service/serviceOperationalPlaces.js";
import { formatStopNotesForDisplay } from "../../../domain/service/stopOperacionMeta.js";

const UI = {
  shell: "#ffffff",
  surface: "#f8fafc",
  tx: "#0f172a",
  su: "#64748b",
  muted: "#94a3b8",
  line: "#e2e8f0",
};

function sortStops(stops) {
  return [...(Array.isArray(stops) ? stops : [])].sort(
    (a, b) => Number(a?.orden ?? 0) - Number(b?.orden ?? 0),
  );
}

function fmtSchedule(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Hoy ${t}`;
  return d.toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function collectObservations(stops) {
  const notes = sortStops(stops)
    .map((stop) => formatStopNotesForDisplay(stop.notas))
    .filter(Boolean);
  return notes.length ? notes.join(" / ") : "";
}

function ReadonlyRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: UI.muted, fontWeight: 800, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 650, lineHeight: 1.35, color: UI.tx }}>{value}</div>
    </div>
  );
}

/**
 * Vista informativa del siguiente servicio asignado (sin acciones operativas).
 */
export function SiguienteServicioAccordion({ servicio, stops = [] }) {
  const sortedStops = useMemo(() => sortStops(stops), [stops]);
  const pres = useMemo(
    () => getServiceOperationalPresentation(servicio, sortedStops),
    [servicio, sortedStops],
  );
  const cliente = pres.clienteNombre || getServiceClient(servicio) || "—";
  const routeLine = pres.routeLine !== "— → —" ? pres.routeLine : "—";
  const referencia = getServiceNumberForDisplay(servicio);
  const carga =
    pres.places?.carga_nombre ||
    pres.places?.carga_direccion ||
    pres.origen ||
    "—";
  const descarga =
    pres.places?.descarga_nombre ||
    pres.places?.descarga_direccion ||
    pres.destino ||
    "—";
  const scheduleLabel = fmtSchedule(servicio?.fecha_inicio);
  const observations = collectObservations(sortedStops);

  return (
    <details
      className="svc-next-coll"
      style={{
        marginTop: 14,
        borderRadius: 14,
        border: `1px solid ${UI.line}`,
        background: UI.shell,
        boxShadow: "0 4px 16px rgba(15,23,42,.04)",
        padding: "0 14px 4px",
      }}
    >
      <style>{`
        .svc-next-coll > summary {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          list-style: none;
          padding: 14px 0 12px;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .svc-next-coll > summary::-webkit-details-marker { display: none; }
        .svc-next-coll > summary::marker { content: ""; }
        .svc-next-coll .svc-next-chev {
          flex-shrink: 0;
          font-size: 11px;
          color: ${UI.muted};
          font-weight: 700;
          margin-top: 4px;
          transition: transform 0.18s ease;
        }
        .svc-next-coll[open] .svc-next-chev { transform: rotate(180deg); }
      `}</style>
      <summary>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 850,
              letterSpacing: 0.6,
              color: UI.su,
              marginBottom: 8,
            }}
          >
            ⏭ SIGUIENTE SERVICIO
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: UI.tx, lineHeight: 1.25 }}>{cliente}</div>
          <div style={{ fontSize: 14, fontWeight: 650, color: UI.su, marginTop: 4, lineHeight: 1.3 }}>
            {routeLine}
          </div>
        </div>
        <span className="svc-next-chev" aria-hidden>
          ▼
        </span>
      </summary>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingBottom: 14,
          fontSize: 13,
          borderTop: `1px solid ${UI.line}`,
          paddingTop: 12,
        }}
      >
        <ReadonlyRow label="Referencia" value={referencia} />
        <ReadonlyRow label="Cliente" value={cliente !== "—" ? cliente : null} />
        <ReadonlyRow label="Punto de carga" value={carga !== "—" ? carga : null} />
        <ReadonlyRow label="Punto de descarga" value={descarga !== "—" ? descarga : null} />
        <ReadonlyRow label="Fecha/hora prevista" value={scheduleLabel} />
        {observations ? <ReadonlyRow label="Observaciones" value={observations} /> : null}
      </div>
    </details>
  );
}

export function SiguienteServicioEmpty() {
  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 14,
        border: `1px dashed ${UI.line}`,
        background: UI.surface,
        padding: "14px 16px",
        fontSize: 13,
        color: UI.su,
        fontWeight: 650,
        lineHeight: 1.45,
        textAlign: "center",
      }}
    >
      No hay próximos servicios asignados
    </div>
  );
}
