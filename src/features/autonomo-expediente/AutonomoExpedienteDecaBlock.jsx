import { useCallback, useEffect, useMemo, useState } from "react";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { fetchAutonomoDecaById } from "../../domain/dcdt/decaAutonomoModel.js";
import {
  autonomoDecaAsQrDcdt,
  downloadAutonomoDecaPdf,
} from "../../domain/dcdt/decaAutonomoPdf.js";
import { buildDecaDownloadUrl } from "../../domain/dcdt/decaUrl.js";
import { getExpedienteDecaLinks } from "../../modules/autonomo-expediente/autonomoExpedienteMeta.js";
import { DcdtQrModal } from "../dcdt/DcdtQrModal.jsx";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#166534",
  greenBg: "#dcfce7",
  blue: "#2563eb",
};

function actionBtn() {
  return {
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${UI.line}`,
    background: UI.card,
    color: UI.tx,
  };
}

export function AutonomoExpedienteDecaBlock({ servicio, showToast }) {
  const links = useMemo(
    () => getExpedienteDecaLinks(servicio),
    [servicio?.id, servicio?.referencia, servicio?.updated_at],
  );
  const linksKey = useMemo(() => links.map((l) => l.deca_id || l.deca_public_id).join(","), [links]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qrDeca, setQrDeca] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadDecas = useCallback(async () => {
    if (!links.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const loaded = await Promise.all(
        links.map(async (link) => {
          const deca = link.deca_id ? await fetchAutonomoDecaById(link.deca_id) : null;
          return { link, deca };
        }),
      );
      setRows(loaded.filter((r) => r.deca || r.link));
    } finally {
      setLoading(false);
    }
  }, [linksKey]);

  useEffect(() => {
    void loadDecas();
  }, [loadDecas]);

  if (!links.length) return null;

  async function handlePdf(deca) {
    if (!deca?.id) return;
    setBusyId(deca.id);
    try {
      await downloadAutonomoDecaPdf(deca);
      showToast?.("PDF DeCA descargado");
    } catch (e) {
      showToast?.(e?.message || "No se pudo descargar");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 0.7, marginBottom: 10, textTransform: "uppercase" }}>
        {DECA_SHORT_LABEL} del expediente
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: UI.su }}>Cargando DeCA…</div>
      ) : (
        rows.map(({ link, deca }) => {
          const publicId = deca?.decaPublicId || link.deca_public_id;
          const url =
            deca?.datos?.deca_download_url ||
            link.download_url ||
            (publicId ? buildDecaDownloadUrl(publicId, { allowBrowserOriginFallback: true }) : "");
          return (
            <div
              key={link.deca_id || publicId}
              style={{
                background: UI.greenBg,
                border: "1px solid #bbf7d0",
                borderRadius: 14,
                padding: "12px 14px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 800, color: UI.green, fontSize: 14 }}>
                {link.carga_nombre || link.origen || DECA_SHORT_LABEL}
              </div>
              <div style={{ fontSize: 13, color: UI.tx, marginTop: 4 }}>
                {link.origen || "—"} → {link.destino || "—"}
              </div>
              {url ? (
                <div style={{ fontSize: 11, color: UI.su, marginTop: 6, wordBreak: "break-all" }}>{url}</div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {publicId ? (
                  <button
                    type="button"
                    style={actionBtn()}
                    onClick={() => setQrDeca(deca || { decaPublicId: publicId, datos: { deca_download_url: url } })}
                  >
                    Ver QR
                  </button>
                ) : null}
                {deca ? (
                  <button
                    type="button"
                    style={actionBtn()}
                    disabled={busyId === deca.id}
                    onClick={() => void handlePdf(deca)}
                  >
                    {busyId === deca.id ? "Descargando…" : "Descargar PDF"}
                  </button>
                ) : null}
                {url ? (
                  <button
                    type="button"
                    style={actionBtn()}
                    onClick={() => {
                      try {
                        navigator.clipboard?.writeText(url);
                        showToast?.("Enlace copiado");
                      } catch {
                        showToast?.(url);
                      }
                    }}
                  >
                    Copiar enlace
                  </button>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      {qrDeca ? (
        <DcdtQrModal
          dcdt={autonomoDecaAsQrDcdt(qrDeca)}
          decaPublicId={qrDeca.decaPublicId}
          onClose={() => setQrDeca(null)}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
