import { CONFIG_GRID_CSS } from "./empresaConfigCards.jsx";
import { EmpresaPerfilConfigCard } from "./EmpresaPerfilConfigCard.jsx";
import { EmpresaCodigoEquipoConfig } from "./EmpresaCodigoEquipoConfig.jsx";
import { EmpresaUsuariosOficinaPanel } from "./EmpresaUsuariosOficinaPanel.jsx";
import {
  canViewEmpresaConfigPerfil,
  canViewEmpresaConfigUsuarios,
} from "../../domain/empresa/officeUserFilters.js";

/**
 * Configuración DEMO — layout tipo dashboard (grid responsive).
 */
export function EmpresaConfigDashboard({
  empresaId,
  empresaRecord,
  prof,
  capabilities,
  officeUser,
  sbSelect,
  sbUpsert,
  getUserId,
  onSave,
  showToast,
  ConfigPassword,
  ConfigDangerZone,
  tx,
  su,
}) {
  const showPerfil = canViewEmpresaConfigPerfil(capabilities);
  const showUsuarios = canViewEmpresaConfigUsuarios(capabilities);
  const empresaNombreFallback =
    empresaRecord?.nombre || officeUser?.empresaNombre || prof?.nombre || "";

  return (
    <div className="empresa-config-page">
      <style>{CONFIG_GRID_CSS}</style>
      <header className="empresa-config-header">
        <div style={{ fontSize: 22, fontWeight: 700, color: tx, marginBottom: 4 }}>Configuración</div>
        <div style={{ fontSize: 13, color: su, lineHeight: 1.45 }}>
          Datos de empresa, usuarios y acceso de conductores.
        </div>
      </header>

      <div className="empresa-config-grid">
        {showPerfil ? (
          <EmpresaPerfilConfigCard
            empresaId={empresaId}
            empresaRecord={empresaRecord}
            prof={prof}
            capabilities={capabilities}
            officeUser={officeUser}
            sbSelect={sbSelect}
            sbUpsert={sbUpsert}
            onSave={onSave}
            showToast={showToast}
          />
        ) : null}

        {empresaId ? (
          <EmpresaCodigoEquipoConfig
            variant="card"
            empresaId={empresaId}
            initialEmpresa={empresaRecord}
            empresaNombreFallback={empresaNombreFallback}
            officeUser={officeUser}
            sbSelect={sbSelect}
            showToast={showToast}
          />
        ) : null}

        {showUsuarios ? (
          <EmpresaUsuariosOficinaPanel
            variant="card"
            span2
            empresaId={empresaId}
            officeUser={officeUser}
            getUserId={getUserId}
            sbSelect={sbSelect}
            showToast={showToast}
          />
        ) : null}

        {ConfigPassword ? (
          <div className="empresa-config-card">
            <div className="empresa-config-card-title">Seguridad</div>
            <div className="empresa-config-card-desc">Actualiza la contraseña de tu cuenta.</div>
            <ConfigPassword embedded />
          </div>
        ) : null}

        {ConfigDangerZone ? (
          <div className="empresa-config-card">
            <div className="empresa-config-card-title">Zona peligrosa</div>
            <div className="empresa-config-card-desc">
              Exporta un backup antes de eliminar registros personales.
            </div>
            <ConfigDangerZone embedded prof={prof} showToast={showToast} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
