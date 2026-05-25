-- Fase 1: unificar cierre documental en estado `completado`.
-- La app sigue leyendo `cerrado` en registros no migrados; el CHECK conserva ambos valores.
-- Idempotente: solo filas con estado = 'cerrado'.

UPDATE public.servicios
SET
  estado = 'completado',
  updated_at = COALESCE(updated_at, now())
WHERE estado = 'cerrado';
