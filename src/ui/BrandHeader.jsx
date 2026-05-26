import React from "react";

export function BrandMark({ size = 36, rounded = 10 }) {
  return (
    <img
      src="/brand/road-logo.svg"
      alt="Cuaderno de Ruta"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: rounded, objectFit: "cover", flexShrink: 0 }}
    />
  );
}

export function BrandHeader({ panelLabel, nameLabel = null, compact = false, titleColor = "#F1F5F9", subColor = "#64748B" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10 }}>
      <BrandMark size={compact ? 30 : 34} rounded={compact ? 8 : 10} />
      <div>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: titleColor, lineHeight: 1.1, letterSpacing: 0.3 }}>
          CUADERNO DE RUTA
        </div>
        <div style={{ fontSize: compact ? 11 : 11.5, color: subColor, marginTop: 2, fontWeight: 600 }}>
          {panelLabel}
          {nameLabel ? ` · ${nameLabel}` : ""}
        </div>
      </div>
    </div>
  );
}
