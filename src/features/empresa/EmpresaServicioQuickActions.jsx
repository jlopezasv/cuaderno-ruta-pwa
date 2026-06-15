import { useState } from "react";
import { isServiceMessagesEnabled } from "../../config/serviceMessages.js";
import { getAuthUid } from "../../data/supabaseClient.js";
import { ServiceQuickActionsBar } from "../services/components/ServiceQuickActionsBar.jsx";
import { ServiceMessagesModal } from "../services/components/ServiceMessagesModal.jsx";
import { useServiceDcdtQuickStatus } from "../services/hooks/useConductorDcdtQuickStatus.js";
import { useServiceMessagesUnread } from "../services/hooks/useServiceMessagesUnread.js";

/**
 * DCDT + CHAT compactos en tarjeta empresa (modal al pulsar; sin alargar tarjeta).
 */
export function EmpresaServicioQuickActions({
  servicio,
  stops = [],
  empresaNombre = "Tráfico",
  empresaUserId = null,
  showToast,
  onDcdt,
  showDcdt = false,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const showChat = isServiceMessagesEnabled(servicio) && !!servicio?.id;
  const showDcdtBtn = showDcdt && !!servicio?.empresa_id;
  const authUserId = empresaUserId || getAuthUid?.() || null;

  const dcdtQuick = useServiceDcdtQuickStatus({
    servicio,
    stops,
    pollWhileIncomplete: false,
  });

  const messagesUnread = useServiceMessagesUnread({
    servicioId: servicio?.id,
    userId: authUserId,
    enabled: showChat,
  });

  if (!showDcdtBtn && !showChat) return null;

  const stopCardToggle = (e) => {
    e.stopPropagation();
  };

  return (
    <>
      <div
        style={{ marginTop: 10 }}
        onClick={stopCardToggle}
        onKeyDown={stopCardToggle}
        role="presentation"
      >
        <ServiceQuickActionsBar
          variant="empresa"
          showDcdt={showDcdtBtn}
          dcdtVisual={dcdtQuick.visual}
          dcdtNoneLabel="— DCDT"
          onDcdtClick={() => onDcdt?.()}
          showChat={showChat}
          unreadCount={messagesUnread.unread}
          showUnreadHint={messagesUnread.unread > 0}
          onChatClick={() => {
            setChatOpen(true);
            messagesUnread.markRead();
          }}
        />
        {dcdtQuick.readiness?.warnDecaMissingPdfBeforeStart ? (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              fontSize: 11,
              fontWeight: 700,
              color: "#b91c1c",
              lineHeight: 1.4,
            }}
          >
            DeCA no generado antes del inicio — abre DCDT y genera el PDF
          </div>
        ) : null}
      </div>
      <ServiceMessagesModal
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          messagesUnread.markRead();
          void messagesUnread.refresh();
        }}
        servicio={servicio}
        senderName={empresaNombre}
        senderRole="traffic"
        audience="empresa"
        canMarkForCustomerReport
        showToast={showToast}
      />
    </>
  );
}
