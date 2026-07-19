import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";
import { enviarCorreo, plantillaCorreo } from "@/lib/email";
import { formatoRangoHora, inicioBloque } from "@/lib/negocio/calendario";

export const maxDuration = 60;

/**
 * Tareas programadas (llamar cada 5–10 minutos con un cron externo,
 * p. ej. cron-job.org o Vercel Cron):
 *  1. Expiración de paquetes/horas y liberación de reservas abandonadas
 *  2. Recordatorios de reserva 24h y 1h antes
 *  3. Recordatorio de transferencias sin confirmar
 *  4. Despacho de notificaciones pendientes (push + correo)
 * Protegido con CRON_SECRET: GET /api/cron/tareas?clave=<CRON_SECRET>
 */
export async function GET(request: Request) {
  const clave = new URL(request.url).searchParams.get("clave");
  if (!process.env.CRON_SECRET || clave !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = crearClienteAdmin();
  const resumen: Record<string, number> = {};

  // ---------- 1. Expiraciones ----------
  await admin.rpc("fn_expirar_vigencias");

  // ---------- 2. Recordatorios de reservas ----------
  const ahora = Date.now();
  const { data: proximas } = await admin
    .from("reservations")
    .select("id, profile_id, fecha, hora")
    .eq("estado", "confirmada")
    .gte("fecha", new Date(ahora - 86400_000).toISOString().slice(0, 10))
    .lte("fecha", new Date(ahora + 2 * 86400_000).toISOString().slice(0, 10));

  for (const r of proximas ?? []) {
    const inicio = inicioBloque(r.fecha, r.hora).getTime();
    const faltanMs = inicio - ahora;
    for (const [tipo, ventanaMs, texto] of [
      ["recordatorio_24h", 24 * 3600_000, "mañana"],
      ["recordatorio_1h", 3600_000, "en 1 hora"],
    ] as const) {
      // Dispara dentro de la ventana [ventana - 15min, ventana]
      if (faltanMs <= ventanaMs && faltanMs > ventanaMs - 15 * 60_000) {
        const { data: ya } = await admin
          .from("notifications")
          .select("id")
          .eq("profile_id", r.profile_id)
          .eq("tipo", tipo)
          .eq("datos->>reserva", r.id)
          .maybeSingle();
        if (!ya) {
          await admin.from("notifications").insert({
            profile_id: r.profile_id,
            tipo,
            titulo: `⏰ Recordatorio: tu consultorio ${texto}`,
            cuerpo: `Tienes reservado el bloque de ${formatoRangoHora(r.hora)} el ${r.fecha}. ¡Te esperamos!`,
            datos: { reserva: r.id },
          });
          resumen[tipo] = (resumen[tipo] ?? 0) + 1;
        }
      }
    }
  }

  // ---------- 3. Transferencias sin confirmar ----------
  const { data: cfg } = await admin
    .from("settings").select("valor").eq("clave", "recordatorio_transferencia_horas").maybeSingle();
  const horasLimite = Number(cfg?.valor ?? 12);
  const { data: transferencias } = await admin
    .from("payments")
    .select("id, numero_recibo")
    .eq("estado", "pendiente")
    .not("comprobante_path", "is", null)
    .lt("creado_en", new Date(ahora - horasLimite * 3600_000).toISOString());
  if (transferencias?.length) {
    const { data: manager } = await admin
      .from("profiles").select("id").eq("rol", "comanager").limit(1).maybeSingle();
    for (const t of transferencias) {
      const { data: ya } = await admin
        .from("notifications")
        .select("id")
        .eq("tipo", "transferencia_pendiente")
        .eq("datos->>pago", t.id)
        .maybeSingle();
      if (!ya && manager) {
        await admin.from("notifications").insert({
          profile_id: manager.id,
          tipo: "transferencia_pendiente",
          titulo: "🧾 Transferencia esperando confirmación",
          cuerpo: `El comprobante del recibo N° ${t.numero_recibo} lleva más de ${horasLimite}h sin revisar.`,
          datos: { pago: t.id },
        });
        resumen.transferencias = (resumen.transferencias ?? 0) + 1;
      }
    }
  }

  // ---------- 4. Despacho de notificaciones (push + correo) ----------
  const { data: pendientes } = await admin
    .from("notifications")
    .select("id, profile_id, titulo, cuerpo, tipo")
    .is("enviado_en", null)
    .limit(50);

  for (const n of pendientes ?? []) {
    const { data: perfil } = await admin
      .from("profiles").select("email, nombre_completo").eq("id", n.profile_id).maybeSingle();
    await Promise.allSettled([
      enviarPush(n.profile_id, { titulo: n.titulo, cuerpo: n.cuerpo }),
      perfil
        ? enviarCorreo({
            para: perfil.email,
            asunto: n.titulo,
            html: plantillaCorreo(n.titulo, `<p>Hola ${perfil.nombre_completo.split(" ")[0]},</p><p>${n.cuerpo}</p>`),
          })
        : Promise.resolve(),
    ]);
    await admin.from("notifications").update({ enviado_en: new Date().toISOString() }).eq("id", n.id);
    resumen.despachadas = (resumen.despachadas ?? 0) + 1;
  }

  return NextResponse.json({ ok: true, ...resumen });
}
