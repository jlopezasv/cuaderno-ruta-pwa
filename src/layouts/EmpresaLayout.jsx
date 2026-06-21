import { useCallback, useEffect, useState } from "react";
import { BrandHeader } from "../ui/BrandHeader";
import { UI_TOKENS } from "../ui/visualTokens";
import { getStoredAuthSession, isHybridSession, switchActiveMode } from "../data/authContext";
import { bootstrapAuthSession } from "../auth/resolveAccountCapabilities.js";
import { bootstrapErrorMessage } from "../auth/officeBootstrap.js";
import { ModeSwitchButton } from "../ui/ModeSwitchButton.jsx";
import { EMPRESA_PAGE_SHELL_CSS } from "../ui/empresaPageShell.js";
import { isDemoApp } from "../config/appEnvironment.js";
import {
  canAccessEmpresaConfigTab,
  getDefaultEmpresaTab,
  getVisibleEmpresaTabs,
} from "../domain/empresa/officeUserFilters.js";
import { EmpresaConfigDashboard } from "../features/empresa/EmpresaConfigDashboard.jsx";
import { EmpresaEstadisticasPanel } from "../features/empresa/EmpresaEstadisticasPanel.jsx";
import { resolveEmpresaRecordForUser } from "../domain/empresa/empresaOfficeContext.js";
import {
  enrichEmpresaRecordFromOffice,
  fetchEmpresaRecordById,
} from "../domain/empresa/empresaRecordCache.js";

