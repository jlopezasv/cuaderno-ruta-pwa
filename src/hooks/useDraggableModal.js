import { useCallback, useRef, useState } from "react";

/**
 * Permite mover un modal por la pantalla arrastrando la cabecera.
 */
export function useDraggableModal({ disabled = false } = {}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const draggingRef = useRef(false);

  const onHeaderPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target?.closest?.("button, a, input, select, textarea, [data-no-drag]")) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...offsetRef.current };
      draggingRef.current = true;

      const onMove = (ev) => {
        if (!draggingRef.current) return;
        setOffset({
          x: origin.x + (ev.clientX - startX),
          y: origin.y + (ev.clientY - startY),
        });
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      e.preventDefault();
    },
    [disabled],
  );

  const panelStyle =
    offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined;

  const headerGripStyle = disabled
    ? undefined
    : { cursor: "grab", touchAction: "none", userSelect: "none" };

  return {
    panelStyle,
    headerGripStyle,
    onHeaderPointerDown,
    resetDrag: () => setOffset({ x: 0, y: 0 }),
  };
}
