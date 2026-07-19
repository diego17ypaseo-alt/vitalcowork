import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { InsigniaEstado, Estrellas, Vacio } from "@/components/ui";

export const metadata = { title: "Co-meds" };

export default async function PaginaComeds() {
  const supabase = await crearClienteServidor();
  const { data: comeds } = await supabase
    .from("profiles")
    .select("id, nombre_completo, alias, estado, reincidencias_excedente, specialties(nombre), ratings(estrellas)")
    .eq("rol", "comed")
    .order("nombre_completo");

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">Co-meds</h1>
      {(comeds ?? []).length === 0 ? (
        <Vacio texto="Aún no hay co-meds registrados." />
      ) : (
        <div className="tarjeta divide-y divide-borde/70 overflow-hidden">
          {(comeds ?? []).map((c) => {
            const esp = c.specialties as unknown as { nombre: string } | null;
            const rating = c.ratings as unknown as { estrellas: number } | null;
            return (
              <Link
                key={c.id}
                href={`/admin/comeds/${c.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-fondo"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {c.nombre_completo}{" "}
                    <span className="font-normal text-tinta-suave">({c.alias})</span>
                  </p>
                  <p className="text-xs text-tinta-suave">
                    {esp?.nombre ?? "Sin especialidad"}
                    {c.reincidencias_excedente > 0 && ` · ⚠ ${c.reincidencias_excedente} excedente(s)`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {rating && <Estrellas valor={rating.estrellas} tam={14} />}
                  <InsigniaEstado estado={c.estado} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
