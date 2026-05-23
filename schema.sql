


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."es_jefe_de"("conductor_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select exists (
    select 1
    from conductor_empresa ce
    join empresas e on e.id = ce.empresa_id
    where ce.user_id = conductor_uid
    and e.owner_id = auth.uid()
    and ce.activo = true
  );
$$;


ALTER FUNCTION "public"."es_jefe_de"("conductor_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generar_codigo_equipo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  nuevo_codigo text;
begin
  if new.codigo_equipo is null or trim(new.codigo_equipo) = '' then
    nuevo_codigo :=
      upper(left(regexp_replace(coalesce(new.nombre, 'EMP'), '[^A-Za-z0-9]', '', 'g'), 4))
      || '-'
      || floor(1000 + random() * 9000)::text;

    new.codigo_equipo := nuevo_codigo;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."generar_codigo_equipo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    p_empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_empresa_id
        AND e.owner_id IS NOT NULL
        AND e.owner_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") IS 'True si auth.uid() es owner_id de la empresa. Base para INSERT/SELECT servicios sin conductor.';



CREATE OR REPLACE FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT
        (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.empresas e
            WHERE e.id = s.empresa_id
              AND e.owner_id IS NOT NULL
              AND e.owner_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;


ALTER FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") IS 'Conductor del servicio; o dueño empresa (conductor_id NULL permitido); o jefe del conductor asignado.';



CREATE OR REPLACE FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    (
      public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR p_conductor_id = 'b0000002-0002-4002-8002-000000000001'::uuid
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
        OR p_conductor_id = auth.uid()
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
          AND (p_empresa_id IS NULL OR ce.empresa_id = p_empresa_id)
      )
    );
$$;


ALTER FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") IS 'INSERT servicios: empresa sin conductor, con placeholder SIN ASIGNAR, con conductor de flota, o autónomo.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."asignaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "servicio_id" "uuid",
    "conductor_id" "uuid",
    "tipo" "text" DEFAULT 'principal'::"text",
    "stop_desde" integer DEFAULT 1,
    "stop_hasta" integer,
    "estado" "text" DEFAULT 'activa'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."asignaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conductor_empresa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "rol" "text" DEFAULT 'conductor'::"text",
    "nombre" "text",
    "matricula" "text",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conductor_empresa_rol_check" CHECK (("rol" = ANY (ARRAY['conductor'::"text", 'gestor'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."conductor_empresa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documentos" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "text" NOT NULL,
    "template_label" "text",
    "template_icon" "text",
    "fields" "jsonb",
    "location" "text",
    "photo" "text",
    "ts" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."empresas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "cif" "text",
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "codigo_corto" "text",
    "activa" boolean DEFAULT true,
    "is_test" boolean DEFAULT true NOT NULL,
    "codigo_equipo" "text" NOT NULL
);


ALTER TABLE "public"."empresas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entries" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "ts" timestamp with time zone NOT NULL,
    "note" "text",
    "location" "text",
    "late" boolean DEFAULT false,
    "photo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false,
    "corrected_by" "text",
    "correction_note" "text",
    "corrects" "text",
    "corrected_at" timestamp with time zone,
    "pais" "text"
);


ALTER TABLE "public"."entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evidencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stop_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "url" "text",
    "datos" "jsonb",
    "nota" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "evidencias_tipo_check" CHECK (("tipo" = ANY (ARRAY['cmr'::"text", 'foto'::"text", 'qr'::"text", 'incidencia'::"text", 'firma'::"text", 'nota'::"text"])))
);


