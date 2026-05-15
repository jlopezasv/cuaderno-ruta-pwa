-- Metadatos documentales operativos en evidencias.datos.doc_meta (JSON, sin romper filas existentes).
-- Campos opcionales futuros: columnas dedicadas si hace falta indexar OCR/clasificación.

COMMENT ON COLUMN public.evidencias.datos IS
  'JSON: campos CMR + doc_meta { display_name, size_bytes, preview_url, original_url, mime_type, future_hooks { qr_muelle, check_in_carga, ... } }';
