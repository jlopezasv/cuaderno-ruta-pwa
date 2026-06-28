import React, { useState } from "react";
import { DcdtQrModal } from "../../features/dcdt/DcdtQrModal.jsx";
import { autonomoDecaAsQrDcdt } from "../../domain/dcdt/decaAutonomoPdf.js";
import { LITE_THEME, STOP_ICON, stopAccent } from "./operationalLiteTheme.js";
import { groupAnnexByParada } from "./collectLiteAnnexItems.js";

const CAT_BADGE = {
  cmr: { label: "CMR", bg: "#eff6ff", fg: "#1d4ed8" },
  foto: { label: "Foto", bg: "#f0fdf4", fg: "#15803d" },
  pod: { label: "POD", bg: "#fdf4ff", fg: "#7e22ce" },
  incidencia: { label: "Incidencia", bg: "#fff7ed", fg: "#c2410c" },
  documento: { label: "Doc", bg: "#f8fafc", fg: "#475569" },
};

export function LiteHeader({ doc, compact }) {
  const completado = doc.resumen?.operacionCompletada;
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${LITE_THEME.navy} 0%, ${LITE_THEME.blue} 100%)`,
        padding: compact ? "16px 16px 14px" : "20px 18px 18px",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {completado ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(22,163,74,.95)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            padding: "5px 10px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,.2)",
          }}
        >
          COMPLETADO
        </div>
      ) : null}
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, opacity: 0.88 }}>EXPEDIENTE OPERACIONAL</div>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight: 800, marginTop: 8, lineHeight: 1.15, paddingRight: completado ? 88 : 0 }}>
        {doc.header.referencia}
      </div>
      <div style={{ fontSize: 14, marginTop: 8, opacity: 0.94, lineHeight: 1.35 }}>{doc.header.ruta}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <LitePill>{doc.header.estado}</LitePill>
        {doc.header.fechaOperacion ? <LitePill>{doc.header.fechaOperacion}</LitePill> : null}
        {doc.header.cliente ? <LitePill>{doc.header.cliente}</LitePill> : null}
      </div>
    </div>
  );
}

function LitePill({ children }) {
  return (
    <span style={{ background: "rgba(255,255,255,.16)", padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}

export function LiteMetaGrid({ doc }) {
  const rows = [
    ["Conductor", doc.header.conductor],
    doc.header.vehiculo ? ["Vehículo", doc.header.vehiculo] : null,
    doc.header.referenciaCliente ? ["Ref. cliente", doc.header.referenciaCliente] : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
        marginBottom: 20,
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k} style={{ background: "#f8fafc", border: `1px solid ${LITE_THEME.line}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: LITE_THEME.su, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: LITE_THEME.tx, marginTop: 4 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export function LiteTimeline({ paradas }) {
  return (
    <div style={{ position: "relative", marginBottom: 22, paddingLeft: 22 }}>
      <div
        style={{
          position: "absolute",
          left: 7,
          top: 8,
          bottom: 8,
          width: 2,
          background: `linear-gradient(180deg, ${LITE_THEME.carga}, ${LITE_THEME.descarga})`,
          borderRadius: 2,
          opacity: 0.35,
        }}
      />
      {paradas.map((p, idx) => {
        const accent = stopAccent(p.tipo);
        const icon = p.icon || STOP_ICON[p.tipo] || STOP_ICON.otro;
        return (
          <div key={p.id} style={{ position: "relative", marginBottom: idx < paradas.length - 1 ? 14 : 0 }}>
            <div
              style={{
                position: "absolute",
                left: -22,
                top: 14,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: accent.color,
                border: "3px solid #fff",
                boxShadow: "0 0 0 2px " + accent.color + "55",
              }}
            />
            <div
              style={{
                border: `1px solid ${LITE_THEME.line}`,
                borderRadius: 14,
                padding: "14px 14px 12px",
                background: accent.bg,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: accent.color, letterSpacing: 0.3 }}>{p.tipoLabel}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: LITE_THEME.tx, marginTop: 6, lineHeight: 1.25 }}>{p.ubicacion}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "4px 8px",
                    borderRadius: 8,
                    background: p.estado === "completado" ? LITE_THEME.okBg : "#f1f5f9",
                    color: p.estado === "completado" ? LITE_THEME.ok : LITE_THEME.su,
                    flexShrink: 0,
                  }}
                >
                  {p.estadoLabel}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 12,
                  fontSize: 13,
                }}
              >
                <TimeCell label="Entrada muelle" value={p.entradaMuelleHora || p.llegadaHora} />
                <TimeCell label="Salida muelle" value={p.salidaMuelleHora || p.salidaHora} />
              </div>

              {p.tiempoEnMuelleLabel ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    background: "#fff",
                    borderRadius: 8,
                    padding: "8px 10px",
                    border: `1px solid ${LITE_THEME.line}`,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span style={{ fontWeight: 700, color: LITE_THEME.su }}>Tiempo en muelle</span>
                  <span style={{ fontWeight: 800, color: LITE_THEME.tx }}>{p.tiempoEnMuelleLabel}</span>
                </div>
              ) : null}

              {p.muelle ? (
                <div style={{ fontSize: 12, marginTop: 10, color: LITE_THEME.su }}>
                  Muelle <strong style={{ color: LITE_THEME.tx }}>{p.muelle}</strong>
                </div>
              ) : null}

              {p.observaciones ? (
                <div style={{ fontSize: 12, marginTop: 10, color: LITE_THEME.tx, lineHeight: 1.45, background: "#fff", borderRadius: 8, padding: "8px 10px" }}>
                  {p.observaciones}
                </div>
              ) : null}

              {p.incidencias?.length ? (
                <div style={{ marginTop: 10 }}>
                  {p.incidencias.map((inc) => (
                    <div
                      key={inc.id}
                      style={{
                        fontSize: 12,
                        color: LITE_THEME.warn,
                        background: LITE_THEME.warnBg,
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginBottom: 6,
                      }}
                    >
                      ⚠ {inc.titulo}
                      {inc.descripcion ? ` — ${inc.descripcion}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}

              {p.docCount > 0 ? (
                <div style={{ fontSize: 11, fontWeight: 700, color: LITE_THEME.su, marginTop: 10 }}>
                  📎 {p.docCount} documento{p.docCount !== 1 ? "s" : ""}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeCell({ label, value }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", border: `1px solid ${LITE_THEME.line}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: LITE_THEME.su }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: LITE_THEME.tx, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function LiteEvidenciasGallery({ doc, onPreview }) {
  const groups = groupAnnexByParada(doc.evidenciasAnnexo || []);
  if (!groups.length) {
    return (
      <div style={{ fontSize: 13, color: LITE_THEME.su, padding: "12px 0 20px", textAlign: "center" }}>
        Sin evidencias visuales adjuntas
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {groups.map((group) => (
        <div key={group.key} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: LITE_THEME.blue, marginBottom: 10 }}>{group.label}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 148px), 1fr))",
              gap: 10,
            }}
          >
            {group.items.map((item) => (
              <EvidenciaCard key={item.id} item={item} onPreview={onPreview} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenciaCard({ item, onPreview }) {
  const badge = CAT_BADGE[item.categoria] || CAT_BADGE.documento;
  const clickable = !!item.url;
  return (
    <button
      type="button"
      onClick={() => clickable && onPreview?.(item)}
      style={{
        border: `1px solid ${LITE_THEME.line}`,
        borderRadius: 12,
        overflow: "hidden",
        padding: 0,
        background: "#fff",
        cursor: clickable ? "pointer" : "default",
        textAlign: "left",
        boxShadow: "0 2px 8px rgba(15,23,42,.06)",
      }}
    >
      <div style={{ aspectRatio: "4/3", background: "#f1f5f9", position: "relative" }}>
        {item.url ? (
          <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: LITE_THEME.su, fontSize: 24 }}>
            📄
          </div>
        )}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            fontSize: 9,
            fontWeight: 800,
            padding: "3px 7px",
            borderRadius: 6,
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {badge.label}
        </span>
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: LITE_THEME.tx, lineHeight: 1.3 }}>{item.titulo}</div>
        <div style={{ fontSize: 10, color: LITE_THEME.su, marginTop: 4 }}>{item.hora}</div>
      </div>
    </button>
  );
}

export function LiteDecasAutonomo({ decas = [], showToast }) {
  const [qrRow, setQrRow] = useState(null);
  if (!decas?.length) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: LITE_THEME.su, letterSpacing: 0.7, marginBottom: 12, textTransform: "uppercase" }}>
        Documentos DeCA
      </div>
      {decas.map((row) => (
        <div
          key={row.cargaStopId || row.publicId || row.label}
          style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 800, color: "#166534", fontSize: 14 }}>{row.cargaNombre || row.label}</div>
          <div style={{ fontSize: 13, color: LITE_THEME.tx, marginTop: 4 }}>
            {row.origen} → {row.destino}
          </div>
          {row.downloadUrl ? (
            <div style={{ fontSize: 11, color: LITE_THEME.su, marginTop: 8, wordBreak: "break-all" }}>
              <a href={row.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: LITE_THEME.blue }}>
                {row.downloadUrl}
              </a>
            </div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {row.publicId ? (
              <button
                type="button"
                onClick={() => setQrRow(row)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${LITE_THEME.line}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Mostrar QR
              </button>
            ) : null}
            {row.downloadUrl ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(row.downloadUrl);
                    showToast?.("Enlace copiado");
                  } catch {
                    showToast?.(row.downloadUrl);
                  }
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${LITE_THEME.line}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Copiar enlace
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {qrRow ? (
        <DcdtQrModal
          dcdt={qrRow.deca ? autonomoDecaAsQrDcdt(qrRow.deca) : undefined}
          decaPublicId={qrRow.publicId}
          downloadUrl={qrRow.downloadUrl}
          onClose={() => setQrRow(null)}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}

export function LiteResumenEjecutivo({ resumen }) {
  const chips = [
    ["Cargas", resumen.cargas],
    ["Descargas", resumen.descargas],
    ["Incidencias", resumen.incidencias],
    ["Fotos", resumen.fotos],
    ["CMR", resumen.cmr],
    ["POD", resumen.pod],
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        marginBottom: 18,
      }}
    >
      {chips.map(([label, value]) => (
        <div
          key={label}
          style={{
            background: "#f8fafc",
            border: `1px solid ${LITE_THEME.line}`,
            borderRadius: 12,
            padding: "12px 8px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, color: LITE_THEME.tx }}>{value ?? 0}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: LITE_THEME.su, marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

export function LiteCierrePremium({ cierre, firmasEntregaDescarga = [], resumen }) {
  const firmas = Array.isArray(firmasEntregaDescarga) ? firmasEntregaDescarga : [];
  if (!cierre && !firmas.length && !resumen?.operacionCompletada) return null;
  return (
    <div
      style={{
        border: `2px solid ${LITE_THEME.ok}`,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 18,
        background: LITE_THEME.okBg,
      }}
    >
      <div style={{ background: LITE_THEME.ok, color: "#fff", padding: "10px 14px", fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>
        CIERRE OPERACIONAL
      </div>
      <div style={{ padding: "14px 16px" }}>
        {resumen?.operacionCompletada ? (
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 800,
              color: LITE_THEME.ok,
              border: `2px solid ${LITE_THEME.ok}`,
              borderRadius: 8,
              padding: "6px 12px",
              marginBottom: 12,
              letterSpacing: 1,
            }}
          >
            SELLO · COMPLETADO
          </div>
        ) : null}
        {cierre ? (
          <>
            <div style={{ fontSize: 12, color: LITE_THEME.su }}>Finalizado {cierre.closedAtLabel}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: LITE_THEME.tx, marginTop: 6 }}>{cierre.conductorNombre}</div>
            {cierre.comentario ? (
              <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5, color: LITE_THEME.tx }}>{cierre.comentario}</div>
            ) : null}
            {cierre.firmaUrl ? (
              <img
                src={cierre.firmaUrl}
                alt="Firma"
                style={{ maxWidth: "100%", maxHeight: 96, marginTop: 14, objectFit: "contain", background: "#fff", borderRadius: 8, padding: 8 }}
              />
            ) : null}
          </>
        ) : firmas.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {firmas.map((firma) => (
              <div
                key={firma.stop_id || firma.stop_label}
                style={{
                  background: "#fff",
                  border: `1px solid ${LITE_THEME.line}`,
                  borderRadius: 10,
                  padding: "12px 12px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: LITE_THEME.tx }}>
                  {firma.stop_label || "Descarga"} · {firma.stop_nombre || "—"}
                </div>
                <div style={{ fontSize: 12, color: LITE_THEME.su, marginTop: 4 }}>
                  {firma.signed_at_label || "—"} · {firma.conductor_nombre || "Conductor"}
                </div>
                {firma.comentario ? (
                  <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, color: LITE_THEME.tx }}>{firma.comentario}</div>
                ) : null}
                {firma.firma_url ? (
                  <img
                    src={firma.firma_url}
                    alt={`Firma ${firma.stop_label || "descarga"}`}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 96,
                      marginTop: 10,
                      objectFit: "contain",
                      background: "#fff",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: LITE_THEME.su }}>Operación completada — pendiente de firma de cierre</div>
        )}
      </div>
    </div>
  );
}

export function LitePreviewModal({ preview, onClose }) {
  if (!preview) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600,
        background: "rgba(15,23,42,.92)",
        display: "flex",
        flexDirection: "column",
        padding: "max(12px, env(safe-area-inset-top)) 12px max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, paddingRight: 12 }}>{preview.titulo}</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: "none",
            background: "rgba(255,255,255,.12)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
      <div
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {preview.url ? (
          <img src={preview.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
        ) : null}
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, textAlign: "center" }}>{preview.hora}</div>
    </div>
  );
}
