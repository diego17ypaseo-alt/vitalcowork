import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

/** Intercambio de código OAuth (Google / Microsoft) por sesión */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const siguiente = searchParams.get("siguiente") ?? "/inicio";

  if (code) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${siguiente}`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
