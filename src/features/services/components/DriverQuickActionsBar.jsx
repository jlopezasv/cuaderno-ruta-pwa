const DCDT_STYLES = {
  validated: {
    bg: "#dcfce7",
    border: "#bbf7d0",
    color: "#166534",
    label: "✓ DCDT",
  },
  incomplete: {
    bg: "#fffbeb",
    border: "#fde68a",
    color: "#92400e",
    label: "⚠ DCDT",
  },
  none: {
    bg: "#f1f5f9",
    border: "#e2e8f0",
    color: "#475569",
    label: "DCDT",
  },
};

function quickBtnBase() {
  return {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    position: "relative",
    WebkitTapHighlightColor: "transparent",
  };
}

/**
 * Barra compacta DCDT + CHAT bajo el bloque principal del servicio.
 */
export function DriverQuickActionsBar({
  showDcdt = true,
  dcdtVisual = "none",
  onDcdtClick,
  showChat = false,
  unreadCount = 0,
  onChatClick,
}) {
  const dcdtStyle = DCDT_STYLES[dcdtVisual] || DCDT_STYLES.none;
  const chatBadge = unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        gap: 10,
        width: "100%",
      }}
    >
      {showDcdt ? (
        <button
          type="button"
          onClick={onDcdtClick}
          style={{
            ...quickBtnBase(),
            background: dcdtStyle.bg,
            border: `1px solid ${dcdtStyle.border}`,
            color: dcdtStyle.color,
          }}
          aria-label={dcdtStyle.label}
        >
          {dcdtStyle.label}
        </button>
      ) : null}
      {showChat ? (
        <button
          type="button"
          onClick={onChatClick}
          style={{
            ...quickBtnBase(),
            background: "#ffffff",
            border: "1px solid #dbe4ee",
            color: "#0f172a",
          }}
          aria-label={chatBadge ? `Chat, ${chatBadge} no leídos` : "Chat"}
        >
          <span>💬 CHAT</span>
          {chatBadge ? (
            <span
              style={{
                marginLeft: 4,
                background: "#dc2626",
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 6px",
              }}
            >
              {chatBadge}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
