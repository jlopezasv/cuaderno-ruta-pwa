/** Contextos de agenda: CRM empresa vs agenda personal super_admin. */

export const AGENDA_CONTEXT = Object.freeze({
  /** Tablas agenda_comercial_* — datos por tenant_empresa_id (empresa transporte). */
  EMPRESA_CRM: "empresa_crm",
  /** Tablas admin_agenda_comercial_* — solo super_admin, sin empresa cliente. */
  ADMIN: "admin",
});

export const AGENDA_UI_COPY = Object.freeze({
  [AGENDA_CONTEXT.EMPRESA_CRM]: {
    title: "Clientes",
    subtitle: "Contactos y seguimiento de clientes de la empresa",
    newEntityButton: "+ Nuevo cliente",
    entityLabel: "cliente",
    sqlMigration: "20260701120000_agenda_comercial.sql",
    prospectoNombreLabel: "Nombre del cliente",
    emptyLoading: "Cargando datos de empresa…",
  },
  [AGENDA_CONTEXT.ADMIN]: {
    title: "Agenda Comercial Axis & Keel",
    subtitle: "Seguimiento comercial interno",
    newEntityButton: "+ Nueva oportunidad",
    entityLabel: "oportunidad",
    sqlMigration: "20260706120000_admin_agenda_comercial.sql",
    prospectoNombreLabel: "Empresa prospecto",
    emptyLoading: null,
  },
});

export function getAgendaContextConfig(contextKey) {
  if (contextKey === AGENDA_CONTEXT.ADMIN) {
    return {
      prospectosTable: "admin_agenda_comercial_prospectos",
      contactosTable: "admin_agenda_comercial_contactos",
      accionesTable: "admin_agenda_comercial_acciones",
      usesTenant: false,
      tenantField: null,
    };
  }
  return {
    prospectosTable: "agenda_comercial_prospectos",
    contactosTable: "agenda_comercial_contactos",
    accionesTable: "agenda_comercial_acciones",
    usesTenant: true,
    tenantField: "tenant_empresa_id",
  };
}