ALTER TABLE "public"."evidencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gastos" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cat" "text" NOT NULL,
    "importe" numeric(10,2) NOT NULL,
    "descripcion" "text",
    "fecha" "text" NOT NULL,
    "factura" "text",
    "photo_url" "text",
    "photo_expires_at" timestamp with time zone,
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gastos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parkings" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lat" numeric(10,6) NOT NULL,
    "lon" numeric(10,6) NOT NULL,
    "name" "text",
    "type" "text" NOT NULL,
    "note" "text",
    "rating" integer,
    "city" "text",
    "added_by" "text",
    "added_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."parkings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text",
    "dni" "text",
    "empresa" "text",
    "matricula" "text",
    "licencia" "text",
    "pais_base" "text" DEFAULT 'ES'::"text",
    "tipo_servicio" "text" DEFAULT 'nacional'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lang" "text" DEFAULT 'es'::"text",
    "remolque" "text",
    "tipo_vehiculo" "text" DEFAULT 'articulado'::"text",
    "ccaa" "text" DEFAULT 'AN'::"text",
    "tipo_cuenta" "text" DEFAULT 'autonomo'::"text",
    "cif" "text",
    "direccion" "text",
    "telefono" "text",
    "email_empresa" "text",
    "cp" "text",
    "ciudad" "text",
    "is_placeholder_system" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_placeholder_system" IS 'Perfil interno (SIN ASIGNAR). No es conductor de flota ni app.';



CREATE TABLE IF NOT EXISTS "public"."push_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "fire_at" timestamp with time zone NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "tag" "text",
    "sent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pwa_installed" boolean DEFAULT false,
    "ua" "text"
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servicio_asignaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "servicio_id" "uuid" NOT NULL,
    "stop_id" "uuid",
    "conductor_id" "uuid" NOT NULL,
    "tipo_asignacion" "text" DEFAULT 'principal'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."servicio_asignaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servicio_cambios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "servicio_id" "uuid" NOT NULL,
    "campo" "text" NOT NULL,
    "valor_anterior" "text",
    "valor_nuevo" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."servicio_cambios" OWNER TO "postgres";


COMMENT ON TABLE "public"."servicio_cambios" IS 'Auditoría de cambios administrativos relevantes en servicios (empresa / tráfico).';



CREATE TABLE IF NOT EXISTS "public"."servicio_documentos_extra" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "servicio_id" "uuid" NOT NULL,
    "stop_id" "uuid",
    "empresa_id" "uuid",
    "conductor_id" "uuid",
    "tipo" "text" NOT NULL,
    "descripcion" "text",
    "archivo_url" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "archivo_nombre" "text",
    "datos" "jsonb" DEFAULT '{}'::"jsonb",
    "url" "text",
    "creado_por" "uuid"
);


ALTER TABLE "public"."servicio_documentos_extra" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servicios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid",
    "conductor_id" "uuid",
    "estado" "text" DEFAULT 'asignado'::"text" NOT NULL,
    "origen" "text",
    "destino" "text",
    "referencia" "text",
    "notas" "text",
    "fecha_inicio" timestamp with time zone,
    "fecha_fin_est" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "servicios_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente_asignacion'::"text", 'asignado'::"text", 'en_curso'::"text", 'completado'::"text", 'cerrado'::"text", 'anulado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."servicios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."servicios"."conductor_id" IS 'Conductor principal / responsable. NULL = pendiente de asignación (solo empresa hasta asignar).';



COMMENT ON COLUMN "public"."servicios"."estado" IS 'pendiente_asignacion | asignado | en_curso | completado (operativa) | cerrado (expediente firmado) | anulado | cancelado';



CREATE TABLE IF NOT EXISTS "public"."stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "servicio_id" "uuid" NOT NULL,
    "orden" double precision NOT NULL,
    "tipo" "text" DEFAULT 'parada'::"text" NOT NULL,
    "nombre" "text" NOT NULL,
    "direccion" "text",
    "lat" double precision,
    "lon" double precision,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "eta" timestamp with time zone,
    "hora_llegada_real" timestamp with time zone,
    "hora_salida_real" timestamp with time zone,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stops_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'en_camino'::"text", 'llegado'::"text", 'completado'::"text"]))),
    CONSTRAINT "stops_tipo_check" CHECK (("tipo" = ANY (ARRAY['carga'::"text", 'descarga'::"text", 'parada_tecnica'::"text", 'aduana'::"text", 'pernocta'::"text"])))
);


ALTER TABLE "public"."stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "plan" "text" DEFAULT 'trial'::"text" NOT NULL,
    "status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "current_period_end" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ubicaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lat" double precision NOT NULL,
    "lon" double precision NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"(),
    "velocidad" double precision,
    "precision_m" double precision,
    "empresa_id" "uuid",
    "event_type" "text",
    "servicio_id" "uuid",
    "stop_id" "uuid"
);


