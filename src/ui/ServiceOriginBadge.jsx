import { getServicioOriginPresentation } from "../domain/service/servicioOriginPresentation.js";

/**
 * Badge de origen del servicio: PRIVADO o nombre de empresa (con logo si existe).
 */
export function ServiceOriginBadge({ servicio, empresaById = {}, size = "md", style = {} }) {
  const pres = getServicioOriginPresentation(servicio, empresaById);
  if (!pres) return null;

  const compact = size === "sm";
  const pad = compact ? "3px 7px" : "4px 9px";
  const fontSize = compact ? 9 : 10;
  const logoSize = compact ? 14 : 16;

  return (
    <span
      title={pres.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 4 : 5,
        maxWidth: compact ? 140 : 200,
        padding: pad,
        borderRadius: 999,
        background: pres.bg,
        color: pres.fg,
        border: `1px solid ${pres.border}`,
        fontSize,
        fontWeight: 800,
        letterSpacing: 0.35,
        lineHeight: 1.2,
        flexShrink: 0,
        ...style,
      }}
    >
      {pres.kind === "empresa" && pres.logoUrl ? (
        <img
          src={pres.logoUrl}
          alt=""
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 4,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : pres.kind === "empresa" ? (
        <span
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 4,
            background: `${pres.fg}18`,
            color: pres.fg,
            fontSize: compact ? 7 : 8,
            fontWeight: 900,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {pres.initial}
        </span>
      ) : null}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {pres.label}
      </span>
    </span>
  );
}
