import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatoUSD } from "@/lib/negocio/precios";
import { Tarjeta } from "@/components/ui";

export const metadata = { title: "Pago exitoso" };

export default async function PaginaPagoExito({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago: pagoId } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data: pago } = pagoId
    ? await supabase
        .from("payments")
        .select("id, numero_recibo, monto, metodo, estado, confirmado_en")
        .eq("id", pagoId)
        .maybeSingle()
    : { data: null };

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-exito-suave text-4xl">
        ✅
      </div>
      <h1 className="mt-5 text-xl font-extrabold">¡Pago confirmado!</h1>
      {pago && (
        <Tarjeta className="mt-5 w-full max-w-sm p-5 text-left text-sm">
          <div className="flex justify-between py-1"><span className="text-tinta-suave">Recibo</span><b>N° {pago.numero_recibo}</b></div>
          <div className="flex justify-between py-1"><span className="text-tinta-suave">Monto</span><b>{formatoUSD(Number(pago.monto))}</b></div>
          <div className="flex justify-between py-1"><span className="text-tinta-suave">Método</span><b className="capitalize">{pago.metodo}</b></div>
        </Tarjeta>
      )}
      <div className="mt-6 w-full max-w-sm space-y-2">
        {pago && (
          <a href={`/api/recibo/${pago.id}`} target="_blank" className="btn-secundario w-full">
            🧾 Descargar recibo
          </a>
        )}
        <Link href="/reservas" className="btn-primario w-full">Ver mis reservas</Link>
      </div>
    </main>
  );
}
