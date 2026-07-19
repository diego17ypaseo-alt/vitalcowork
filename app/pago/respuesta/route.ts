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

  try {
    const resultado = await confirmarPagoPayphone(id, clientTxId);
    const admin = crearClienteAdmin();

    if (resultado.statusCode === 3) {
      // Aprobado
      await admin.rpc("fn_confirmar_pago", {
        p_pago: clientTxId,
        p_aprobar: true,
        p_payphone_tx: resultado,
      });
      return NextResponse.redirect(`${url.origin}/pago/exito?pago=${clientTxId}`);
    }
    // Cancelado o fallido: el pago queda pendiente para reintentar
    return NextResponse.redirect(
      `${url.origin}/pago/nuevo?pago=${clientTxId}&cancelado=1`
    );
  } catch (e) {
    console.error("Confirmación Payphone falló:", e);
    return NextResponse.redirect(
      `${url.origin}/pago/nuevo?pago=${clientTxId}&cancelado=1`
    );
  }
}
