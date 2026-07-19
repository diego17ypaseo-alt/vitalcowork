import { Suspense } from "react";
import { leerConfig } from "@/lib/auth";
import { payphoneConfigurado } from "@/lib/payphone";
import { Checkout } from "@/components/pagos/Checkout";
import { Cargando } from "@/components/ui";

export const metadata = { title: "Pagar" };

export default async function PaginaCheckout() {
  const bancos = await leerConfig<
    { banco: string; tipo: string; numero: string; titular: string; cedula_ruc: string }[]
  >("bancos", []);
  const whatsapp = await leerConfig<string>("whatsapp_numero", "593983936496");

  return (
    <main className="py-5">
      <header className="mb-4 px-4">
        <h1 className="text-xl font-extrabold">Completar pago</h1>
        <p className="text-sm text-tinta-suave">Elige tu método de pago preferido.</p>
      </header>
      <Suspense fallback={<Cargando />}>
        <Checkout
          bancos={bancos}
          whatsapp={whatsapp}
          payphoneDisponible={payphoneConfigurado()}
        />
      </Suspense>
    </main>
  );
}
