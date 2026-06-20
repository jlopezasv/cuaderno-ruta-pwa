import { useEffect, useRef, useState } from "react";

const UI = {
  tx: "#0f172a",
  su: "#64748b",
  line: "#e2e8f0",
  green: "#15803d",
  greenSoft: "#dcfce7",
};

function canvasHasInk(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] > 12) return true;
  }
  return false;
}

export function SignaturePad({ canvasRef, onInkChange }) {
  const localRef = useRef(null);
  const setRef = (el) => {
    localRef.current = el;
    if (typeof canvasRef === "function") canvasRef(el);
    else if (canvasRef) canvasRef.current = el;
  };
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = localRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    onInkChange?.(false);
  }, []);

  function pointFromEvent(e) {
    const canvas = localRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    last.current = pointFromEvent(e);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = localRef.current;
    const ctx = canvas.getContext("2d");
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    const rect = canvas.getBoundingClientRect();
    onInkChange?.(canvasHasInk(ctx, rect.width, rect.height));
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = localRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    onInkChange?.(false);
  }

  return (
    <div>
      <canvas
        ref={setRef}
        style={{
          width: "100%",
          height: 140,
          borderRadius: 12,
          border: `1.5px solid ${UI.line}`,
          background: "#fff",
          touchAction: "none",
          display: "block",
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button
        type="button"
        onClick={clear}
        style={{
          marginTop: 8,
          background: "transparent",
          border: "none",
          color: UI.su,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          padding: 0,
        }}
      >
        Borrar firma
      </button>
    </div>
  );
}

/**
 * Cierre documental tras operativa de muelles (comentario + firma).
 */
export function ExpedienteClosureBlock({ onConfirm, saving = false }) {
  const [comentario, setComentario] = useState("");
  const [hasFirma, setHasFirma] = useState(false);
  const firmaCanvasRef = useRef(null);

  return (
    <div
      style={{
        marginTop: 20,
        padding: "16px 14px",
        borderRadius: 16,
        border: `2px solid ${UI.green}`,
        background: UI.greenSoft,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 850, color: UI.green }}>Operativa completada</div>
          <div style={{ fontSize: 12, color: UI.su, marginTop: 2, lineHeight: 1.4 }}>
            Cierra el expediente con tu comentario y firma. La operativa en muelle ya está registrada.
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 800, color: UI.su, letterSpacing: 0.5, marginBottom: 6 }}>
        COMENTARIO FINAL (opcional)
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Observaciones de cierre, incidencias menores, entrega…"
        rows={3}
        disabled={saving}
        style={{
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 12,
          border: `1px solid ${UI.line}`,
          padding: "11px 12px",
          fontSize: 14,
          color: UI.tx,
          resize: "vertical",
          marginBottom: 14,
          background: "#fff",
        }}
      />

      <div style={{ fontSize: 10, fontWeight: 800, color: UI.su, letterSpacing: 0.5, marginBottom: 6 }}>
        FIRMA
      </div>
      <SignaturePad canvasRef={firmaCanvasRef} onInkChange={setHasFirma} />

      <button
        type="button"
        disabled={saving || !hasFirma}
        onClick={() => onConfirm?.({ comentario, firmaCanvas: firmaCanvasRef.current })}
        style={{
          width: "100%",
          marginTop: 16,
          minHeight: 48,
          borderRadius: 12,
          border: "none",
          background: hasFirma ? UI.green : "#94a3b8",
          color: "#fff",
          fontSize: 15,
          fontWeight: 800,
          cursor: saving || !hasFirma ? "default" : "pointer",
          opacity: saving ? 0.75 : 1,
        }}
      >
        {saving ? "Cerrando expediente…" : "Cerrar expediente"}
      </button>
    </div>
  );
}
