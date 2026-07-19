import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service role: SOLO para uso en servidor (webhooks Payphone,
 * cron de recordatorios/expiraciones, envío de push). Nunca exponer al cliente.
 */
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