ALTER TABLE "public"."ubicaciones" OWNER TO "postgres";


ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conductor_empresa"
    ADD CONSTRAINT "conductor_empresa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conductor_empresa"
    ADD CONSTRAINT "conductor_empresa_user_id_empresa_id_key" UNIQUE ("user_id", "empresa_id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evidencias"
    ADD CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parkings"
    ADD CONSTRAINT "parkings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_schedule"
    ADD CONSTRAINT "push_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."servicio_asignaciones"
    ADD CONSTRAINT "servicio_asignaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicio_cambios"
    ADD CONSTRAINT "servicio_cambios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicio_documentos_extra"
    ADD CONSTRAINT "servicio_documentos_extra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicios"
    ADD CONSTRAINT "servicios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stops"
    ADD CONSTRAINT "stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id");



CREATE INDEX "ce_empresa" ON "public"."conductor_empresa" USING "btree" ("empresa_id");



CREATE INDEX "ce_user" ON "public"."conductor_empresa" USING "btree" ("user_id");



CREATE UNIQUE INDEX "empresas_codigo_corto" ON "public"."empresas" USING "btree" ("codigo_corto");



CREATE UNIQUE INDEX "empresas_codigo_equipo_idx" ON "public"."empresas" USING "btree" ("codigo_equipo");



CREATE INDEX "entries_user_ts" ON "public"."entries" USING "btree" ("user_id", "ts" DESC);



CREATE INDEX "gastos_user_fecha" ON "public"."gastos" USING "btree" ("user_id", "fecha" DESC);



CREATE INDEX "idx_asignaciones_conductor" ON "public"."asignaciones" USING "btree" ("conductor_id", "estado");



CREATE INDEX "idx_asignaciones_servicio" ON "public"."asignaciones" USING "btree" ("servicio_id");



CREATE INDEX "idx_evidencias_stop" ON "public"."evidencias" USING "btree" ("stop_id", "tipo");



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_servicio_asignaciones_servicio" ON "public"."servicio_asignaciones" USING "btree" ("servicio_id");



CREATE INDEX "idx_servicio_asignaciones_stop" ON "public"."servicio_asignaciones" USING "btree" ("stop_id") WHERE ("stop_id" IS NOT NULL);



CREATE INDEX "idx_servicio_cambios_servicio_created" ON "public"."servicio_cambios" USING "btree" ("servicio_id", "created_at" DESC);



CREATE INDEX "idx_servicio_documentos_extra_empresa" ON "public"."servicio_documentos_extra" USING "btree" ("empresa_id");



CREATE INDEX "idx_servicios_conductor" ON "public"."servicios" USING "btree" ("conductor_id", "estado");



CREATE INDEX "idx_stops_servicio" ON "public"."stops" USING "btree" ("servicio_id", "orden");



CREATE INDEX "ubicaciones_empresa_idx" ON "public"."ubicaciones" USING "btree" ("empresa_id");



CREATE UNIQUE INDEX "ubicaciones_user_unique" ON "public"."ubicaciones" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "empresas_codigo_equipo_trigger" BEFORE INSERT OR UPDATE ON "public"."empresas" FOR EACH ROW EXECUTE FUNCTION "public"."generar_codigo_equipo"();



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id");



ALTER TABLE ONLY "public"."conductor_empresa"
    ADD CONSTRAINT "conductor_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evidencias"
    ADD CONSTRAINT "evidencias_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conductor_empresa"
    ADD CONSTRAINT "fk_ce_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "fk_doc_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "fk_documentos_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "fk_empresas_user" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "fk_entries_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "fk_gastos_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parkings"
    ADD CONSTRAINT "fk_park_user" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "fk_profiles_user" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos"
    ADD CONSTRAINT "gastos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parkings"
    ADD CONSTRAINT "parkings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_schedule"
    ADD CONSTRAINT "push_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servicio_asignaciones"
    ADD CONSTRAINT "servicio_asignaciones_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servicio_asignaciones"
    ADD CONSTRAINT "servicio_asignaciones_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."servicio_cambios"
    ADD CONSTRAINT "servicio_cambios_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servicio_cambios"
    ADD CONSTRAINT "servicio_cambios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."servicios"
    ADD CONSTRAINT "servicios_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stops"
    ADD CONSTRAINT "stops_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");



ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id");



ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id");



