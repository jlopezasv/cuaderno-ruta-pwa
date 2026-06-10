/**
 * Modelo de cuenta PRODUCT-1 — identidad, shells, capacidades y features UI.
 * Punto único para evitar `tipo_cuenta === "empresa"` repartido por la app.
 * Preparado para RBAC/planes futuros (roles, permisos, suscripciones).
 */
import { isDemoApp, isProductionApp } from "../config/appEnvironment.js";
import { isEmpresaImmediateAccessEnabled } from "../config/productFeatures.js";

/** Tipos de producto contratado (`profiles.tipo_cuenta`). */
export const ACCOUNT_TYPES = Object.freeze({
  CONDUCTOR: "conductor",
  AUTONOMO_PRO: "autonomo_pro",
  EMPRESA: "empresa",
});

/** Valores legacy → tipo estándar. */
const LEGACY_ACCOUNT_TYPE_MAP = Object.freeze({
  autonomo: ACCOUNT_TYPES.AUTONOMO_PRO,
  conductor: ACCOUNT_TYPES.CONDUCTOR,
  autonomo_pro: ACCOUNT_TYPES.AUTONOMO_PRO,
  empresa: ACCOUNT_TYPES.EMPRESA,
});

export const EMPRESA_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

/** Features de producto (gates UI; futuro RBAC puede ampliar). */
export const FEATURE_KEYS = Object.freeze({
  CAN_CREATE_SERVICES: "can_create_services",
  CAN_VIEW_ADVANCED_DOCS: "can_view_advanced_docs",
  CAN_VIEW_OPERATIONAL_LITE: "can_view_operational_lite",
  CAN_VIEW_ENTERPRISE_DOCS: "can_view_enterprise_docs",
  CAN_MANAGE_USERS: "can_manage_users",
  CAN_ASSIGN_DRIVERS: "can_assign_drivers",
  CAN_VIEW_REPORTS: "can_view_reports",
  CAN_VIEW_CLIENTS: "can_view_clients",
});

export function normalizeAccountType(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return LEGACY_ACCOUNT_TYPE_MAP[key] || ACCOUNT_TYPES.CONDUCTOR;
}

/**
 * @param {object|null} profile — fila `profiles`
 * @returns {{ accountType: string, canDrive: boolean, empresaStatus: string|null }}
 */
export function parseProfileAccount(profile) {
  const accountType = normalizeAccountType(profile?.tipo_cuenta);
  let empresaStatus = profile?.empresa_status ?? null;
  if (accountType === ACCOUNT_TYPES.EMPRESA && !empresaStatus) {
    // Demo: columna empresa_status puede no existir en Supabase demo (sin migración PRODUCT-1).
    empresaStatus = isDemoApp() ? EMPRESA_STATUS.APPROVED : EMPRESA_STATUS.PENDING;
  }
  if (accountType !== ACCOUNT_TYPES.EMPRESA) {
    empresaStatus = null;
  }
  return {
    accountType,
    canDrive: !!profile?.can_drive,
    empresaStatus,
  };
}

/**
 * Shells permitidos (no dependen del modo activo en caché).
 * @param {{ accountType: string, canDrive: boolean, empresaStatus: string|null }} account
 * @param {{ hasFleetLink?: boolean, isDemo?: boolean, isProduction?: boolean }} ctx
 */
export function deriveShellCapabilities(account, ctx = {}) {
  const isDemo = ctx.isDemo ?? isDemoApp();
  const isProduction = ctx.isProduction ?? isProductionApp();
  const hasFleetLink = !!ctx.hasFleetLink;

  const conductor =
    account.accountType === ACCOUNT_TYPES.CONDUCTOR ||
    account.accountType === ACCOUNT_TYPES.AUTONOMO_PRO ||
    (account.accountType === ACCOUNT_TYPES.EMPRESA && account.canDrive) ||
    hasFleetLink;

  let empresa = account.accountType === ACCOUNT_TYPES.EMPRESA;
  if (empresa && isProduction && !isDemo && !isEmpresaImmediateAccessEnabled()) {
    empresa = account.empresaStatus === EMPRESA_STATUS.APPROVED;
  }

  return { conductor, empresa };
}

