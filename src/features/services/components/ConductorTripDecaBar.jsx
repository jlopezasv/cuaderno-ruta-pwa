import { useState } from "react";
import { isServiceMessagesEnabled } from "../../../config/serviceMessages.js";
import { DECA_SHORT_LABEL } from "../../../domain/dcdt/decaBranding.js";
import { isDecaAplicable } from "../../../domain/service/servicioAlcance.js";
import { getServiceNumberForDisplay } from "../../../domain/service/serviceIdentity.js";
import { useConductorDcdtQuickStatus } from "../hooks/useConductorDcdtQuickStatus.js";
import { useServiceMessagesUnread } from "../hooks/useServiceMessagesUnread.js";
import { DriverDcdtActionModal } from "./DriverDcdtActionModal.jsx";
import { ServiceMessagesModal } from "./ServiceMessagesModal.jsx";
import { DriverQuickActionsBar } from "./ServiceQuickActionsBar.jsx";

/**
 * Acceso DeCA + chat del viaje en la lista de paradas (sin abrir una parada).
 */
export function ConductorTripDecaBar({
  servicio,
  empresa = null,
  conductorUid = null,
  stops = [],
  showToast,
  tripLabel = null,
  senderName = "Conductor",
}) {
  const [decaOpen, setDecaOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const showDeca = !!servicio?.empresa_id && isDecaAplicable(servicio);
  const showChat = isServiceMessagesEnabled(servicio) && !!servicio?.id;
  const dcdtQuick = useConductorDcdtQuickStatus({
    servicio: showDeca ? servicio : null,
    empresa,
    conductorUid,
    stops,
    pollWhileIncomplete: showDeca,
  });
  const messagesUnread = useServiceMessagesUnread({
    servicioId: servicio?.id,
    userId: conductorUid,
    enabled: showChat,
  });

  if (!showDeca && !showChat) return null;

  const label = tripLabel || getServiceNumberForDisplay(servicio) || "Viaje";

  return (
    <>
      <div
        style={{
          background: "#fff",
          border: "1px solid #dbe4ee",
          borderRadius: 14,
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.4, marginBottom: 8 }}>
          {showDeca ? `${DECA_SHORT_LABEL} · ${label}` : label}
        </div>
        <DriverQuickActionsBar
          showDcdt={showDeca}
          dcdtVisual={dcdtQuick.visual}
          onDcdtClick={() => setDecaOpen(true)}
          showChat={showChat}
          unreadCount={messagesUnread.unread}
          onChatClick={() => {
            setChatOpen(true);
            void messagesUnread.markRead();
          }}
        />
      </div>
      {showDeca ? (
        <DriverDcdtActionModal
          open={decaOpen}
          onClose={() => {
            setDecaOpen(false);
            void dcdtQuick.reload();
          }}
          servicio={servicio}
          empresa={empresa}
          conductorUid={conductorUid}
          stops={stops}
          showToast={showToast}
        />
      ) : null}
      {showChat ? (
        <ServiceMessagesModal
          open={chatOpen}
          onClose={() => {
            setChatOpen(false);
            void messagesUnread.markRead();
            void messagesUnread.refresh();
          }}
          servicio={servicio}
          senderName={senderName}
          showToast={showToast}
          onMarkRead={messagesUnread.markRead}
        />
      ) : null}
    </>
  );
}
