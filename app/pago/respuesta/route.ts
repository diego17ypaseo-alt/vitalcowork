import { NextResponse } from "next/server";
import { confirmarPagoPayphone } from "@/lib/payphone";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/**
 * URL de respuesta del Botón de Pagos Payphone.
 * Confirma la transacción contra la API (obligatorio) y aplica el resultado
 * con service role (fn_confirmar_pago valida el estado del pago).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const clientTxId = url.searchParams.get("clientTransactionId");
  if (!id || !clientTxId) {
    return NextResponse.redirect(`${url.origin}/reservas`);
  }

  const admin = crearClienteAdmin();

  // clientTransactionId es "VC-<numero_recibo>" (límite de 15 caracteres de
  // Payphone); se resuelve al UUID del pago. Compatibilidad: acepta UUID directo.
  let pagoId = clientTxId;
  if (clientTxId.startsWith("VC-")) {
    const { data: pago } = await admin
      .from("payments")
      .select("id")
      .eq("numero_recibo", Number(clientTxId.slice(3)))
      .maybeSingle();
    if (!pago) return NextResponse.redirect(`${url.origin}/reservas`);
    pagoId = pago.id;
  }

  try {
    const resultado = await confirmarPagoPayphone(id, clientTxId);

    if (resultado.statusCode === 3) {
      // Aprobado
      await admin.rpc("fn_confirmar_pago", {
        p_pago: pagoId,
        p_aprobar: true,
        p_payphone_tx: resultado,
      });
      return NextResponse.redirect(`${url.origin}/pago/exito?pago=${pagoId}`);
    }
    // Cancelado o fallido: el pago queda pendiente para reintentar
    return NextResponse.redirect(
      `${url.origin}/pago/nuevo?pago=${pagoId}&cancelado=1`
    );
  } catch (e) {
    console.error("Confirmación Payphone falló:", e);
    return NextResponse.redirect(
      `${url.origin}/pago/nuevo?pago=${pagoId}&cancelado=1`
    );
  }
}
