import { LIM } from "../../domain/route/routePlanning.js";

export const CONDUCTOR_NORMA_PILLS_CSS = `
.conductor-norma-pills {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}
.conductor-norma-pill {
  min-width: 0;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, "Cascadia Mono", monospace;
}
@media (max-width: 640px) {
  .conductor-norma-pills {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;

/**
 * 4 métricas tacógrafo en una fila compacta (solo presentación).
 * @param {object} norma — mismo objeto que en la ficha conductor
 * @param {(mins: number) => string} fmtDur
 * @param {(color: string) => { fg: string, bg: string, border: string }} empresaTone
 */
export function ConductorNormaMetricPills({ norma, fmtDur, empresaTone }) {
  if (!norma) return null;

  const canColor =
    norma.canDrive <= 0
      ? "#EF4444"
      : norma.canDrive <= 30
        ? "#EF4444"
        : norma.canDrive <= 90
          ? "#F97316"
          : "#22C55E";
  const weekColor =
    norma.weekDrive > LIM.WEEK * 0.9
      ? "#EF4444"
      : norma.weekDrive > LIM.WEEK * 0.7
        ? "#F97316"
        : "#64748B";
  const contColor =
    norma.cont >= 270 ? "#EF4444" : norma.cont >= 210 ? "#F97316" : "#64748B";

  const pills = [
    {
      key: "can",
      text:
        norma.canDrive <= 0 ? "¡PARAR!" : `${fmtDur(norma.canDrive)} disponibles`,
      color: canColor,
    },
    {
      key: "hoy",
      text: `Hoy ${fmtDur(norma.todayDrive)}`,
      color: "#F59E0B",
    },
    {
      key: "sem",
      text: `Semana ${fmtDur(norma.weekDrive)}/56h`,
      color: weekColor,
    },
    {
      key: "cont",
      text: `Continúa ${fmtDur(norma.cont)}`,
      color: contColor,
    },
  ];

  return (
    <div className="conductor-norma-pills" role="list" aria-label="Tiempos del conductor">
      {pills.map(({ key, text, color }) => {
        const tone = empresaTone(color);
        return (
          <span
            key={key}
            role="listitem"
            className="conductor-norma-pill"
            title={text}
            style={{
              color: tone.fg,
              background: tone.bg,
              borderColor: tone.border,
            }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
