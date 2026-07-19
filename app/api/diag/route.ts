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

  return NextResponse.json(resultado);
}
