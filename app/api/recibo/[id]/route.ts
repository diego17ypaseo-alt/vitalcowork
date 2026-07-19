import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatoRangoHora } from "@/lib/negocio/calendario";

/** Recibo/constancia de pago en HTML imprimible (Ctrl+P → PDF) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  // RLS: solo el dueño del pago o el co-manager pueden verlo
  const { data: pago } = await supabase
    .from("payments")
    .select("*, profiles!payments_profile_id_fkey(nombre_completo, cedula, email)")
    .eq("id", id)
    .maybeSingle();
  if (!pago) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { data: reservas } = await supabase
    .from("reservations")
    .select("fecha, hora, precio")
    .eq("pago_id", id)
    .order("fecha");

  const { data: paquete } = pago.package_id
    ? await supabase
        .from("packages")
        .select("plan_id, horas_total, inicio, fin")
        .eq("id", pago.package_id)
        .maybeSingle()
    : { data: null };

  const perfil = pago.profiles as { nombre_completo: string; cedula: string | null; email: string };
  const fecha = new Date(pago.confirmado_en ?? pago.creado_en).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "long",
    timeStyle: "short",
  });

  const filas = [
    ...(reservas ?? []).map(
      (r) =>
        `<tr><td>Reserva ${r.fecha} · ${formatoRangoHora(r.hora)}</td><td class="d">$${Number(r.precio).toFixed(2)}</td></tr>`
    ),
    ...(paquete
      ? [
          `<tr><td>Paquete ${paquete.plan_id === "vip" ? "Ronda Médica VIP" : "Estancia Plus"} · ${paquete.horas_total} horas (vigencia ${paquete.inicio ?? "—"} → ${paquete.fin ?? "—"})</td><td class="d">$${Number(pago.monto).toFixed(2)}</td></tr>`,
        ]
      : []),
  ].join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Recibo N° ${pago.numero_recibo} — VitalCowork</title>
<style>
  body{font-family:system-ui,sans-serif;color:#0f2733;max-width:640px;margin:32px auto;padding:0 20px}
  .cab{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0e7490;padding-bottom:14px}
  .logo{font-size:24px;font-weight:800;color:#155e70}.logo span{color:#0891b2}
  h1{font-size:16px;margin:20px 0 4px}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
  td{padding:8px 4px;border-bottom:1px solid #dbe7e9}.d{text-align:right;font-weight:700}
  .total td{border-top:2px solid #0e7490;font-size:16px;font-weight:800}
  .meta{font-size:12.5px;color:#5b7280;line-height:1.7}
  .estado{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;
    background:${pago.estado === "confirmado" ? "#d9f2e5;color:#059669" : "#fdf0dc;color:#d97706"}}
  .pie{margin-top:36px;font-size:11px;color:#94a3b8;text-align:center}
  @media print{.no-print{display:none}}
</style></head><body>
<div class="cab">
  <div class="logo">Vital<span>Cowork</span></div>
  <div style="text-align:right"><b>RECIBO N° ${pago.numero_recibo}</b><br>
  <span class="estado">${pago.estado === "confirmado" ? "PAGADO" : "PENDIENTE DE CONFIRMACIÓN"}</span></div>
</div>
<h1>Constancia de pago</h1>
<p class="meta">
  <b>Profesional:</b> ${perfil.nombre_completo} · C.I. ${perfil.cedula ?? "—"}<br>
  <b>Correo:</b> ${perfil.email}<br>
  <b>Fecha:</b> ${fecha} (America/Guayaquil)<br>
  <b>Método:</b> ${pago.metodo}
</p>
<table>
  ${filas || `<tr><td>Pago de servicios VitalCowork</td><td class="d">$${Number(pago.monto).toFixed(2)}</td></tr>`}
  <tr class="total"><td>TOTAL USD</td><td class="d">$${Number(pago.monto).toFixed(2)}</td></tr>
</table>
<p class="pie">VitalCowork — Coworking médico · Guayaquil, Ecuador · Documento informativo;
la factura electrónica SRI se emitirá por los canales oficiales.</p>
<div class="no-print" style="text-align:center;margin-top:24px">
  <button onclick="print()" style="padding:10px 24px;border-radius:10px;border:0;background:#0e7490;color:#fff;font-weight:700;cursor:pointer">Imprimir / Guardar PDF</button>
</div>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
