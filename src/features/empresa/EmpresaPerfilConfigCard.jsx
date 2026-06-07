import { useEffect, useState } from "react";
import { invalidateEmpresaRecordCache } from "../../domain/empresa/empresaRecordCache.js";
import { canEditEmpresaConfigPerfil } from "../../domain/empresa/officeUserFilters.js";
import { ConfigCard, CONFIG_UI, configBtnPrimary, configFieldStyle } from "./empresaConfigCards.jsx";

const FIELDS = [
  { key: "nombre", label: "Nombre", ph: "Transportes García S.L.", full: true },
  { key: "cif", label: "CIF / NIF", ph: "B12345678" },
  { key: "telefono", label: "Teléfono", ph: "+34 950 123 456" },
  { key: "emailEmpresa", label: "Email", ph: "info@transportes.com" },
  { key: "direccion", label: "Dirección", ph: "Calle Industria 12", full: true },
  { key: "cp", label: "Código postal", ph: "04001" },
  { key: "ciudad", label: "Ciudad", ph: "Almería" },
];

function emptyForm() {
  return {
    nombre: "",
    cif: "",
    telefono: "",
    emailEmpresa: "",
    direccion: "",
    cp: "",
    ciudad: "",
  };
}

/**
 * Tarjeta perfil de empresa — DEMO Configuración.
 * Owner edita y guarda; usuarios oficina ven datos en solo lectura.
 */
export function EmpresaPerfilConfigCard({
  empresaId,
  empresaRecord,
  prof,
  capabilities,
  officeUser,
  sbSelect,
  sbUpsert,
  onSave,
  showToast,
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const canEdit = canEditEmpresaConfigPerfil(capabilities);
  const hasEmpresa = !!(empresaId || empresaRecord?.id);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const base = emptyForm();
      if (empresaRecord?.nombre) base.nombre = empresaRecord.nombre;
      if (empresaRecord?.cif) base.cif = empresaRecord.cif;

      if (canEdit) {
        base.nombre = prof?.nombre || base.nombre;
        base.cif = prof?.cif || base.cif;
        base.telefono = prof?.telefono || "";
        base.emailEmpresa = prof?.emailEmpresa || "";
        base.direccion = prof?.direccion || "";
        base.cp = prof?.cp || "";
        base.ciudad = prof?.ciudad || "";
        if (!cancelled) setForm(base);
        return;
      }

      const ownerId = empresaRecord?.owner_id;
      if (ownerId && sbSelect) {
        try {
          const rows = await sbSelect("profiles", `id=eq.${ownerId}`);
          const p = rows[0];
          if (p) {
            if (!base.nombre) base.nombre = p.nombre || officeUser?.empresaNombre || "";
            if (!base.cif) base.cif = p.cif || "";
            base.telefono = p.telefono || "";
            base.emailEmpresa = p.email_empresa || "";
            base.direccion = p.direccion || "";
            base.cp = p.cp || "";
            base.ciudad = p.ciudad || "";
          }
        } catch {
          /* solo lectura con lo disponible */
        }
      } else if (officeUser?.empresaNombre && !base.nombre) {
        base.nombre = officeUser.empresaNombre;
      }

      if (!cancelled) setForm(base);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [empresaRecord, prof, canEdit, officeUser, sbSelect]);

  async function guardar() {
    if (!canEdit) return;
    setSaving(true);
    try {
      const nextProf = {
        ...prof,
        nombre: form.nombre,
        cif: form.cif,
        telefono: form.telefono,
        emailEmpresa: form.emailEmpresa,
        direccion: form.direccion,
        cp: form.cp,
        ciudad: form.ciudad,
      };
      onSave?.(nextProf);

      const eid = empresaId || empresaRecord?.id;
      if (eid && sbUpsert) {
        await sbUpsert("empresas", [
          {
            id: eid,
            nombre: form.nombre?.trim() || empresaRecord?.nombre || "Empresa",
            cif: form.cif?.trim() || null,
          },
        ]);
        invalidateEmpresaRecordCache(eid);
      }

      setSaved(true);
      showToast?.("Perfil guardado ✓");
      setTimeout(() => setSaved(false), 2200);
    } catch {
      showToast?.("No se pudo guardar el perfil");
    }
    setSaving(false);
  }

  if (!hasEmpresa && canEdit) {
    return (
      <ConfigCard
        title="Perfil de empresa"
        description="Completa los datos de tu empresa de transporte."
      >
        <div style={{ fontSize: 13, color: CONFIG_UI.muted, lineHeight: 1.5 }}>
          Aún no tienes empresa registrada. Crea tu espacio de flota desde el panel principal.
        </div>
      </ConfigCard>
    );
  }

  if (!hasEmpresa) return null;

  return (
    <ConfigCard
      title="Perfil de empresa"
      description={
        canEdit
          ? "Datos de contacto y fiscales visibles en documentos y comunicaciones."
          : "Datos de la empresa (solo lectura)."
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "10px 12px",
        }}
      >
        {FIELDS.map(({ key, label, ph, full }) => (
          <div key={key} style={{ gridColumn: full ? "1 / -1" : "auto" }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: CONFIG_UI.muted,
                marginBottom: 5,
              }}
            >
              {label}
            </label>
            <input
              type="text"
              value={form[key] || ""}
              readOnly={!canEdit}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={ph}
              style={{
                ...configFieldStyle(),
                background: canEdit ? CONFIG_UI.surface : CONFIG_UI.surfaceSoft,
                color: canEdit ? CONFIG_UI.tx : CONFIG_UI.muted,
              }}
            />
          </div>
        ))}
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={guardar}
          disabled={saving}
          style={{ ...configBtnPrimary(saving), marginTop: 14 }}
        >
          {saved ? "Guardado ✓" : saving ? "Guardando…" : "Guardar perfil"}
        </button>
      ) : null}
    </ConfigCard>
  );
}
