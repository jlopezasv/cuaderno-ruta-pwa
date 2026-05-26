import { switchActiveMode } from "../data/authContext.js";

export function ModeSwitchButton({ uid, targetMode, compact = false, dark = false }) {
  if (!uid || !targetMode) return null;

  const isConductor = targetMode === "conductor";
  const label = isConductor ? "Modo conductor" : "Modo empresa";
  const icon = isConductor ? "◉" : "◇";

  function handleClick() {
    switchActiveMode(uid, targetMode);
    window.location.reload();
  }

  const border = dark ? "#334155" : "rgba(15,23,42,.12)";
  const bg = dark ? "rgba(245,158,11,.12)" : "rgba(245,158,11,.10)";
  const color = dark ? "#F59E0B" : "#B45309";

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: compact ? 8 : 10,
        padding: compact ? "5px 8px" : "6px 12px",
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        color,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: compact ? 4 : 6,
        fontFamily: "Outfit, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: compact ? 13 : 14, lineHeight: 1 }}>{icon}</span>
      {!compact && <span>{label}</span>}
    </button>
  );
}
