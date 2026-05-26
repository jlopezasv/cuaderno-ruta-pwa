import { useEffect, useState } from "react";
import { EMPRESA_TABS } from "../navigation/empresaTabs";
import { BrandHeader } from "../ui/BrandHeader";
import { UI_TOKENS } from "../ui/visualTokens";

export default function EmpresaLayout({
  PROF0,
  getUserId,
  sbSelect,
  sbUpsert,
  sbSignOut,
  EmpresaDashboard,
  EmpresaPanelSeccion,
  ProfView,
}) {
  const [prof, setProf] = useState(PROF0);
  const [tab, setTab] = useState("servicios");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 3000);
  };

  // Cargar perfil
  useEffect(() => {
    const uid = getUserId();
    if (!uid) {
      setLoaded(true);
      return;
    }
    sbSelect("profiles", `id=eq.${uid}`)
      .then(async (rows) => {
        if (rows.length) {
          const p = rows[0];
          if (p.is_archived) {
            showToast("Esta cuenta está archivada. Contacta con administración.");
            await sbSignOut();
            window.location.reload();
            return;
          }
          setProf((prev) => ({
            ...prev,
            nombre: p.nombre || "",
            cif: p.cif || "",
            direccion: p.direccion || "",
            telefono: p.telefono || "",
            emailEmpresa: p.email_empresa || "",
            cp: p.cp || "",
            ciudad: p.ciudad || "",
            tipo_cuenta: p.tipo_cuenta || "empresa",
            lang: p.lang || "es",
          }));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const visibleTabs = EMPRESA_TABS;

  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some((t) => t.id === tab)) setTab(visibleTabs[0].id);
  }, [tab, visibleTabs]);

  function onSave(p) {
    const uid = getUserId();
    if (!uid) return;
    setProf(p);
    sbUpsert("profiles", [
      {
        id: uid,
        nombre: p.nombre || null,
        cif: p.cif || null,
        direccion: p.direccion || null,
        telefono: p.telefono || null,
        email_empresa: p.emailEmpresa || null,
        cp: p.cp || null,
        ciudad: p.ciudad || null,
        updated_at: new Date().toISOString(),
      },
    ]).catch(() => {});
  }

  if (!loaded)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f1f5f9" }}>
        <div style={{ fontSize: 14, color: "#64748B" }}>Cargando...</div>
      </div>
    );

  const bg = UI_TOKENS.surfaceApp,
    card = UI_TOKENS.surface,
    tx = UI_TOKENS.ink,
    su = UI_TOKENS.muted,
    border = UI_TOKENS.border,
    accent = UI_TOKENS.brand,
    accentHover = UI_TOKENS.brandSoft,
    tabIdle = "#475569",
    tabActive = UI_TOKENS.brandDeep;
  const canUseConfig = true;

  const tabBtnStyle = (active) => ({
    background: active ? accentHover : "transparent",
    border: "none",
    borderBottom: `2px solid ${active ? accent : "transparent"}`,
    borderRadius: active ? "8px 8px 0 0" : 0,
    padding: "14px 18px 12px",
    fontSize: 13,
    fontWeight: active ? 700 : 550,
    color: active ? tabActive : tabIdle,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "background .15s ease, color .15s ease, border-color .15s ease",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", color: tx }}>
      {/* ── TOP NAV (desktop) ── */}
      {!isMobile && (
        <div
          style={{
            background: card,
            borderBottom: `1px solid ${border}`,
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 1px 2px rgba(15,23,42,.05)",
          }}
        >
          <div style={{ padding: "12px 0", marginRight: 32, flexShrink: 0 }}>
            <BrandHeader panelLabel="Panel Empresa" nameLabel={prof.nombre || "Empresa"} titleColor={tx} subColor={su} />
          </div>
          <div style={{ display: "flex", flex: 1, gap: 0 }}>
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={tabBtnStyle(tab === t.id)}
                onMouseEnter={(e) => {
                  if (tab !== t.id) e.currentTarget.style.background = UI_TOKENS.surfaceSoft;
                }}
                onMouseLeave={(e) => {
                  if (tab !== t.id) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 14, color: tab === t.id ? accent : "#94a3b8" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: tx }}>{prof.nombre || "Empresa"}</div>
              <div style={{ fontSize: 11, color: su }}>{prof.ciudad || "Panel empresa"}</div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#f8fafc",
                border: `1px solid ${border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#334155",
              }}
            >
              {String(prof.nombre || "E").charAt(0).toUpperCase()}
            </div>
            {canUseConfig && (
              <button onClick={() => setTab("config")} style={{ background: UI_TOKENS.surfaceSoft, border: `1px solid ${border}`, borderRadius: 10, padding: "6px 10px", fontSize: 12, fontWeight: 650, color: "#475569", cursor: "pointer" }}>
                Ajustes
              </button>
            )}
            <button
              onClick={async () => {
                await sbSignOut();
                window.location.reload();
              }}
              style={{ background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.22)", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#B91C1C", cursor: "pointer" }}
            >
              Salir
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE HEADER ── */}
      {isMobile && (
        <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
          <BrandHeader panelLabel="Panel Empresa" compact titleColor={tx} subColor={su} />
          <div style={{ display: "flex", gap: 8 }}>
            {canUseConfig && (
              <button onClick={() => setTab("config")} style={{ background: UI_TOKENS.surfaceSoft, border: `1px solid ${border}`, borderRadius: 10, padding: "5px 8px", fontSize: 12, fontWeight: 650, color: "#475569", cursor: "pointer" }}>
                Ajustes
              </button>
            )}
            <button
              onClick={async () => {
                await sbSignOut();
                window.location.reload();
              }}
              style={{ background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.22)", borderRadius: 10, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#B91C1C", cursor: "pointer" }}
            >
              Salir
            </button>
          </div>
        </div>
      )}

      {/* ── CONTENIDO ── */}
      <div style={{ flex: 1, minHeight: 0, paddingBottom: isMobile ? 64 : 0 }}>
        {/* DASHBOARD */}
        {tab === "dashboard" && <EmpresaDashboard prof={prof} showToast={showToast} onTabChange={setTab} />}

        {/* SERVICIOS */}
        {tab === "servicios" && <EmpresaPanelSeccion seccion="servicios" prof={prof} showToast={showToast} />}

        {/* CONDUCTORES */}
        {tab === "conductores" && <EmpresaPanelSeccion seccion="conductores" prof={prof} showToast={showToast} />}

        {/* DOCUMENTOS */}
        {tab === "documentos" && <EmpresaPanelSeccion seccion="documentos" prof={prof} showToast={showToast} />}

        {/* PLANIFICADOR */}
        {tab === "planificador" && <EmpresaPanelSeccion seccion="planificador" prof={prof} showToast={showToast} />}

        {/* CONFIGURACIÓN */}
        {tab === "config" && canUseConfig && (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 80px" }}>
            <div style={{ fontSize: 18, fontWeight: 650, color: tx, marginBottom: 4 }}>Configuración</div>
            <div style={{ fontSize: 13, color: su, marginBottom: 20 }}>Datos de tu empresa</div>
            <ProfView prof={prof} onSave={onSave} norma={{ alerts: [] }} db={{ entries: [] }} showToast={showToast} />
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV (móvil) ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: card, borderTop: `1px solid ${border}`, display: "flex", zIndex: 100, boxShadow: "0 -1px 2px rgba(15,23,42,.05)" }}>
          {visibleTabs.filter((t) => t.id !== "config").map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  background: active ? accentHover : "transparent",
                  border: "none",
                  borderTop: `2px solid ${active ? accent : "transparent"}`,
                  padding: "8px 4px 6px",
                  fontSize: 10,
                  fontWeight: active ? 700 : 550,
                  color: active ? tabActive : tabIdle,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  transition: "background .15s ease, color .15s ease",
                }}
              >
                <span style={{ fontSize: 17, color: active ? accent : "#94a3b8" }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: isMobile ? 72 : 24, left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "white", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 650, zIndex: 500, boxShadow: "0 10px 24px rgba(15,23,42,.18)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
