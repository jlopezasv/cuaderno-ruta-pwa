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
