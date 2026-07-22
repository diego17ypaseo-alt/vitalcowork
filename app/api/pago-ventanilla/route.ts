import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";
import { formatoRangoHora } from "@/lib/negocio/calendario";

/**
 * "Pagaré en ventanilla": el reglamento permite pagar antes o después de la
 * hora reservada, así que un co-med APROBADO puede confirmar su reserva de
 * inmediato eligiendo esta modalidad. Se crea el pago pendiente (efectivo),
 * la reserva queda confirmada y se notifica al co-med y al administrador.
 */
export async function POST(request: Request) {
  const { reservas, pagoId } = (await request.json()) as {
    reservas?: string[];
    pagoId?: string;
  };

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = crearClienteAdmin();
  const { data: perfil } = await admin
    .from("profiles")
    .select("nombre_completo, estado")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.estado !== "aprobado") {
    return NextResponse.json(
      { error: "Tu cuenta debe estar aprobada para usar esta modalidad." },
      { status: 403 }
    );
  }

  let pago: { id: string; numero_recibo: number; monto: number } | null = null;
  let detalle = "";

  if (pagoId) {
    // Pago ya creado (p. ej. paquete o checkout retomado): cambia a efectivo
    const { data: p } = await admin
      .from("payments")
      .select("id, numero_recibo, monto, estado, profile_id, package_id")
      .eq("id", pagoId)
      .maybeSingle();
    if (!p || p.profile_id !== user.id)
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    if (p.estado !== "pendiente")
      return NextResponse.json({ error: "El pago ya fue procesado" }, { status: 409 });

    await admin.from("payments").update({ metodo: "efectivo" }).eq("id", p.id);
    // Reservas asociadas quedan confirmadas (el pago se hará en recepción)
    const { data: rs } = await admin
      .from("reservations")
      .select("id, fecha, hora")
      .eq("pago_id", p.id)
      .eq("estado", "pendiente_pago");
    if (rs?.length) {
      await admin
        .from("reservations")
        .update({ estado: "confirmada" })
        .eq("pago_id", p.id)
        .eq("estado", "pendiente_pago");
      detalle = rs.map((r) => `${r.fecha} ${formatoRangoHora(r.hora)}`).join(", ");
    } else if (p.package_id) {
      detalle = "compra de paquete de horas";
    }
    pago = { id: p.id, numero_recibo: p.numero_recibo, monto: Number(p.monto) };
  } else if (reservas?.length) {
    // Reservas recién creadas sin pago: crea el pago efectivo y confirma
    const { data: rs } = await admin
      .from("reservations")
      .select("id, fecha, hora, precio, profile_id, estado, pago_id")
      .in("id", reservas);
    const propias = (rs ?? []).filter(
      (r) => r.profile_id === user.id && r.estado === "pendiente_pago" && !r.pago_id
    );
    if (!propias.length)
      return NextResponse.json({ error: "No hay reservas pendientes" }, { status: 404 });

    const monto = propias.reduce((s, r) => s + Number(r.precio), 0);
    const { data: nuevo, error: ep } = await admin
      .from("payments")
      .insert({ profile_id: user.id, monto, metodo: "efectivo", estado: "pendiente" })
      .select("id, numero_recibo")
      .single();
    if (ep || !nuevo)
      return NextResponse.json({ error: ep?.message ?? "Error creando pago" }, { status: 500 });

    const ids = propias.map((r) => r.id);
    await admin
      .from("reservations")
      .update({ pago_id: nuevo.id, estado: "confirmada" })
      .in("id", ids);
    detalle = propias.map((r) => `${r.fecha} ${formatoRangoHora(r.hora)}`).join(", ");
    pago = { id: nuevo.id, numero_recibo: nuevo.numero_recibo, monto };
  } else {
    return NextResponse.json({ error: "Solicitud vacía" }, { status: 400 });
  }

  // Notificaciones a ambas partes
  await admin.from("notifications").insert({
    profile_id: user.id,
    tipo: "pago_ventanilla",
    titulo: "Reserva confirmada — pago en ventanilla",
    cuerpo: `Tu reserva quedó confirmada (${detalle}). Recuerda cancelar $${pago.monto.toFixed(2)} en recepción, antes o después de tu hora (recibo N° ${pago.numero_recibo}).`,
    datos: { pago: pago.id },
  });
  const { data: manager } = await admin
    .from("profiles").select("id").eq("rol", "comanager").limit(1).maybeSingle();
  if (manager) {
    const titulo = "💵 Pago pendiente en ventanilla";
    const cuerpo = `${perfil.nombre_completo} confirmó ${detalle} y pagará $${pago.monto.toFixed(2)} en recepción (recibo N° ${pago.numero_recibo}).`;
    await admin.from("notifications").insert({
      profile_id: manager.id,
      tipo: "pago_ventanilla",
      titulo,
      cuerpo,
      datos: { pago: pago.id },
    });
    await enviarPush(manager.id, { titulo, cuerpo, url: "/admin/ventanilla" });
  }
  await enviarPush(user.id, {
    titulo: "✅ Reserva confirmada",
    cuerpo: `Pago de $${pago.monto.toFixed(2)} pendiente en ventanilla (recibo N° ${pago.numero_recibo}).`,
    url: "/reservas",
  });

  return NextResponse.json({
    ok: true,
    pago: pago.id,
    numero_recibo: pago.numero_recibo,
    monto: pago.monto,
    detalle,
  });
}
