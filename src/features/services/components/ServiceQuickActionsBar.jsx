import {
  DECA_BTN_NONE,
  DECA_BTN_OK,
  DECA_BTN_WARN,
  DECA_SHORT_LABEL,
} from "../../../domain/dcdt/decaBranding.js";

const DCDT_STYLES = {
  validated: {
    bg: "#dcfce7",
    border: "#bbf7d0",
    color: "#166534",
    label: DECA_BTN_OK,
  },
  incomplete: {
    bg: "#fffbeb",
    border: "#fde68a",
    color: "#92400e",
    label: DECA_BTN_WARN,
  },
  none: {
    bg: "#f1f5f9",
    border: "#e2e8f0",
    color: "#475569",
    label: DECA_BTN_NONE,
  },
};

function quickBtnBase({ compact }) {
  return {
    width: "100%",
    minWidth: 0,
    minHeight: compact ? 36 : 48,
    borderRadius: compact ? 8 : 10,
    padding: compact ? "7px 10px" : "10px 14px",
    fontSize: compact ? 12 : 14,
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
 * Barra compacta DCDT + CHAT (conductor y empresa).
 * @param {"driver"|"empresa"} variant
 */
export function ServiceQuickActionsBar({
  variant = "driver",
  showDcdt = true,
  dcdtVisual = "none",
  dcdtNoneLabel,
  onDcdtClick,
  showChat = false,
  unreadCount = 0,
  onChatClick,
  showUnreadHint = false,
}) {
  const compact = variant === "empresa";
  const dcdtStyle = { ...DCDT_STYLES[dcdtVisual] || DCDT_STYLES.none };
  if (dcdtVisual === "none" && dcdtNoneLabel) {
    dcdtStyle.label = dcdtNoneLabel;
  } else if (dcdtVisual === "none" && !compact) {
    dcdtStyle.label = DECA_SHORT_LABEL;
  }
  const chatBadge = unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null;
  const chatHasUnread = unreadCount > 0;

  const colCount = (showDcdt ? 1 : 0) + (showChat ? 1 : 0);

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: colCount > 1 ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
          alignItems: "stretch",
          gap: compact ? 8 : 10,
          width: "100%",
        }}
      >
        {showDcdt ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDcdtClick?.();
            }}
            style={{
              ...quickBtnBase({ compact }),
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
            onClick={(e) => {
              e.stopPropagation();
              onChatClick?.();
            }}
            style={{
              ...quickBtnBase({ compact }),
              background: chatHasUnread ? "#ffffff" : "#f8fafc",
              border: `1px solid ${chatHasUnread ? "#dbe4ee" : "#e2e8f0"}`,
              color: chatHasUnread ? "#0f172a" : "#64748b",
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
                  fontSize: compact ? 10 : 11,
                  fontWeight: 800,
                  minWidth: compact ? 18 : 20,
                  height: compact ? 18 : 20,
                  borderRadius: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 5px",
                }}
              >
                {chatBadge}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      {showUnreadHint && chatHasUnread ? (
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "#64748b", lineHeight: 1.3 }}>
          {unreadCount} mensaje{unreadCount === 1 ? "" : "s"} sin leer
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Usar ServiceQuickActionsBar */
export const DriverQuickActionsBar = ServiceQuickActionsBar;
