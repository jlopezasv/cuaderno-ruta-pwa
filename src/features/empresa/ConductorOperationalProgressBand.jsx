import { useMemo } from "react";
import {
  buildConductorOperationalProgressBandModel,
} from "./conductorOperationalProgressBandModel.js";

export const CONDUCTOR_PROGRESS_BAND_CSS = `
.conductor-progress-band {
  min-width: 0;
  flex: 1 1 300px;
  max-width: 340px;
  margin-left: 12px;
  margin-right: 4px;
  min-height: 112px;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.conductor-progress-band__route {
  width: 68%;
  max-width: 100%;
  margin: 0 auto;
  flex-shrink: 0;
}
.conductor-progress-band__endpoints {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  margin-bottom: 6px;
  min-height: 32px;
}
.conductor-progress-band__label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.55px;
  color: #94a3b8;
  text-transform: uppercase;
}
.conductor-progress-band__place {
  font-size: 10.5px;
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
.conductor-progress-band__track-stage {
  position: relative;
  height: 32px;
  flex-shrink: 0;
  margin: 0 0 6px;
  padding: 0 22px;
}
.conductor-progress-band__track {
  position: relative;
  height: 3px;
  border-radius: 999px;
  background: #e2e8f0;
  top: 50%;
  transform: translateY(-50%);
  overflow: visible;
}
.conductor-progress-band__track-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 999px;
  transition: width 250ms ease, background 0.25s ease;
  pointer-events: none;
}
.conductor-progress-band__track-fill--driving {
  background: linear-gradient(90deg, #4ade80 0%, #22c55e 55%, #16a34a 100%);
}
.conductor-progress-band__track-fill--stopped {
  background: linear-gradient(90deg, #fca5a5 0%, #ef4444 55%, #dc2626 100%);
}
.conductor-progress-band__dot {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
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
}
.conductor-progress-band__truck-rail {
  position: absolute;
  left: 22px;
  right: 22px;
  top: 50%;
  height: 0;
  transform: translateY(-50%);
  pointer-events: none;
  z-index: 2;
}
.conductor-progress-band__truck {
  position: absolute;
  left: 0;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 24px;
  border-radius: 6px;
  background: #fff;
  border: 1.5px solid #cbd5e1;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.1);
  transform: translate(calc(var(--pct, 0) * 1%), -50%) translateX(-50%);
  transition: transform 250ms ease, border-color 0.25s ease, box-shadow 0.25s ease;
  will-change: transform;
}
.conductor-progress-band__truck--driving {
  border-color: #4ade80;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.22), 0 0 0 1px rgba(187, 247, 208, 0.75);
}
.conductor-progress-band__truck--stopped {
  border-color: #f87171;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2), 0 0 0 1px rgba(254, 202, 202, 0.8);
}
.conductor-progress-band__truck svg {
  display: block;
  width: 40px;
  height: 17px;
}
.conductor-progress-band__footer {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-align: center;
  line-height: 14px;
  height: 14px;
  min-height: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.conductor-progress-band--idle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 112px;
  width: 68%;
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
}
.conductor-progress-band__idle-title {
  font-size: 11.5px;
  font-weight: 650;
  color: #94a3b8;
  font-style: italic;
  line-height: 1.35;
}
.conductor-card-demo-head {
  align-items: flex-start !important;
}
.conductor-card-demo-actions {
  min-width: 88px;
}
@media (max-width: 720px) {
  .conductor-card-demo-head {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
  }
  .conductor-progress-band {
    flex: 1 1 auto;
    order: 2;
    width: 100%;
    max-width: none;
    margin-left: 0;
    margin-right: 0;
    min-height: 100px;
  }
  .conductor-progress-band__route,
  .conductor-progress-band--idle {
    width: 82%;
  }
  .conductor-card-demo-actions {
    order: 3;
    flex-direction: row !important;
    flex-wrap: wrap;
    justify-content: flex-end !important;
    min-width: 0;
  }
}
`;

