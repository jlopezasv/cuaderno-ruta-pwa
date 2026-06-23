import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerEnv } from "./supabaseEnv.js";
import { isDemoApp } from "./appEnvironment.js";

export const CMR_OCR_DAILY_LIMIT = 10;

/**
 * Consume cuota OCR diaria (solo entorno demo; en prod no limita).
 * @returns {{ ok: true, count: number, limit: number } | { ok: false, status: number, error: string, code: string }}
 */
export async function tryConsumeCmrOcrQuota(userId) {
  if (!isDemoApp()) {
    return { ok: true, count: null, limit: null };
  }

  const env = getSupabaseServerEnv();
  if (!env.serviceRoleKey) {
    return {
      ok: false,
      status: 503,
      error: "Servidor sin service role key",
      code: "CMR_MISCONFIGURED",
    };
  }

  const sb = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.rpc("try_consume_cmr_ocr_quota", {
    p_user_id: userId,
    p_limit: CMR_OCR_DAILY_LIMIT,
  });

  if (error) {
    console.error("[cmr] quota_rpc_error", error.message);
    return {
      ok: false,
      status: 503,
      error: "No se pudo verificar la cuota OCR",
      code: "CMR_QUOTA_UNAVAILABLE",
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      status: 429,
      error: "Límite diario de OCR CMR alcanzado. Puedes subir el CMR como documento sin OCR.",
      code: "CMR_DAILY_LIMIT",
    };
  }

  return {
    ok: true,
    count: data.count ?? null,
    limit: data.limit ?? CMR_OCR_DAILY_LIMIT,
  };
}
