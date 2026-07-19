import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Diagnóstico TEMPORAL de conexión (se elimina tras la puesta en marcha).
// No expone secretos: solo prefijos y mensajes de error.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("d") !== "vc-diag-2026") {
    return NextResponse.json({ error: "no" }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(FALTA)";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const resultado: Record<string, unknown> = {
    url,
    anon_prefijo: anon ? anon.slice(0, 15) + "… (largo " + anon.length + ")" : "(FALTA)",
    service_presente: service ? "sí (largo " + service.length + ")" : "(FALTA)",
    payphone_token: process.env.PAYPHONE_TOKEN
      ? "presente (largo " + process.env.PAYPHONE_TOKEN.length + ")"
      : "(FALTA)",
    payphone_store_id: process.env.PAYPHONE_STORE_ID
      ? "presente (largo " + process.env.PAYPHONE_STORE_ID.length + ")"
      : "(FALTA)",
  };

  try {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from("plans")
      .select("id, precio_hora")
      .limit(5);
    resultado.consulta_planes = error
      ? { error: error.message, code: error.code, details: error.details, hint: error.hint }
      : { ok: true, filas: data?.length, data };
    const { data: tnc, error: e2 } = await supabase
      .from("tnc_versions")
      .select("version, publicado")
      .limit(3);
    resultado.consulta_tnc = e2
      ? { error: e2.message, code: e2.code }
      : { ok: true, filas: tnc?.length, tnc };
  } catch (e) {
    resultado.excepcion = e instanceof Error ? e.message : String(e);
  }

  // Vista de servidor (service role): estados de perfiles y acreditaciones,
  // sin datos personales
  try {
    if (service) {
      const admin = createClient(url, service, { auth: { persistSession: false } });
      const { data: perfiles, error: ep } = await admin
        .from("profiles")
        .select("rol, estado, alias, creado_en")
        .order("creado_en", { ascending: false });
      resultado.perfiles = ep ? { error: ep.message } : perfiles;
      const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 20 });
      resultado.usuarios_auth = usuarios?.users?.map((u) => ({
        email_dominio: u.email?.split("@")[1],
        confirmado: Boolean(u.email_confirmed_at),
        creado: u.created_at,
      }));
      const { data: acred } = await admin
        .from("accreditations")
        .select("estado, creado_en");
      resultado.acreditaciones = acred;
    }
  } catch (e) {
    resultado.excepcion_admin = e instanceof Error ? e.message : String(e);
  }

  // Reproduce la consulta de la pantalla Aprobaciones con la sesión del admin demo
  try {
    const cli = createClient(url, anon, { auth: { persistSession: false } });
    const { data: sesion, error: eLogin } = await cli.auth.signInWithPassword({
      email: "admin@vitalcowork.ec",
      password: "demo123456",
    });
    if (eLogin) {
      resultado.login_admin = { error: eLogin.message };
    } else {
      resultado.login_admin = { ok: true, uid: sesion.user?.id };
      const { data: pend, error: ePend } = await cli
        .from("profiles")
        .select(
          "id, nombre_completo, alias, specialties(nombre), accreditations(id, tipo, estado)"
        )
        .eq("estado", "pendiente")
        .eq("rol", "comed");
      resultado.consulta_aprobaciones = ePend
        ? { error: ePend.message, code: ePend.code, details: ePend.details, hint: ePend.hint }
        : { filas: pend?.length, alias: pend?.map((p) => p.alias) };
      const { data: esMgr, error: eFn } = await cli.rpc("es_comanager");
      resultado.fn_es_comanager = eFn ? { error: eFn.message } : esMgr;
    }
  } catch (e) {
    resultado.excepcion_aprobaciones = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(resultado);
}
