import { useCallback, useEffect, useState } from "react";
import { listServiceMessages } from "../../../domain/messages/serviceMessagesApi.js";
import {
  countUnreadServiceMessages,
  getServiceMessagesReadAt,
  markServiceMessagesRead,
} from "../../../domain/messages/serviceMessagesUnread.js";

export function useServiceMessagesUnread({ servicioId, userId, enabled = true, pollMs = 30000 }) {
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !servicioId) {
      setUnread(0);
      setTotal(0);
      return;
    }
    try {
      const rows = await listServiceMessages(servicioId);
      setTotal(rows.length);
      if (!userId) {
        setUnread(0);
        return;
      }
      const readAt = getServiceMessagesReadAt(servicioId, userId);
      setUnread(countUnreadServiceMessages(rows, userId, readAt));
    } catch {
      setUnread(0);
    }
  }, [enabled, servicioId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !servicioId) return;
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, servicioId, pollMs, refresh]);

  const markRead = useCallback(() => {
    if (!servicioId || !userId) return;
    markServiceMessagesRead(servicioId, userId);
    setUnread(0);
  }, [servicioId, userId]);

  return { unread, total, refresh, markRead };
}
