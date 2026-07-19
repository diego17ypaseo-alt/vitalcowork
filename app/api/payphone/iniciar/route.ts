import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { payphoneConfigurado, prepararPagoPayphone } from "@/lib/payphone";

/** Inicia una transacción del Botón de Pagos Payphone para un pago pendiente */
export async function POST(request: Request) {
  if (!payphoneConfigurado()) {
    return NextResponse.json(
      { error: "Payphone no está configurado (PAYPHONE_TOKEN / PAYPHONE_STORE_ID)." },
      { status: 503 }
    );
  }
  const { pagoId } = await request.json();
  if (!pagoId) return NextResponse.json({ error: "Falta pagoId" }, { status: 400 });

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // RLS: solo devuelve el pago si pertenece al usuario (o es co-manager)
  const { data: pago } = await supabase
    .from("payments")
    .select("id, monto, estado, numero_recibo")
    .eq("id", pagoId)
    .maybeSingle();
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  if (pago.estado !== "pendiente")
    return NextResponse.json({ error: "El pago ya fue procesado" }, { status: 409 });

  const origen = new URL(request.url).origin;
  try {
    const prep = await prepararPagoPayphone({
      montoUsd: Number(pago.monto),
      clientTransactionId: pago.id,
      referencia: `VitalCowork recibo ${pago.numero_recibo}`,
      responseUrl: `${origen}/pago/respuesta`,
      cancellationUrl: `${origen}/pago/nuevo?pago=${pago.id}&cancelado=1`,
    });
    return NextResponse.json({ url: prep.payWithCard, paymentId: prep.paymentId });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Payphone rechazó la solicitud. Verifica las credenciales." },
      { status: 502 }
    );
  }
}
