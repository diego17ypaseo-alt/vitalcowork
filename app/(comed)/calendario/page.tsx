import { crearClienteServidor } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/auth";
import { CalendarioReservas } from "@/components/calendario/CalendarioReservas";
import { JORNADAS_INICIALES, type Jornadas } from "@/lib/negocio/calendario";
import type { Espacio } from "@/lib/tipos";

export const metadata = { title: "Calendario" };

export default async function PaginaCalendario() {
  const supabase = await crearClienteServidor();
  const horario = await leerConfig<{ jornadas: Jornadas }>("horario", {
    jornadas: JORNADAS_INICIALES,
  });
  const [{ data: espacios }, { data: triaje }] = await Promise.all([
    supabase.from("spaces").select("*").eq("activo", true).order("es_principal", { ascending: false }),
    supabase.from("plans").select("precio_hora").eq("id", "triaje").single(),
  ]);

  return (
    <main className="py-5">
      <header className="mb-4 px-4">
        <h1 className="text-xl font-extrabold">Calendario</h1>
        <p className="text-sm text-tinta-suave">
          Toca los bloques libres para seleccionarlos y reserva en 3 pasos.
        </p>
      </header>
      <CalendarioReservas
        jornadas={horario.jornadas}
        espacios={(espacios as Espacio[]) ?? []}
        precioTriaje={Number(triaje?.precio_hora ?? 15)}
      />
    </main>
  );
}