/**
 * Flags de UI / permisos de producto según tipo y shell activo.
 * @param {{ accountType: string, canDrive: boolean, empresaStatus: string|null }} account
 * @param {"conductor"|"empresa"} activeMode
 */
export function deriveFeatureFlags(account, activeMode = "conductor", ctx = {}) {
  const inEmpresaShell = activeMode === "empresa";
  const isAutonomoPro = account.accountType === ACCOUNT_TYPES.AUTONOMO_PRO;
  const isEmpresaAccount = account.accountType === ACCOUNT_TYPES.EMPRESA;
  const isDemo = ctx.isDemo ?? isDemoApp();
  const officeUser = ctx.officeUser || null;
  const canManageOfficeUsers =
    inEmpresaShell &&
    (isEmpresaAccount ||
      (officeUser?.rol === "jefe_flota" && officeUser?.activo !== false));
  const inEmpresaShellAccess =
    inEmpresaShell && (isEmpresaAccount || !!officeUser?.activo);

  return {
    [FEATURE_KEYS.CAN_CREATE_SERVICES]: !inEmpresaShell && isAutonomoPro,
    [FEATURE_KEYS.CAN_VIEW_ADVANCED_DOCS]: !inEmpresaShell && isAutonomoPro,
    [FEATURE_KEYS.CAN_VIEW_OPERATIONAL_LITE]: !inEmpresaShell && isAutonomoPro,
    [FEATURE_KEYS.CAN_VIEW_ENTERPRISE_DOCS]: inEmpresaShellAccess,
    [FEATURE_KEYS.CAN_MANAGE_USERS]: canManageOfficeUsers,
    [FEATURE_KEYS.CAN_ASSIGN_DRIVERS]:
      inEmpresaShellAccess && officeUser?.rol !== "administrativo",
    [FEATURE_KEYS.CAN_VIEW_REPORTS]: inEmpresaShellAccess,
    [FEATURE_KEYS.CAN_VIEW_CLIENTS]: inEmpresaShellAccess,
  };
}

export function buildSessionCapabilities({
  account,
  shells,
  admin,
  activeMode,
  features,
  officeUser,
  bootstrapError,
}) {
  return {
    conductor: !!shells.conductor,
    empresa: !!shells.empresa,
    admin: !!admin,
    accountType: account.accountType,
    empresaStatus: account.empresaStatus,
    officeUser: officeUser || null,
    bootstrapError: bootstrapError || null,
    features: features || deriveFeatureFlags(account, activeMode, { officeUser }),
  };
}

export function hasFeature(capabilities, key) {
  return !!capabilities?.features?.[key];
}

export function isHybridCapabilities(capabilities) {
  return !!capabilities?.empresa && !!capabilities?.conductor;
}

/** Empresa registrada pendiente sin ningún shell usable. */
export function isEmpresaPendingBlocked(account, shells) {
  return (
    account.accountType === ACCOUNT_TYPES.EMPRESA &&
    account.empresaStatus === EMPRESA_STATUS.PENDING &&
    !shells.conductor &&
    !shells.empresa
  );
}

/** Valida y normaliza móvil en alta (mín. 9 dígitos). */
export function normalizeRegistrationPhone(raw) {
  const trimmed = String(raw || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9) {
    return { ok: false, value: "", error: "Introduce un teléfono móvil válido (mín. 9 dígitos)" };
  }
  return { ok: true, value: trimmed, error: null };
}

export function registrationProfilePayload(tipoCuenta) {
  const tipo = normalizeAccountType(tipoCuenta);
  // Demo: solo columnas base — can_drive / empresa_status pueden no existir en el proyecto Supabase demo.
  if (isDemoApp()) {
    return { tipo_cuenta: tipo };
  }
  const body = {
    tipo_cuenta: tipo,
    can_drive: false,
  };
  if (tipo === ACCOUNT_TYPES.EMPRESA) {
    body.empresa_status = EMPRESA_STATUS.PENDING;
  }
  return body;
}

export function contextKindFromAccountType(accountType) {
  return normalizeAccountType(accountType) === ACCOUNT_TYPES.EMPRESA ? "empresa" : "conductor";
}
