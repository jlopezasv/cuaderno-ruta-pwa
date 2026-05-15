-- Alineación esquema servicio_documentos_extra: producción (archivo_url, conductor_id) + legacy (url, creado_por).

ALTER TABLE public.servicio_documentos_extra
  ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conductor_id uuid,
  ADD COLUMN IF NOT EXISTS archivo_url text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT '{}'::jsonb;

-- Legacy (migración 20260513120000)
ALTER TABLE public.servicio_documentos_extra
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS archivo_nombre text,
  ADD COLUMN IF NOT EXISTS creado_por uuid;

-- Backfill bidireccional si solo existe un lado
UPDATE public.servicio_documentos_extra
SET archivo_url = url
WHERE archivo_url IS NULL AND url IS NOT NULL;

UPDATE public.servicio_documentos_extra
SET url = archivo_url
WHERE url IS NULL AND archivo_url IS NOT NULL;

UPDATE public.servicio_documentos_extra
SET conductor_id = creado_por
WHERE conductor_id IS NULL AND creado_por IS NOT NULL;

UPDATE public.servicio_documentos_extra
SET creado_por = conductor_id
WHERE creado_por IS NULL AND conductor_id IS NOT NULL;

COMMENT ON COLUMN public.servicio_documentos_extra.archivo_url IS 'URL firmada o pública del archivo (canónico en app)';
COMMENT ON COLUMN public.servicio_documentos_extra.url IS 'Legacy — mantener sincronizado con archivo_url';
