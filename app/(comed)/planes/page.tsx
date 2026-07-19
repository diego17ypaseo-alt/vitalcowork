import { crearClienteServidor } from "@/lib/supabase/server";
import { PlanesComercial } from "@/components/planes/PlanesComercial";
import type { Plan } from "@/lib/tipos";

export const metadata = { title: "Planes" };

export default async function PaginaPlanes() {
  const supabase = await crearClienteServidor();
  const { data: planes } = await supabase
    .from("plans")
    .select("*")
    .eq("activo", true)
    .order("orden");

  return (
    <main className="py-5">
      <header className="mb-4 px-4">
        <h1 className="text-xl font-extrabold">Planes y paquetes</h1>
        <p className="text-sm text-tinta-suave">
          Elige el nivel que acompaña tu ritmo de consulta.
        </p>
      </header>
      <PlanesComercial planes={(planes as Plan[]) ?? []} />
    </main>
  );
}