CREATE POLICY "Users can delete own push tokens" ON "public"."push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own push tokens" ON "public"."push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own push tokens" ON "public"."push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own push tokens" ON "public"."push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "admin_read_all_conductores" ON "public"."conductor_empresa" FOR SELECT USING (("auth"."uid"() = 'f1f784a9-c6cc-43df-942c-a66533125284'::"uuid"));



CREATE POLICY "admin_read_all_empresas" ON "public"."empresas" FOR SELECT USING (("auth"."uid"() = 'f1f784a9-c6cc-43df-942c-a66533125284'::"uuid"));



CREATE POLICY "admin_read_all_entries" ON "public"."entries" FOR SELECT USING (("auth"."uid"() = 'f1f784a9-c6cc-43df-942c-a66533125284'::"uuid"));



CREATE POLICY "admin_read_all_profiles" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = 'f1f784a9-c6cc-43df-942c-a66533125284'::"uuid"));



ALTER TABLE "public"."asignaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asignaciones_acceso" ON "public"."asignaciones" USING ((("conductor_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM (("public"."servicios" "s"
     JOIN "public"."empresas" "e" ON (("e"."owner_id" = "auth"."uid"())))
     JOIN "public"."conductor_empresa" "ce" ON (("ce"."empresa_id" = "e"."id")))
  WHERE ("s"."id" = "asignaciones"."servicio_id"))))) WITH CHECK ((("conductor_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM (("public"."servicios" "s"
     JOIN "public"."empresas" "e" ON (("e"."owner_id" = "auth"."uid"())))
     JOIN "public"."conductor_empresa" "ce" ON (("ce"."empresa_id" = "e"."id")))
  WHERE ("s"."id" = "asignaciones"."servicio_id")))));



CREATE POLICY "ce_insert" ON "public"."conductor_empresa" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "empresas"."owner_id"
   FROM "public"."empresas"
  WHERE ("empresas"."id" = "conductor_empresa"."empresa_id"))));



CREATE POLICY "ce_select" ON "public"."conductor_empresa" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "empresas"."owner_id"
   FROM "public"."empresas"
  WHERE ("empresas"."id" = "conductor_empresa"."empresa_id")))));



CREATE POLICY "ce_update" ON "public"."conductor_empresa" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "empresas"."owner_id"
   FROM "public"."empresas"
  WHERE ("empresas"."id" = "conductor_empresa"."empresa_id"))));



CREATE POLICY "conductor actualiza su ubicacion" ON "public"."ubicaciones" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "conductor inserta su ubicacion" ON "public"."ubicaciones" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "conductor_delete_own" ON "public"."conductor_empresa" FOR DELETE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."conductor_empresa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conductor_join" ON "public"."conductor_empresa" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "conductor_lee_empresa" ON "public"."empresas" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "conductor_read_own" ON "public"."conductor_empresa" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."documentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documentos_all" ON "public"."documentos" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."empresas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "empresas_delete" ON "public"."empresas" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "empresas_insert" ON "public"."empresas" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "empresas_select" ON "public"."empresas" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "empresas_update" ON "public"."empresas" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entries_all" ON "public"."entries" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entries_jefe_read" ON "public"."entries" FOR SELECT USING (("user_id" IN ( SELECT "ce"."user_id"
   FROM ("public"."conductor_empresa" "ce"
     JOIN "public"."empresas" "e" ON (("e"."id" = "ce"."empresa_id")))
  WHERE (("e"."owner_id" = "auth"."uid"()) AND ("ce"."activo" = true)))));



