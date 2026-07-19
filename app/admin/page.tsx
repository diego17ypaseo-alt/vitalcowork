import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/auth";
import {
  diasHabilesSemana,
  formatoRangoHora,
  horasReservables,
  hoyGye,
  sumarDias,
  ultimoDiaDelMes,
  JORNADAS_INICIALES,
  type Jornadas,
} from "@/lib/negocio/calendario";
import { formatoUSD } from "@/lib/negocio/precios";
import { InsigniaEstado, Tarjeta } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const supabase = await crearClienteServidor();
  const hoy = hoyGye();
  const horario = await leerConfig<{ jornadas: Jornadas }>("horario", { jornadas: JORNADAS_INICIALES });
  const capacidadDia = horasReservables(horario.jornadas).length;
  const semana = diasHabilesSemana(hoy);
  const inicioMes = hoy.slice(0, 8) + "01";
  const finMes = ultimoDiaDelMes(hoy);
  const activas = ["pendiente_pago", "confirmada", "en_curso", "completada"];

  const [
    { count: reservasHoy },
    { count: reservasSemana },
    { count: reservasMes },
    { data: ingresosMes },
    { count: pendientesAprobacion },
    { count: pagosPorConfirmar },
    { data: proximas },
    { data: espacios },
  ] = await Promise.all([
    supabase.from("reservations").select("id", { count: "exact", head: true })
      .eq("fecha", hoy).in("estado", activas),
    supabase.from("reservations").select("id", { count: "exact", head: true })
      .gte("fecha", semana[0]).lte("fecha", semana[4]).in("estado", activas),
    supabase.from("reservations").select("id", { count: "exact", head: true })
      .gte("fecha", inicioMes).lte("fecha", finMes).in("estado", activas),
    supabase.from("payments").select("monto")
      .eq("estado", "confirmado").gte("confirmado_en", `${inicioMes}T00:00:00-05:00`),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    supabase.from("payments").select("id", { count: "exact", head: true })
      .eq("estado", "pendiente").not("comprobante_path", "is", null),
    supabase.from("reservations")
      .select("id, fecha, hora, estado, profiles(nombre_completo), spaces(nombre)")
      .gte("fecha", hoy).in("estado", ["pendiente_pago", "confirmada", "en_curso"])
      .order("fecha").order("hora").limit(8),
    supabase.from("spaces").select("id").eq("activo", true),
  ]);

  const nEspacios = Math.max(espacios?.length ?? 1, 1);
  const ingresos = (ingresosMes ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const ocupacion = (n: number | null, dias: number) =>
    Math.round(((n ?? 0) / (capacidadDia * dias * nEspacios)) * 100);

  return (
    <main className="space-y-5">
      <h1 className="text-xl font-extrabold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Ocupación hoy" valor={`${ocupacion(reservasHoy, 1)}%`} detalle={`${reservasHoy ?? 0} de ${capacidadDia * nEspacios} bloques`} />
        <Kpi titulo="Ocupación semana" valor={`${ocupacion(reservasSemana, 5)}%`} detalle={`${reservasSemana ?? 0} bloques`} />
        <Kpi titulo="Ocupación mes" valor={`${ocupacion(reservasMes, 22)}%`} detalle={`${reservasMes ?? 0} bloques`} />
        <Kpi titulo="Ingresos del mes" valor={formatoUSD(ingresos)} detalle="pagos confirmados" acento />
      </div>

      {((pendientesAprobacion ?? 0) > 0 || (pagosPorConfirmar ?? 0) > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {(pendientesAprobacion ?? 0) > 0 && (
            <Link href="/admin/aprobaciones" className="tarjeta flex items-center justify-between border-alerta/40 bg-alerta-suave/40 p-4">
              <span className="text-sm font-bold">🕐 {pendientesAprobacion} co-med(s) esperando aprobación</span>
              <span className="text-alerta">→</span>
            </Link>
          )}
          {(pagosPorConfirmar ?? 0) > 0 && (
            <Link href="/admin/ventanilla" className="tarjeta flex items-center justify-between border-alerta/40 bg-alerta-suave/40 p-4">
              <span className="text-sm font-bold">🧾 {pagosPorConfirmar} transferencia(s) por confirmar</span>
              <span className="text-alerta">→</span>
            </Link>
          )}
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">Próximas reservas</p>
        {(proximas ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-tinta-suave">Sin reservas próximas.</p>
        ) : (
          <ul className="divide-y divide-borde/70">
            {(proximas ?? []).map((r) => {
              const p = r.profiles as unknown as { nombre_completo: string } | null;
              const s = r.spaces as unknown as { nombre: string } | null;
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <b>{r.fecha === hoy ? "Hoy" : r.fecha === sumarDias(hoy, 1) ? "Mañana" : r.fecha}</b>{" "}
                    {formatoRangoHora(r.hora)}
                    <span className="ml-2 text-tinta-suave">{p?.nombre_completo} · {s?.nombre}</span>
                  </div>
                  <InsigniaEstado estado={r.estado} />
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </main>
  );
}

function Kpi({ titulo, valor, detalle, acento }: { titulo: string; valor: string; detalle: string; acento?: boolean }) {
  return (
    <div className={`tarjeta p-4 ${acento ? "border-primario/40 bg-primario-suave/40" : ""}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-tinta-suave">{titulo}</p>
      <p className="mt-1 text-2xl font-extrabold">{valor}</p>
      <p className="text-[11px] text-tinta-suave">{detalle}</p>
    </div>
  );
}
