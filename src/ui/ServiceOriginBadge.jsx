import { getServicioOriginPresentation } from "../domain/service/servicioOriginPresentation.js";

/**
 * Badge de origen del servicio: PRIVADO o nombre de empresa (con logo si existe).
 */
export function ServiceOriginBadge({
  servicio,
  empresaById = {},
  size = "md",
  truncate = true,
  style = {},
}) {
  const pres = getServicioOriginPresentation(servicio, empresaById);
  if (!pres) return null;

  const compact = size === "sm";
  const pad = compact ? "3px 7px" : "4px 9px";
  const fontSize = compact ? 9 : 10;
  const logoSize = compact ? 14 : 16;

  return (
    <span
      title={truncate ? pres.label : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 4 : 5,
        maxWidth: truncate ? (compact ? 140 : 200) : "100%",
        width: truncate ? undefined : "100%",
        boxSizing: "border-box",
        padding: pad,
        borderRadius: truncate ? 999 : 8,
        background: pres.bg,
        color: pres.fg,
        border: `1px solid ${pres.border}`,
        fontSize,
        fontWeight: 800,
        letterSpacing: 0.35,
        lineHeight: 1.25,
        flexShrink: truncate ? 0 : undefined,
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
        style={
          truncate
            ? {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }
            : {
                flex: 1,
                minWidth: 0,
                whiteSpace: "normal",
                wordBreak: "break-word",
              }
        }
      >
        {pres.label}
      </span>
    </span>
  );
}
