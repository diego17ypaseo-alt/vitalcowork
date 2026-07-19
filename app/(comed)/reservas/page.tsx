import { Suspense } from "react";
import { leerConfig } from "@/lib/auth";
import { ListaReservas } from "@/components/reservas/ListaReservas";
import { JORNADAS_INICIALES, type Jornadas } from "@/lib/negocio/calendario";
import { Cargando } from "@/components/ui";

export const metadata = { title: "Mis reservas" };

export default async function PaginaReservas() {
  const [horario, anticipacion, gracia, pct24] = await Promise.all([
    leerConfig<{ jornadas: Jornadas }>("horario", { jornadas: JORNADAS_INICIALES }),
    leerConfig<number>("reagenda_anticipacion_horas", 4),
    leerConfig<number>("gracia_minutos", 8),
    leerConfig<number>("penalizacion_dentro_24h", 0.5),
  ]);

  return (
    <main className="py-5">
      <header className="mb-4 px-4">
        <h1 className="text-xl font-extrabold">Mis reservas</h1>
        <p className="text-sm text-tinta-suave">
          Inicia y finaliza tu sesión, reagenda o cancela según el reglamento.
        </p>
      </header>
      <Suspense fallback={<Cargando />}>
        <ListaReservas
          anticipacionHoras={Number(anticipacion)}
          graciaMinutos={Number(gracia)}
          jornadas={horario.jornadas}
          pctPenalizacion24h={Number(pct24)}
        />
      </Suspense>
    </main>
  );
}
