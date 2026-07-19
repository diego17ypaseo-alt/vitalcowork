import { Suspense } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/auth";
import { Ventanilla } from "@/components/admin/Ventanilla";
import { JORNADAS_INICIALES, type Jornadas } from "@/lib/negocio/calendario";
import { Cargando } from "@/components/ui";
import type { Espacio } from "@/lib/tipos";

export const metadata = { title: "Ventanilla" };

export default async function PaginaVentanilla() {
  const supabase = await crearClienteServidor();
  const horario = await leerConfig<{ jornadas: Jornadas }>("horario", { jornadas: JORNADAS_INICIALES });
  const [{ data: espacios }, { data: triaje }] = await Promise.all([
    supabase.from("spaces").select("*").eq("activo", true).order("es_principal", { ascending: false }),
    supabase.from("plans").select("precio_hora").eq("id", "triaje").single(),
  ]);

  return (
    <Suspense fallback={<Cargando />}>
      <Ventanilla
        jornadas={horario.jornadas}
        espacios={(espacios as Espacio[]) ?? []}
        precioTriaje={Number(triaje?.precio_hora ?? 15)}
      />
    </Suspense>
  );
}
