-- Reparación: servicios creados por Autónomo PRO que heredaron empresa_id por vínculo flota.
-- Ejecutar en Supabase SQL Editor (revisar filas antes con el SELECT).

-- Vista previa
SELECT s.id, s.empresa_id, s.conductor_id, p.tipo_cuenta, s.created_at
FROM public.servicios s
JOIN public.profiles p ON p.id = s.conductor_id
WHERE p.tipo_cuenta IN ('autonomo_pro', 'autonomo')
  AND s.empresa_id IS NOT NULL
  AND s.conductor_id IS NOT NULL
ORDER BY s.created_at DESC
LIMIT 50;

-- Corregir: servicios del conductor autónomo sin asignación explícita de tenant empresa en creación jefe
-- (solo filas donde el conductor es autónomo y no es owner de esa empresa)
UPDATE public.servicios s
SET empresa_id = NULL
FROM public.profiles p
WHERE p.id = s.conductor_id
  AND p.tipo_cuenta IN ('autonomo_pro', 'autonomo')
  AND s.empresa_id IS NOT NULL
  AND s.conductor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = s.empresa_id
      AND e.owner_id = s.conductor_id
  );
