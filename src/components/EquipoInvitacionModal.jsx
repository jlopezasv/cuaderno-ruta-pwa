import { useEffect, useState } from "react";

/** URL de la PWA con ?equipo=COD (abre perfil y rellena vinculación). */
export function buildEquipoDeepLink(equipoCode) {
  if (typeof window === "undefined") return "";
  const c = String(equipoCode || "").trim();
  if (!c) return "";
  const u = new URL(window.location.pathname || "/", window.location.origin);
  u.searchParams.set("equipo", c);
  return u.toString();
}

/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {string} props.equipoNombre
 * @param {string} props.equipoCode — código legible (codigo_equipo)
 * @param {string} [props.linkUrl] — si vacío, el QR llevará solo el código como texto
 */
export function EquipoInvitacionModal({ onClose, equipoNombre, equipoCode, linkUrl }) {
  const [qr, setQr] = useState("");
  const [copyHint, setCopyHint] = useState(null);
  const payload = (linkUrl && String(linkUrl).trim()) || String(equipoCode || "").trim();

  useEffect(() => {
    let live = true;
    if (!payload) {
      setQr("");
      return undefined;
    }
    import("qrcode")
      .then(({ default: QR }) =>
        QR.toDataURL(payload, {
          width: 232,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0f172a", light: "#ffffff" },
        })
      )
      .then((url) => {
        if (live) setQr(url);
      })
      .catch(() => {
        if (live) setQr("");
      });
    return () => {
      live = false;
    };
  }, [payload]);

  const initial = (equipoNombre || "?").trim().charAt(0).toUpperCase();

  async function flash(msg) {
    setCopyHint(msg);
    setTimeout(() => setCopyHint(null), 2200);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(String(equipoCode || ""));
      await flash("Código copiado");
    } catch {
      await flash("No se pudo copiar");
    }
  }

  async function copyLink() {
    const u = linkUrl || buildEquipoDeepLink(equipoCode);
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u);
      await flash("Enlace copiado");
    } catch {
      await flash("No se pudo copiar");
    }
  }

  async function share() {
    const title = `Únete a ${equipoNombre || "nuestro equipo"}`;
    const text = `Abre Cuaderno de Ruta y usa el código de equipo: ${equipoCode}`;
    const url = linkUrl || buildEquipoDeepLink(equipoCode);
    try {
      if (navigator.share && url) await navigator.share({ title, text, url });
      else if (url) await copyLink();
      else await copyCode();
    } catch {
      /* usuario canceló share */
    }
  }

  const btnBase = {
    flex: 1,
    borderRadius: 12,
    padding: "12px 10px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(15,23,42,.52)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)",
          borderRadius: 20,
          maxWidth: 400,
          width: "100%",
          padding: "24px 22px 20px",
          boxShadow: "0 28px 80px rgba(15,23,42,.22)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 1.2, marginBottom: 6 }}>INVITAR CONDUCTOR</div>
            <div style={{ fontSize: 18, fontWeight: 850, color: "#0f172a", lineHeight: 1.25 }}>Código de equipo</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#f1f5f9",
              color: "#475569",
              fontSize: 18,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg,#f59e0b,#ea580c)",
              color: "white",
              fontSize: 22,
              fontWeight: 850,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 8px 20px rgba(245,158,11,.35)",
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis" }}>{equipoNombre || "Tu empresa"}</div>
            <div style={{ fontFamily: "'JetBrains Mono',ui-monospace,monospace", fontSize: 20, fontWeight: 800, color: "#c2410c", marginTop: 4, letterSpacing: 0.5 }}>
              {equipoCode || "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          {qr ? (
            <img src={qr} alt="" width={220} height={220} style={{ borderRadius: 12, display: "block" }} />
          ) : (
            <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 14, fontWeight: 600 }}>
              Generando QR…
            </div>
          )}
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 12, textAlign: "center", lineHeight: 1.45 }}>
            Al escanear, se abre la app con el código listo. El conductor solo confirma.
          </div>
        </div>

        {copyHint && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d", textAlign: "center", marginBottom: 10 }}>{copyHint}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" onClick={copyCode} style={{ ...btnBase, background: "#0f172a", color: "#fff" }}>
            Copiar código
          </button>
          <button type="button" onClick={copyLink} style={{ ...btnBase, background: "#e2e8f0", color: "#0f172a" }}>
            Copiar enlace
          </button>
        </div>
        <button type="button" onClick={share} style={{ ...btnBase, width: "100%", background: "#2563eb", color: "#fff", marginBottom: 4 }}>
          Compartir invitación
        </button>
      </div>
    </div>
  );
}
