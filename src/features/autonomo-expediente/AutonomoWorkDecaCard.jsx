import { useCallback, useEffect, useMemo, useState } from "react";
import { DECA_SHORT_LABEL } from "../../domain/dcdt/decaBranding.js";
import { fetchAutonomoDecaById } from "../../domain/dcdt/decaAutonomoModel.js";
import {
  autonomoDecaAsQrDcdt,
  downloadAutonomoDecaPdf,
} from "../../domain/dcdt/decaAutonomoPdf.js";
import { buildDecaDownloadUrl } from "../../domain/dcdt/decaUrl.js";
import { getExpedienteDecaLinks } from "../../modules/autonomo-expediente/autonomoExpedienteMeta.js";
import { resolveAutonomoDecaFocus } from "../../modules/autonomo-expediente/autonomoExpedienteUiModel.js";
import { DcdtQrModal } from "../dcdt/DcdtQrModal.jsx";

const UI = {
  card: "#ffffff",
  line: "#e2e8f0",
  tx: "#0f172a",
  su: "#64748b",
  green: "#166534",
  greenBg: "#dcfce7",
  amber: "#b45309",
  amberBg: "#fffbeb",
};

function actionBtn(active = false) {
  return {
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${active ? "#86efac" : UI.line}`,
    background: active ? "#bbf7d0" : UI.card,
    color: UI.tx,
  };
}

/**
 * DeCA visible en pantalla de trabajo: selector por tramo/carga y QR + enlace.
 */
export function AutonomoWorkDecaCard({ servicio, cargas = [], destinos = [], operativo, showToast, onGenerarDeca }) {
  const focus = useMemo(
    () => resolveAutonomoDecaFocus({ servicio, cargas, destinos, operativo }),
    [servicio, cargas, destinos, operativo],
  );
  const links = useMemo(
    () => getExpedienteDecaLinks(servicio),
    [servicio?.id, servicio?.referencia, servicio?.updated_at],
  );
  const [selectedKey, setSelectedKey] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qrDeca, setQrDeca] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const options = useMemo(() => {
    return links.map((link) => ({
      key: link.carga_stop_id || link.deca_id || link.deca_public_id,
      link,
      label: [link.carga_nombre || link.origen, link.destino ? `→ ${link.destino}` : ""]
        .filter(Boolean)
        .join(" "),
    }));
  }, [links]);

  useEffect(() => {
    if (!options.length) {
      setSelectedKey(null);
      return;
    }
    const preferred = focus?.link?.carga_stop_id || focus?.link?.deca_id || focus?.cargaId;
    const match = options.find((o) => o.key === preferred);
    setSelectedKey((prev) => {
      if (prev && options.some((o) => o.key === prev)) return prev;
      return match?.key || options[options.length - 1]?.key || null;
    });
  }, [options, focus?.link, focus?.cargaId]);

  const selected = options.find((o) => o.key === selectedKey) || options[options.length - 1] || null;

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
  }, [links]);

  useEffect(() => {
    void loadDecas();
  }, [loadDecas]);

  if (focus.kind === "none" && !links.length) return null;

  const activeRow = rows.find(
    (r) =>
      (selected?.link?.deca_id && r.link.deca_id === selected.link.deca_id) ||
      (selected?.link?.carga_stop_id && r.link.carga_stop_id === selected.link.carga_stop_id),
  );
  const { link, deca } = activeRow || { link: selected?.link, deca: null };
  const publicId = deca?.decaPublicId || link?.deca_public_id;
  const url =
    deca?.datos?.deca_download_url ||
    link?.download_url ||
    (publicId ? buildDecaDownloadUrl(publicId, { allowBrowserOriginFallback: true }) : "");

  return (
    <div
      style={{
        background: focus.kind === "pending" ? UI.amberBg : UI.greenBg,
        border: `1px solid ${focus.kind === "pending" ? "#fde68a" : "#bbf7d0"}`,
        borderRadius: 14,
        padding: "12px 14px",
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: UI.su, letterSpacing: 0.6, marginBottom: 8 }}>
        {DECA_SHORT_LABEL} · GUARDIA CIVIL
      </div>

      {focus.kind === "pending" ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 800, color: UI.amber, marginBottom: 6 }}>
            Pendiente antes de circular
          </div>
          <div style={{ fontSize: 13, color: UI.tx, lineHeight: 1.45, marginBottom: 10 }}>
            {focus.carga?.nombre || "Carga nacional"} · genera el DeCA de este tramo.
          </div>
          {typeof onGenerarDeca === "function" ? (
            <button
              type="button"
              onClick={() => onGenerarDeca(focus.carga)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: UI.green,
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Generar {DECA_SHORT_LABEL}
            </button>
          ) : null}
        </>
      ) : null}

      {focus.kind !== "pending" && options.length > 1 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: UI.su, marginBottom: 6 }}>TRAMO VIGENTE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedKey(opt.key)}
                style={actionBtn(opt.key === selectedKey)}
              >
                {opt.label || DECA_SHORT_LABEL}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {focus.kind !== "pending" && (link || loading) ? (
        <>
          <div style={{ fontWeight: 800, color: UI.green, fontSize: 14 }}>
            {selected?.label || link?.carga_nombre || DECA_SHORT_LABEL}
          </div>
          {link?.origen || link?.destino ? (
            <div style={{ fontSize: 13, color: UI.tx, marginTop: 4 }}>
              {link.origen || "—"} → {link.destino || "—"}
            </div>
          ) : null}
          {loading ? (
            <div style={{ fontSize: 12, color: UI.su, marginTop: 8 }}>Cargando documento…</div>
          ) : (
            <>
              {url ? (
                <div style={{ fontSize: 11, color: UI.su, marginTop: 8, wordBreak: "break-all", lineHeight: 1.4 }}>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                    {url}
                  </a>
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {publicId ? (
                  <button
                    type="button"
                    style={actionBtn()}
                    onClick={() => setQrDeca(deca || { decaPublicId: publicId, datos: { deca_download_url: url } })}
                  >
                    Mostrar QR
                  </button>
                ) : null}
                {deca ? (
                  <button
                    type="button"
                    style={actionBtn()}
                    disabled={busyId === deca.id}
                    onClick={async () => {
                      setBusyId(deca.id);
                      try {
                        await downloadAutonomoDecaPdf(deca);
                        showToast?.("PDF DeCA descargado");
                      } catch (e) {
                        showToast?.(e?.message || "No se pudo descargar");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {busyId === deca.id ? "Descargando…" : "PDF"}
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
            </>
          )}
        </>
      ) : null}

      {qrDeca ? (
        <DcdtQrModal
          dcdt={autonomoDecaAsQrDcdt(qrDeca)}
          decaPublicId={qrDeca.decaPublicId}
          downloadUrl={url}
          onClose={() => setQrDeca(null)}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
