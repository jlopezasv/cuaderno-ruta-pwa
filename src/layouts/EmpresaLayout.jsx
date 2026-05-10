import { useEffect, useState } from "react";
import { EMPRESA_TABS } from "../navigation/empresaTabs";

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
  const [tab, setTab] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("dark") === "1");
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0F172A" }}>
        <div style={{ fontSize: 14, color: "#64748B" }}>⏳ Cargando...</div>
      </div>
    );

  const bg = "#0F172A",
    card = "#1E293B",
    tx = "#F1F5F9",
    su = "#64748B";

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column" }}>
      {/* ── TOP NAV (desktop) ── */}
      {!isMobile && (
        <div
          style={{
            background: card,
            borderBottom: "1px solid #334155",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 2px 8px rgba(0,0,0,.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", marginRight: 32, flexShrink: 0 }}>
            <span style={{ fontSize: 22 }}>🚛</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B", lineHeight: 1 }}>CUADERNO DE RUTA</div>
              <div style={{ fontSize: 10, color: su, marginTop: 1 }}>Panel de empresa</div>
            </div>
          </div>
          <div style={{ display: "flex", flex: 1, gap: 0 }}>
            {EMPRESA_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: `3px solid ${tab === t.id ? "#F59E0B" : "transparent"}`,
                  padding: "16px 18px 13px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: tab === t.id ? "#F59E0B" : su,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all .15s",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 15 }}>{t.icon}</span>
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
                background: "#F59E0B20",
                border: "2px solid #F59E0B40",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              🏢
            </div>
            <button onClick={() => setTab("config")} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: su, cursor: "pointer" }}>
              ⚙️
            </button>
            <button
              onClick={async () => {
                await sbSignOut();
                window.location.reload();
              }}
              style={{ background: "#EF444420", border: "1px solid #EF444440", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#EF4444", cursor: "pointer" }}
            >
              Salir
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE HEADER ── */}
      {isMobile && (
        <div style={{ background: card, borderBottom: "1px solid #334155", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🚛</span>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B" }}>CUADERNO DE RUTA</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setTab("config")} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 8, padding: "5px 8px", fontSize: 12, color: su, cursor: "pointer" }}>
              ⚙️
            </button>
            <button
              onClick={async () => {
                await sbSignOut();
                window.location.reload();
              }}
              style={{ background: "#EF444420", border: "1px solid #EF444440", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#EF4444", cursor: "pointer" }}
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

        {/* CONFIGURACIÓN */}
        {tab === "config" && (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 80px" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: tx, marginBottom: 4 }}>⚙️ Configuración</div>
            <div style={{ fontSize: 13, color: su, marginBottom: 20 }}>Datos de tu empresa</div>
            <ProfView prof={prof} onSave={onSave} norma={{ alerts: [] }} db={{ entries: [] }} showToast={showToast} />
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV (móvil) ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: card, borderTop: "1px solid #334155", display: "flex", zIndex: 100 }}>
          {EMPRESA_TABS.filter((t) => t.id !== "config").map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderTop: `3px solid ${tab === t.id ? "#F59E0B" : "transparent"}`,
                padding: "8px 4px 6px",
                fontSize: 10,
                fontWeight: 700,
                color: tab === t.id ? "#F59E0B" : su,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: isMobile ? 72 : 24, left: "50%", transform: "translateX(-50%)", background: "#1E293B", color: "white", padding: "12px 20px", borderRadius: 11, fontSize: 14, fontWeight: 700, zIndex: 500, boxShadow: "0 4px 20px rgba(0,0,0,.4)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
