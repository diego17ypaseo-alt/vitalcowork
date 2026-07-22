import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";
import { enviarCorreo, plantillaCorreo } from "@/lib/email";

/**
 * Aviso automático al administrador cuando un co-med envía su solicitud:
 * notificación interna + push + correo (WhatsApp queda a un toque del co-med
 * desde la pantalla "en revisión").
 */
export async function POST() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = crearClienteAdmin();
  const { data: perfil } = await admin
    .from("profiles")
    .select("nombre_completo, cedula, estado, specialties(nombre)")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.estado !== "pendiente") {
    return NextResponse.json({ ok: false });
  }

  const { data: manager } = await admin
    .from("profiles")
    .select("id, email")
    .eq("rol", "comanager")
    .limit(1)
    .maybeSingle();
  if (!manager) return NextResponse.json({ ok: false });

  const esp =
    (perfil.specialties as unknown as { nombre: string } | null)?.nombre ??
    "sin especialidad";
  const titulo = "🩺 Nueva solicitud de co-med";
  const cuerpo = `${perfil.nombre_completo} (${esp}, C.I. ${perfil.cedula ?? "—"}) envió su registro con acreditación. Revísalo en Panel → Aprobaciones.`;

  await admin.from("notifications").insert({
    profile_id: manager.id,
    tipo: "registro_nuevo",
    titulo,
    cuerpo,
    datos: { solicitante: user.id },
  });
  await enviarPush(manager.id, {
    titulo,
    cuerpo,
    url: "/admin/aprobaciones",
  });
  await enviarCorreo({
    para: manager.email,
    asunto: titulo,
    html: plantillaCorreo(titulo, `${cuerpo}<br><br><a href="https://vitalcowork.vercel.app/admin/aprobaciones">Abrir aprobaciones</a>`),
  });

  return NextResponse.json({ ok: true });
}
