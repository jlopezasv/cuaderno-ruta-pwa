import React from "react";

export const EMPRESA_DASH_VIEW = Object.freeze({
  OPERATIVA: "operativa",
  /** CRM clientes de la empresa (antes «agenda»). */
  CLIENTES: "clientes",
  /** @deprecated alias — migración sessionStorage */
  AGENDA: "agenda",
});

const STORAGE_KEY = "empresa_dashboard_view_v1";

const TABS = [
  { id: EMPRESA_DASH_VIEW.OPERATIVA, label: "Operativa" },
  { id: EMPRESA_DASH_VIEW.CLIENTES, label: "Clientes" },
];

/** CRM clientes por empresa — no confundir con agenda comercial super_admin. */
export function canViewEmpresaDashboardClientes() {
  return true;
}

/** @deprecated usar canViewEmpresaDashboardClientes */
export function canViewEmpresaDashboardAgenda() {
  return canViewEmpresaDashboardClientes();
}

export function readStoredEmpresaDashView() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === EMPRESA_DASH_VIEW.CLIENTES || v === EMPRESA_DASH_VIEW.OPERATIVA) return v;
    if (v === EMPRESA_DASH_VIEW.AGENDA) return EMPRESA_DASH_VIEW.CLIENTES;
  } catch (_) {}
  return EMPRESA_DASH_VIEW.OPERATIVA;
}

export function writeStoredEmpresaDashView(view) {
  try {
    sessionStorage.setItem(STORAGE_KEY, view);
  } catch (_) {}
}

/**
 * Subpestañas del dashboard empresa: Operativa | Clientes (CRM).
 */
export function EmpresaDashboardSubnav({ view, onChange, ui }) {
  if (!canViewEmpresaDashboardClientes()) return null;

  const accent = ui?.accent || "#2563eb";
  const accentSoft = ui?.accentSoft || "#eff6ff";
  const border = ui?.border || "#dbe4ee";
  const muted = ui?.muted || "#64748b";

  return (
    <div
      role="tablist"
      aria-label="Vista del dashboard"
      style={{
        padding: "8px 16px 12px",
        maxWidth: 960,
        margin: "0 auto",
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "linear-gradient(180deg, #f1f5f9 85%, rgba(241,245,249,0))",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          background: ui?.surface || "#fff",
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: 6,
          boxShadow: "0 1px 2px rgba(15,23,42,.06)",
        }}
      >
        {TABS.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              style={{
                flex: "1 1 140px",
                minWidth: 120,
                background: active ? accentSoft : "transparent",
                border: `1px solid ${active ? accent : "transparent"}`,
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                color: active ? accent : muted,
                cursor: "pointer",
                transition: "background .15s ease, color .15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
