# Estándar Supabase: tablas nuevas (grants + RLS + ownership)

Supabase deja de exponer tablas nuevas sin políticas claras. Cada tabla en `public` debe seguir este patrón **antes** de merge o despliegue.

## 1. Ownership del producto

- **Unidad raíz de acceso compartido conductor/empresa**: el **servicio** (`public.user_can_access_servicio(uuid)`).
- **Conductor** y **empresa** son experiencias distintas; la seguridad no “simula” un solo rol con flags en cliente.
- **Evidencias** (`evidencias`): documentación **operativa** por parada (CMR, POD, fotos de muelle, incidencias).
- **Archivos extra** (`servicio_documentos_extra`): **expediente documental** del viaje (tickets, PDFs, anexos). No mezclar conceptos en UI ni en nombres de API.

## 2. Plantilla SQL obligatoria

Sustituir `mi_tabla` y las columnas de ownership (`servicio_id`, `created_by`, etc.).

```sql
-- Tabla
CREATE TABLE public.mi_tabla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants explícitos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mi_tabla TO authenticated;
GRANT ALL ON public.mi_tabla TO service_role;
REVOKE ALL ON public.mi_tabla FROM PUBLIC;

ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;

-- Políticas separadas (SELECT / INSERT / UPDATE / DELETE), sin monolitos
CREATE POLICY "mi_tabla_sel" ON public.mi_tabla
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "mi_tabla_ins" ON public.mi_tabla
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "mi_tabla_upd" ON public.mi_tabla
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "mi_tabla_del" ON public.mi_tabla
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));
```

## 3. Reglas de negocio ya fijadas en migración core

Archivo: `supabase/migrations/20260514120000_rls_servicio_ownership_core.sql`

- Función **`public.user_can_access_servicio(uuid)`** (`SECURITY DEFINER`, `search_path = public`): conductor del servicio **o** `empresas.owner_id` del `servicios.empresa_id` **o** propietario de la empresa del conductor vía `conductor_empresa` (cuando `empresa_id` en `servicios` viene vacío pero el servicio es de flota).
- **`documentacion_envios`**: solo `SELECT` + `INSERT` para `authenticated` (append-only); `service_role` mantiene `ALL`; trigger rellena `enviado_por` y `empresa_id` si faltan.
- **`push_tokens`**: cada usuario solo filas con `user_id = auth.uid()`.

## 4. Checklist antes de dar por cerrada una tabla

- [ ] `GRANT` explícito a `authenticated` y `service_role` (y `REVOKE` de `PUBLIC` si aplica).
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- [ ] Políticas **por comando** (SELECT / INSERT / UPDATE / DELETE).
- [ ] Columnas `created_at` / `updated_at` (y `created_by` si aplica).
- [ ] Comentario `COMMENT ON TABLE` si hay riesgo de confusión (operativa vs expediente).
- [ ] Nada de “tabla abierta” confiando en el cliente.

## 5. Endurecimiento futuro (sin RBAC pesado)

Ampliar solo **`user_can_access_servicio`** (o una vista de membresía leída por esa función) cuando existan:

- `empresa_users` (no owners),
- operadores / tráfico,
- admins de plataforma.

Evitar duplicar la misma lógica en cada política.
