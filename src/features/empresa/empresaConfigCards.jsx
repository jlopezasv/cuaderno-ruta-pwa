export const CONFIG_UI = {
  border: "#dbe4ee",
  surface: "#ffffff",
  surfaceSoft: "#f8fafc",
  tx: "#0f172a",
  muted: "#64748b",
  accent: "#c2410c",
  warn: "#b45309",
  green: "#15803d",
  red: "#b91c1c",
};

export const CONFIG_GRID_CSS = `
.empresa-config-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 20px 88px;
  box-sizing: border-box;
}
.empresa-config-header {
  margin-bottom: 20px;
}
.empresa-config-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 900px) {
  .empresa-config-grid {
    grid-template-columns: 1fr 1fr;
  }
  .empresa-config-span-2 {
    grid-column: 1 / -1;
  }
}
.empresa-config-card {
  background: var(--cfg-surface, #fff);
  border: 1px solid var(--cfg-border, #dbe4ee);
  border-radius: 16px;
  padding: 18px 18px 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  min-width: 0;
}
.empresa-config-card-title {
  font-size: 15px;
  font-weight: 750;
  color: var(--cfg-tx, #0f172a);
  margin-bottom: 4px;
}
.empresa-config-card-desc {
  font-size: 12px;
  color: var(--cfg-muted, #64748b);
  line-height: 1.45;
  margin-bottom: 14px;
}
`;

export function ConfigCard({ title, description, children, span2 = false, className = "", style }) {
  return (
    <div
      className={`empresa-config-card${span2 ? " empresa-config-span-2" : ""}${className ? ` ${className}` : ""}`}
      style={{
        "--cfg-border": CONFIG_UI.border,
        "--cfg-surface": CONFIG_UI.surface,
        "--cfg-tx": CONFIG_UI.tx,
        "--cfg-muted": CONFIG_UI.muted,
        ...style,
      }}
    >
      {title ? <div className="empresa-config-card-title">{title}</div> : null}
      {description ? <div className="empresa-config-card-desc">{description}</div> : null}
      {children}
    </div>
  );
}

export function configFieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${CONFIG_UI.border}`,
    fontSize: 14,
    color: CONFIG_UI.tx,
    background: CONFIG_UI.surface,
  };
}

export function configBtnPrimary(disabled = false) {
  return {
    background: disabled ? "#94a3b8" : CONFIG_UI.tx,
    color: "#fff",
    border: "none",
    borderRadius: 11,
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 750,
    cursor: disabled ? "default" : "pointer",
    width: "100%",
  };
}

export function configBtnSecondary() {
  return {
    background: CONFIG_UI.surfaceSoft,
    color: CONFIG_UI.tx,
    border: `1px solid ${CONFIG_UI.border}`,
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
