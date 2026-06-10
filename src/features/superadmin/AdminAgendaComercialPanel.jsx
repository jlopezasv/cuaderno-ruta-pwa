import React from "react";
import { AGENDA_CONTEXT } from "../../domain/empresa/agendaComercialContext.js";
import { EmpresaAgendaComercialPanel } from "../empresa/EmpresaAgendaComercialPanel.jsx";

/** Agenda comercial personal Axis & Keel — solo panel propietario / super_admin. */
export function AdminAgendaComercialPanel({ showToast }) {
  return <EmpresaAgendaComercialPanel contextKey={AGENDA_CONTEXT.ADMIN} showToast={showToast} />;
}
