-- DEMO: retención mínima 365 días para PDF DCDT (servicio_documentos_extra.tipo = dcdt).
-- Alineado con esquema real de retention_asset_catalog / retention_policy_config
-- (migración 20260708120000_data_retention_framework.sql).
-- Ejecutar en Supabase DEMO si el framework de retención ya está aplicado.

INSERT INTO public.retention_asset_catalog (asset_class, label, tier, entity_hint, includes_storage, description)
VALUES (
  'dcdt_pdf',
  'PDF DCDT (documento legal)',
  'RETENIDO',
  'servicio_documentos_extra',
  true,
  'tipo=dcdt · conservación mínima 365 días (retention_until en datos JSON)'
)
ON CONFLICT (asset_class) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  entity_hint = EXCLUDED.entity_hint,
  includes_storage = EXCLUDED.includes_storage,
  description = EXCLUDED.description;

INSERT INTO public.retention_policy_config (
  scope, empresa_id, asset_class,
  days_until_archivable, days_until_borable, min_retention_days, purge_enabled, notes
)
SELECT v.scope, v.empresa_id, v.asset_class, v.da, v.db, v.mn, false, v.notes
FROM (VALUES
  ('global'::text, NULL::uuid, 'dcdt_pdf', 0, 0, 365, 'DCDT legal — mínimo 365 días; purge desactivado')
) AS v(scope, empresa_id, asset_class, da, db, mn, notes)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.retention_policy_config rpc
  WHERE rpc.scope = 'global' AND rpc.asset_class = 'dcdt_pdf'
);

UPDATE public.retention_policy_config
SET
  min_retention_days = GREATEST(min_retention_days, 365),
  notes = COALESCE(notes, 'DCDT legal — mínimo 365 días; purge desactivado'),
  updated_at = now()
WHERE scope = 'global' AND asset_class = 'dcdt_pdf';