CREATE POLICY "entries_own" ON "public"."entries" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "entries_user" ON "public"."entries" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."evidencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evidencias_acceso" ON "public"."evidencias" USING ((EXISTS ( SELECT 1
   FROM ("public"."stops" "st"
     JOIN "public"."servicios" "s" ON (("s"."id" = "st"."servicio_id")))
  WHERE (("st"."id" = "evidencias"."stop_id") AND (("s"."conductor_id" = "auth"."uid"()) OR "public"."es_jefe_de"("s"."conductor_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."stops" "st"
     JOIN "public"."servicios" "s" ON (("s"."id" = "st"."servicio_id")))
  WHERE (("st"."id" = "evidencias"."stop_id") AND (("s"."conductor_id" = "auth"."uid"()) OR "public"."es_jefe_de"("s"."conductor_id"))))));



CREATE POLICY "full_access_documentos_extra" ON "public"."servicio_documentos_extra" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."gastos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gastos_all" ON "public"."gastos" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "gastos_jefe_read" ON "public"."gastos" FOR SELECT USING (("user_id" IN ( SELECT "ce"."user_id"
   FROM ("public"."conductor_empresa" "ce"
     JOIN "public"."empresas" "e" ON (("e"."id" = "ce"."empresa_id")))
  WHERE (("e"."owner_id" = "auth"."uid"()) AND ("ce"."activo" = true)))));



CREATE POLICY "gastos_own" ON "public"."gastos" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "jefe lee ubicaciones" ON "public"."ubicaciones" FOR SELECT USING (true);



CREATE POLICY "jefe_gestiona_conductores" ON "public"."conductor_empresa" USING (("empresa_id" IN ( SELECT "empresas"."id"
   FROM "public"."empresas"
  WHERE ("empresas"."owner_id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "empresas"."id"
   FROM "public"."empresas"
  WHERE ("empresas"."owner_id" = "auth"."uid"()))));



CREATE POLICY "jefe_ve_todos" ON "public"."conductor_empresa" FOR SELECT USING ((("empresa_id" IN ( SELECT "empresas"."id"
   FROM "public"."empresas"
  WHERE ("empresas"."owner_id" = "auth"."uid"()))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "owner_gestiona_empresa" ON "public"."empresas" USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."parkings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parkings_delete" ON "public"."parkings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "parkings_insert" ON "public"."parkings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "parkings_select" ON "public"."parkings" FOR SELECT USING (true);



CREATE POLICY "profile_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profile_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profile_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_user" ON "public"."profiles" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "push_own" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."push_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_service" ON "public"."push_subscriptions" FOR SELECT USING (true);



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sa_del" ON "public"."servicio_asignaciones" FOR DELETE TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sa_ins" ON "public"."servicio_asignaciones" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sa_sel" ON "public"."servicio_asignaciones" FOR SELECT TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sa_upd" ON "public"."servicio_asignaciones" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id")) WITH CHECK ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sc_ins" ON "public"."servicio_cambios" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sc_sel" ON "public"."servicio_cambios" FOR SELECT TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "schedule_own" ON "public"."push_schedule" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "schedule_service" ON "public"."push_schedule" USING (true);



CREATE POLICY "sde_del" ON "public"."servicio_documentos_extra" FOR DELETE TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sde_ins" ON "public"."servicio_documentos_extra" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sde_sel" ON "public"."servicio_documentos_extra" FOR SELECT TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id"));



CREATE POLICY "sde_upd" ON "public"."servicio_documentos_extra" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_servicio"("servicio_id")) WITH CHECK ("public"."user_can_access_servicio"("servicio_id"));



ALTER TABLE "public"."servicio_asignaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."servicio_cambios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."servicio_documentos_extra" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."servicios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "srv_del" ON "public"."servicios" FOR DELETE TO "authenticated" USING ("public"."user_can_access_servicio"("id"));



CREATE POLICY "srv_ins" ON "public"."servicios" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."empresas" "e"
  WHERE (("e"."id" = "servicios"."empresa_id") AND ("e"."owner_id" = "auth"."uid"())))));



CREATE POLICY "srv_sel" ON "public"."servicios" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "srv_upd" ON "public"."servicios" FOR UPDATE TO "authenticated" USING ("public"."user_can_access_servicio"("id")) WITH CHECK ("public"."user_can_access_servicio"("id"));



ALTER TABLE "public"."stops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stops_acceso" ON "public"."stops" USING ((EXISTS ( SELECT 1
   FROM "public"."servicios" "s"
  WHERE (("s"."id" = "stops"."servicio_id") AND (("s"."conductor_id" = "auth"."uid"()) OR "public"."es_jefe_de"("s"."conductor_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."servicios" "s"
  WHERE (("s"."id" = "stops"."servicio_id") AND (("s"."conductor_id" = "auth"."uid"()) OR "public"."es_jefe_de"("s"."conductor_id"))))));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ubi_sel_empresa_flota" ON "public"."ubicaciones" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."conductor_empresa" "ce"
     JOIN "public"."empresas" "e" ON ((("e"."id" = "ce"."empresa_id") AND ("e"."owner_id" = "auth"."uid"()))))
  WHERE (("ce"."user_id" = "ubicaciones"."user_id") AND ("ce"."activo" IS DISTINCT FROM false)))));



ALTER TABLE "public"."ubicaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users see own subscription" ON "public"."subscriptions" FOR SELECT USING (("user_id" = ("auth"."uid"())::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."es_jefe_de"("conductor_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."es_jefe_de"("conductor_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."es_jefe_de"("conductor_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generar_codigo_equipo"() TO "anon";
GRANT ALL ON FUNCTION "public"."generar_codigo_equipo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generar_codigo_equipo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_empresa"("p_empresa_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_servicio"("servicio_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_insert_servicio"("p_empresa_id" "uuid", "p_conductor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."asignaciones" TO "anon";
GRANT ALL ON TABLE "public"."asignaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."asignaciones" TO "service_role";



GRANT ALL ON TABLE "public"."conductor_empresa" TO "anon";
GRANT ALL ON TABLE "public"."conductor_empresa" TO "authenticated";
GRANT ALL ON TABLE "public"."conductor_empresa" TO "service_role";



GRANT ALL ON TABLE "public"."documentos" TO "anon";
GRANT ALL ON TABLE "public"."documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos" TO "service_role";



GRANT ALL ON TABLE "public"."empresas" TO "anon";
GRANT ALL ON TABLE "public"."empresas" TO "authenticated";
GRANT ALL ON TABLE "public"."empresas" TO "service_role";



GRANT ALL ON TABLE "public"."entries" TO "anon";
GRANT ALL ON TABLE "public"."entries" TO "authenticated";
GRANT ALL ON TABLE "public"."entries" TO "service_role";



GRANT ALL ON TABLE "public"."evidencias" TO "anon";
GRANT ALL ON TABLE "public"."evidencias" TO "authenticated";
GRANT ALL ON TABLE "public"."evidencias" TO "service_role";



GRANT ALL ON TABLE "public"."gastos" TO "anon";
GRANT ALL ON TABLE "public"."gastos" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos" TO "service_role";



GRANT ALL ON TABLE "public"."parkings" TO "anon";
GRANT ALL ON TABLE "public"."parkings" TO "authenticated";
GRANT ALL ON TABLE "public"."parkings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_schedule" TO "anon";
GRANT ALL ON TABLE "public"."push_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."push_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."servicio_asignaciones" TO "anon";
GRANT ALL ON TABLE "public"."servicio_asignaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."servicio_asignaciones" TO "service_role";



GRANT ALL ON TABLE "public"."servicio_cambios" TO "anon";
GRANT ALL ON TABLE "public"."servicio_cambios" TO "authenticated";
GRANT ALL ON TABLE "public"."servicio_cambios" TO "service_role";



GRANT ALL ON TABLE "public"."servicio_documentos_extra" TO "anon";
GRANT ALL ON TABLE "public"."servicio_documentos_extra" TO "authenticated";
GRANT ALL ON TABLE "public"."servicio_documentos_extra" TO "service_role";



GRANT ALL ON TABLE "public"."servicios" TO "anon";
GRANT ALL ON TABLE "public"."servicios" TO "authenticated";
GRANT ALL ON TABLE "public"."servicios" TO "service_role";



GRANT ALL ON TABLE "public"."stops" TO "anon";
GRANT ALL ON TABLE "public"."stops" TO "authenticated";
GRANT ALL ON TABLE "public"."stops" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."ubicaciones" TO "anon";
GRANT ALL ON TABLE "public"."ubicaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."ubicaciones" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