export default function EmpresaLayout({
  PROF0,
  getUserId,
  sbSelect,
  sbUpsert,
  sbSignOut,
  EmpresaDashboard,
  EmpresaPanelSeccion,
  ProfView,
  ConfigPassword,
  ConfigDangerZone,
}) {
  const [prof, setProf] = useState(PROF0);
  const [tab, setTab] = useState("servicios");
  const [loaded, setLoaded] = useState(false);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresaRecord, setEmpresaRecord] = useState(null);
  const [capabilities, setCapabilities] = useState(
    () => getStoredAuthSession(getUserId())?.capabilities || null,
  );
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

  // Cargar perfil + revalidar capacidades empresa (sesión en caché puede estar incompleta)
  useEffect(() => {
    const uid = getUserId();
    if (!uid) {
      setLoaded(true);
      return;
    }
    let cancelled = false;

    async function load() {
      let session = getStoredAuthSession(uid);
      if (!session?.capabilities?.empresa) {
        try {
          await bootstrapAuthSession(uid, sbSelect);
          session = getStoredAuthSession(uid);
        } catch (_) {}
        if (!session?.capabilities?.empresa && session?.capabilities?.conductor) {
          switchActiveMode(uid, "conductor");
          window.location.reload();
          return;
        }
      }
      if (cancelled) return;
      if (session?.capabilities) setCapabilities(session.capabilities);

      try {
        const rows = await sbSelect("profiles", `id=eq.${uid}`);
        if (cancelled) return;
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
            canDrive: !!p.can_drive,
          }));
        }
      } catch (_) {}
      if (!cancelled) setLoaded(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const authSession = getStoredAuthSession(getUserId());
  const bootstrapError = capabilities?.bootstrapError || null;
  const visibleTabs = getVisibleEmpresaTabs(capabilities);

  const refreshEmpresaTenant = useCallback(async () => {
    const uid = getUserId();
    if (!uid) {
      setEmpresaId(null);
      return;
    }
    const session = getStoredAuthSession(uid);
    const officeUser = capabilities?.officeUser || session?.capabilities?.officeUser || null;
    if (officeUser?.empresaId) {
      setEmpresaId(officeUser.empresaId);
      return;
    }
    try {
      const emp = await resolveEmpresaRecordForUser(uid, sbSelect, officeUser);
      setEmpresaId(emp?.id || null);
    } catch {
      setEmpresaId(null);
    }
  }, [capabilities?.officeUser, getUserId, sbSelect]);

  useEffect(() => {
    if (!loaded) return;
    void refreshEmpresaTenant();
  }, [loaded, refreshEmpresaTenant]);

  useEffect(() => {
    if (tab === "config") void refreshEmpresaTenant();
  }, [tab, refreshEmpresaTenant]);

  useEffect(() => {
    const handler = (ev) => {
      const id = ev?.detail?.empresaId;
      if (id) setEmpresaId(id);
      else void refreshEmpresaTenant();
    };
    window.addEventListener("empresa-tenant-changed", handler);
    return () => window.removeEventListener("empresa-tenant-changed", handler);
  }, [refreshEmpresaTenant]);

  useEffect(() => {
    if (!empresaId) {
      setEmpresaRecord(null);
      return;
    }
    let cancelled = false;
    fetchEmpresaRecordById(sbSelect, empresaId).then((row) => {
      if (cancelled) return;
      const session = getStoredAuthSession(getUserId());
      setEmpresaRecord(enrichEmpresaRecordFromOffice(row, session?.capabilities?.officeUser));
    });
    return () => {
      cancelled = true;
    };
  }, [empresaId]);

  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(getDefaultEmpresaTab(capabilities));
    }
  }, [tab, visibleTabs, capabilities]);

  function onSave(p) {
    const uid = getUserId();
    if (!uid) return;
    const prevCanDrive = !!prof.canDrive;
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
        can_drive: !!p.canDrive,
        updated_at: new Date().toISOString(),
      },
    ])
      .then(async () => {
        if (!!p.canDrive !== prevCanDrive) {
          await bootstrapAuthSession(uid, sbSelect);
          window.location.reload();
        }
      })
      .catch(() => {});
  }

  const showModeSwitch = isHybridSession(authSession);

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f1f5f9" }}>
        <div style={{ fontSize: 14, color: "#64748B" }}>Cargando...</div>
      </div>
    );
  }

  if (isDemoApp() && bootstrapError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f1f5f9", padding: 24 }}>
        <div style={{ maxWidth: 420, background: "#fff", border: "1px solid #dbe4ee", borderRadius: 16, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Acceso no disponible</div>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 20 }}>
            {bootstrapErrorMessage(bootstrapError)}
          </div>
          <button
            type="button"
            onClick={async () => {
              await sbSignOut();
              window.location.reload();
            }}
            style={{ background: "#b91c1c", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const bg = UI_TOKENS.surfaceApp,
    card = UI_TOKENS.surface,
    tx = UI_TOKENS.ink,
    su = UI_TOKENS.muted,
    border = UI_TOKENS.border,
    accent = UI_TOKENS.brand,
    accentHover = UI_TOKENS.brandSoft,
    tabIdle = "#334155",
    tabActive = UI_TOKENS.brandDeep;
  const canUseConfig = true;

  const tabBtnStyle = (active) => ({
    background: active ? "rgba(245,158,11,.18)" : "transparent",
    border: "none",
    borderBottom: `2px solid ${active ? accent : "transparent"}`,
    borderRadius: active ? "6px 6px 0 0" : 0,
    padding: "7px 11px 5px",
    fontSize: 12,
    fontWeight: active ? 800 : 600,
    color: active ? tabActive : tabIdle,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
    transition: "background .15s ease, color .15s ease, border-color .15s ease",
    whiteSpace: "nowrap",
    boxShadow: active ? "inset 0 -1px 0 rgba(245,158,11,.25)" : "none",
  });

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", color: tx }}>
      {/* ── TOP NAV (desktop) ── */}
      {!isMobile && (
        <div
          style={{
            background: card,
            borderBottom: `1px solid ${border}`,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 1px 2px rgba(15,23,42,.05)",
            boxSizing: "border-box",
            width: "100%",
            overflow: "visible",
          }}
        >
          <div style={{ padding: "6px 0", marginRight: 10, flexShrink: 0 }}>
            <BrandHeader panelLabel="Panel Empresa" nameLabel={prof.nombre || "Empresa"} titleColor={tx} subColor={su} />
          </div>
          <div
            style={{
              display: "flex",
              flex: "1 1 120px",
              gap: 0,
              minWidth: 120,
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
            }}
          >
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
                <span style={{ fontSize: 13, color: tab === t.id ? accent : "#64748b" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
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
            {showModeSwitch && (
              <ModeSwitchButton uid={getUserId()} targetMode="conductor" />
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

      {/* ── MOBILE HEADER + PESTAÑAS (visibles bajo la cabecera) ── */}
      {isMobile && (
        <>
          <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
            <BrandHeader panelLabel="Panel Empresa" compact titleColor={tx} subColor={su} />
            <div style={{ display: "flex", gap: 8 }}>
              {showModeSwitch && (
                <ModeSwitchButton uid={getUserId()} targetMode="conductor" compact />
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
          <div
            style={{
              background: card,
              borderBottom: `1px solid ${border}`,
              display: "flex",
              gap: 0,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              position: "sticky",
              top: 46,
              zIndex: 99,
              boxShadow: "0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            {visibleTabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  style={{
                    flexShrink: 0,
                    background: active ? "rgba(245,158,11,.18)" : "transparent",
                    border: "none",
                    borderBottom: `2px solid ${active ? accent : "transparent"}`,
                    padding: "6px 10px 4px",
                    fontSize: 11,
                    fontWeight: active ? 800 : 600,
                    color: active ? tabActive : tabIdle,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    whiteSpace: "nowrap",
                    boxShadow: active ? "inset 0 -1px 0 rgba(245,158,11,.25)" : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: active ? accent : "#64748b" }}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── CONTENIDO ── */}
      <style>{EMPRESA_PAGE_SHELL_CSS}</style>
      <div style={{ flex: 1, minHeight: 0, paddingBottom: isMobile ? 72 : 0, width: "100%" }}>
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

        {/* ESTADÍSTICAS */}
        {tab === "estadisticas" && (
          <EmpresaEstadisticasPanel
            empresaId={empresaId}
            capabilities={capabilities}
            getUserId={getUserId}
            sbSelect={sbSelect}
            showToast={showToast}
          />
        )}

        {/* CONFIGURACIÓN */}
        {tab === "config" && canUseConfig && canAccessEmpresaConfigTab(capabilities) ? (
          <EmpresaConfigDashboard
            empresaId={empresaId}
            empresaRecord={empresaRecord}
            prof={prof}
            capabilities={capabilities}
            officeUser={capabilities?.officeUser || null}
            sbSelect={sbSelect}
            sbUpsert={sbUpsert}
            getUserId={getUserId}
            onSave={onSave}
            showToast={showToast}
            ConfigPassword={ConfigPassword}
            ConfigDangerZone={ConfigDangerZone}
            tx={tx}
            su={su}
          />
        ) : null}
      </div>

      {/* ── BOTTOM NAV (móvil) ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: card, borderTop: `1px solid ${border}`, display: "flex", zIndex: 100, boxShadow: "0 -1px 2px rgba(15,23,42,.05)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {visibleTabs.map((t) => {
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
                  padding: "5px 2px 4px",
                  fontSize: 9,
                  fontWeight: active ? 700 : 550,
                  color: active ? tabActive : tabIdle,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                  transition: "background .15s ease, color .15s ease",
                }}
              >
                <span style={{ fontSize: 15, color: active ? accent : "#94a3b8" }}>{t.icon}</span>
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
