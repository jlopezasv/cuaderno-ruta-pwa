import { useMemo } from "react";
import {
  buildConductorOperationalProgressBandModel,
} from "./conductorOperationalProgressBandModel.js";

export const CONDUCTOR_PROGRESS_BAND_CSS = `
.conductor-progress-band {
  min-width: 0;
  flex: 1 1 200px;
}
.conductor-progress-band__endpoints {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 4px;
}
.conductor-progress-band__label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.55px;
  color: #94a3b8;
  text-transform: uppercase;
}
.conductor-progress-band__place {
  font-size: 11.5px;
  font-weight: 650;
  color: #1e293b;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conductor-progress-band__place--dest {
  text-align: right;
}
.conductor-progress-band__track-wrap {
  position: relative;
  height: 26px;
  display: flex;
  align-items: center;
  margin: 2px 0 4px;
  padding: 0 2px;
}
.conductor-progress-band__track {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
  position: relative;
  overflow: visible;
}
.conductor-progress-band__track-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3b82f6 0%, #2563eb 55%, #1d4ed8 100%);
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.35);
  transition: width 0.35s ease;
  pointer-events: none;
}
.conductor-progress-band__dot {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0f172a;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transform: translate(-50%, -50%);
  z-index: 1;
}
.conductor-progress-band__dot--start {
  left: 0;
  background: #64748b;
}
.conductor-progress-band__dot--end {
  left: 100%;
  background: #15803d;
  box-shadow: 0 0 0 2px rgba(21, 128, 61, 0.2);
}
.conductor-progress-band__truck {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(180deg, #fff 0%, #f1f5f9 100%);
  border: 1px solid #cbd5e1;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  transition: left 0.35s ease;
}
.conductor-progress-band__truck svg {
  display: block;
  width: 26px;
  height: 14px;
}
.conductor-progress-band__footer {
  font-size: 10.5px;
  font-weight: 600;
  color: #64748b;
  text-align: center;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conductor-progress-band--idle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  font-size: 11.5px;
  font-weight: 650;
  color: #94a3b8;
  font-style: italic;
}
@media (max-width: 720px) {
  .conductor-card-demo-head {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .conductor-progress-band {
    flex: 1 1 auto;
    order: 2;
    width: 100%;
  }
  .conductor-card-demo-actions {
    order: 3;
    flex-direction: row !important;
    flex-wrap: wrap;
    justify-content: flex-end !important;
  }
}
`;

/** Camión lateral mirando hacia la derecha (destino). */
function ProgressTruckIcon() {
  return (
    <svg viewBox="0 0 32 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2 11.5h17.5l2.2-4.2c.3-.6.9-1 1.6-1H26v5.2H2z"
        fill="#2563eb"
      />
      <path d="M21.8 6.3h4.2v5.2h-6.4l2.2-4.2z" fill="#1d4ed8" />
      <rect x="23.2" y="4.8" width="4.8" height="3.8" rx="0.6" fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.5" />
      <rect x="24" y="5.6" width="2.2" height="1.6" rx="0.2" fill="#bfdbfe" />
      <circle cx="7" cy="12" r="2.2" fill="#334155" />
      <circle cx="7" cy="12" r="1" fill="#94a3b8" />
      <circle cx="22.5" cy="12" r="2.2" fill="#334155" />
      <circle cx="22.5" cy="12" r="1" fill="#94a3b8" />
      <path d="M2 11.5h3.5" stroke="#1e40af" strokeWidth="0.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Banda torre de control entre datos del conductor y acciones.
 * `stages` reservado para multiparada (no renderizado aún).
 */
export function ConductorOperationalProgressBand({ servicio, stops, nowMs }) {
  const model = useMemo(
    () => buildConductorOperationalProgressBandModel({ servicio, stops, nowMs }),
    [servicio, stops, nowMs],
  );

  if (model.mode === "idle") {
    return (
      <div className="conductor-progress-band conductor-progress-band--idle" aria-live="polite">
        Sin servicio activo
      </div>
    );
  }

  if (model.mode !== "single") {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Number(model.progressPct) || 0));

  return (
    <div className="conductor-progress-band" role="group" aria-label="Seguimiento del servicio en curso">
      <div className="conductor-progress-band__endpoints">
        <div style={{ minWidth: 0 }}>
          <div className="conductor-progress-band__label">Origen</div>
          <div className="conductor-progress-band__place" title={model.originLabel}>
            {model.originLabel}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="conductor-progress-band__label" style={{ textAlign: "right" }}>
            Destino
          </div>
          <div
            className="conductor-progress-band__place conductor-progress-band__place--dest"
            title={model.destinationLabel}
          >
            {model.destinationLabel}
          </div>
        </div>
      </div>

      <div className="conductor-progress-band__track-wrap" aria-hidden>
        <div className="conductor-progress-band__track">
          <div className="conductor-progress-band__track-fill" style={{ width: `${pct}%` }} />
          <span className="conductor-progress-band__dot conductor-progress-band__dot--start" />
          <span className="conductor-progress-band__dot conductor-progress-band__dot--end" />
        </div>
        <span
          className="conductor-progress-band__truck"
          style={{ left: `${pct}%` }}
          title={`Avance ${pct}%`}
        >
          <ProgressTruckIcon />
        </span>
      </div>

      <div className="conductor-progress-band__footer" title={model.footerLine}>
        {model.footerLine}
      </div>
    </div>
  );
}