/** Articulado: remolque izquierda → cabina amarilla derecha (→ destino). */
function ProgressArticulatedTruckIcon({ isDriving }) {
  const trailer = isDriving ? "#86efac" : "#fca5a5";
  const chassis = isDriving ? "#22c55e" : "#dc2626";
  const stroke = isDriving ? "#166534" : "#991b1b";

  return (
    <svg viewBox="0 0 64 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="5.5" width="34" height="7.5" rx="0.8" fill={trailer} stroke={stroke} strokeWidth="0.6" />
      <rect x="35.5" y="8.5" width="2.5" height="2" rx="0.3" fill="#64748b" />
      <rect x="38" y="6.5" width="11" height="6.5" rx="0.5" fill={chassis} stroke={stroke} strokeWidth="0.55" />
      <path
        d="M48.5 5.2h11.5c.7 0 1.3.5 1.45 1.2l1.1 4.1H48.2l.9-3.4c.15-.6.7-1.1 1.35-1.1h.05z"
        fill="#facc15"
        stroke="#a16207"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <path
        d="M58.8 6.2l1.35 1.85v3.5h-2.1l-.9-2.4c-.1-.35.05-.7.35-.88l.2-.12z"
        fill="#eab308"
        stroke="#a16207"
        strokeWidth="0.35"
      />
      <rect x="50.2" y="6.8" width="3.8" height="3" rx="0.4" fill="#fef9c3" stroke="#a16207" strokeWidth="0.35" />
      {[
        [10, 13.2],
        [28, 13.2],
        [42, 13.2],
        [52, 13.2],
        [58, 13.2],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="2" fill="#1e293b" />
          <circle cx={cx} cy={cy} r="0.85" fill="#cbd5e1" />
        </g>
      ))}
      <circle cx="61.2" cy="7.8" r="0.75" fill="#fef08a" stroke={stroke} strokeWidth="0.25" />
      <circle cx="2.2" cy="8.2" r="0.55" fill="#f1f5f9" stroke={stroke} strokeWidth="0.25" />
    </svg>
  );
}

export function ConductorOperationalProgressBand({
  servicio,
  stops,
  nowMs,
  isDriving = false,
}) {
  const model = useMemo(
    () => buildConductorOperationalProgressBandModel({ servicio, stops, nowMs }),
    [servicio, stops, nowMs],
  );

  if (model.mode === "idle") {
    return (
      <div className="conductor-progress-band" aria-live="polite">
        <div className="conductor-progress-band--idle">
          <div className="conductor-progress-band__idle-title">Sin servicio activo</div>
        </div>
      </div>
    );
  }

  if (model.mode !== "single") {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Number(model.progressPct) || 0));
  const motionClass = isDriving ? "driving" : "stopped";

  return (
    <div className="conductor-progress-band" role="group" aria-label="Seguimiento del servicio en curso">
      <div className="conductor-progress-band__route">
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

        <div className="conductor-progress-band__track-stage" aria-hidden>
          <div className="conductor-progress-band__track">
            <div
              className={`conductor-progress-band__track-fill conductor-progress-band__track-fill--${motionClass}`}
              style={{ width: `${pct}%` }}
            />
            <span className="conductor-progress-band__dot conductor-progress-band__dot--start" />
            <span className="conductor-progress-band__dot conductor-progress-band__dot--end" />
          </div>
          <div className="conductor-progress-band__truck-rail" style={{ "--pct": pct }}>
            <span
              className={`conductor-progress-band__truck conductor-progress-band__truck--${motionClass}`}
              title={`Avance ${pct}%`}
            >
              <ProgressArticulatedTruckIcon isDriving={isDriving} />
            </span>
          </div>
        </div>

        <div className="conductor-progress-band__footer" title={model.footerLine}>
          {model.footerLine}
        </div>
      </div>
    </div>
  );
}
