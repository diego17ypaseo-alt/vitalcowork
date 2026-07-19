// Integración con el Botón de Pagos de Payphone (pasarela ecuatoriana)
// Docs: https://docs.payphone.app — SOLO usar en servidor.
// Variables de entorno requeridas: PAYPHONE_TOKEN, PAYPHONE_STORE_ID

const BASE = "https://pay.payphonetodoesposible.com";

export function payphoneConfigurado(): boolean {
  return Boolean(process.env.PAYPHONE_TOKEN && process.env.PAYPHONE_STORE_ID);
}

export interface PreparacionPayphone {
  paymentId: string;
  payWithCard: string; // URL a la que se redirige al usuario
}

/**
 * Prepara una transacción y devuelve la URL de pago con tarjeta.
 * `montoUsd` en dólares; Payphone trabaja en centavos.
 */
export async function prepararPagoPayphone(opts: {
  montoUsd: number;
  clientTransactionId: string; // id del pago en nuestra BD
  referencia: string;
  responseUrl: string;
  cancellationUrl: string;
}): Promise<PreparacionPayphone> {
  const centavos = Math.round(opts.montoUsd * 100);
  const res = await fetch(`${BASE}/api/button/Prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PAYPHONE_TOKEN}`,
    },
    body: JSON.stringify({
      amount: centavos,
      amountWithoutTax: centavos, // servicio sin IVA desglosado; ajustar si aplica
      tax: 0,
      currency: "USD",
      storeId: process.env.PAYPHONE_STORE_ID,
      reference: opts.referencia,
      clientTransactionId: opts.clientTransactionId,
      responseUrl: opts.responseUrl,
      cancellationUrl: opts.cancellationUrl,
    }),
  });
  if (!res.ok) {
    throw new Error(`Payphone Prepare falló (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as PreparacionPayphone;
}

export interface ConfirmacionPayphone {
  transactionStatus: string; // "Approved" | "Canceled" | ...
  statusCode: number; // 3 = aprobado, 2 = cancelado
  [k: string]: unknown;
}

/** Confirma el resultado de una transacción (obligatorio tras el redirect) */
export async function confirmarPagoPayphone(
  id: string,
  clientTxId: string
): Promise<ConfirmacionPayphone> {
  const res = await fetch(`${BASE}/api/button/V2/Confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PAYPHONE_TOKEN}`,
    },
    body: JSON.stringify({ id: Number(id), clientTxId }),
  });
  if (!res.ok) {
    throw new Error(`Payphone Confirm falló (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as ConfirmacionPayphone;
}
