import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/auth";
import { formatoFechaCorta, formatoRangoHora, hoyGye } from "@/lib/negocio/calendario";
import { Tensiometro } from "@/components/tensiometro/Tensiometro";
import { InsigniaEstado, LogoVital, Tarjeta } from "@/components/ui";
import { CerrarSesion } from "@/components/CerrarSesion";
import type { ResumenMonedero } from "@/lib/tipos";

export const metadata = { title: "Inicio" };

export default async function PaginaInicio() {
  const { perfil } = await requierePerfil();
  const supabase = await crearClienteServidor();
  const hoy = hoyGye();

  const [{ data: monedero }, { data: proximas }, { data: notifs }, { data: pagosPendientes }] = await Promise.all([
    supabase.rpc("fn_resumen_monedero"),
    supabase
      .from("reservations")
      .select("id, fecha, hora, estado, spaces(nombre)")
      .gte("fecha", hoy)
      .in("estado", ["pendiente_pago", "confirmada", "en_curso"])
      .order("fecha").order("hora").limit(3),
    supabase
      .from("notifications")
      .select("id, titulo, cuerpo, creado_en, leido_en")
      .is("leido_en", null)
      .order("creado_en", { ascending: false })
      .limit(3),
    supabase
      .from("payments")
      .select("id, monto, comprobante_path")
      .eq("profile_id", perfil.id)
      .eq("estado", "pendiente")
      .order("creado_en", { ascending: false })
      .limit(3),
  ]);

  const m = monedero as ResumenMonedero | null;
  const nombreCorto = perfil.nombre_completo.split(" ")[0];

  return (
    <main className="space-y-4 px-4 py-5">
      <header className="flex items-center justify-between">
        <div>
          <LogoVital tam="text-xl" />
          <p className="text-sm text-tinta-suave">Hola, <b>{nombreCorto}</b> 👋</p>
        </div>
        <Link href="/perfil" className="flex h-10 w-10 items-center justify-center rounded-full bg-primario-suave text-sm font-extrabold text-primario-oscuro">
          {perfil.alias.slice(0, 2)}
        </Link>
      </header>

      {/* Tensiómetro de saldo */}
      <Tarjeta className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Tensiómetro de saldo</p>
          <Link href="/planes" className="text-xs font-semibold text-primario">Recargar horas →</Link>
        </div>
        <Tensiometro
          horas={m?.saldo_total ?? 0}
          maxHoras={m?.paquete?.horas_total ?? Math.max(m?.saldo_total ?? 0, 10)}
          diasRestantes={m?.paquete?.dias_restantes ?? null}
          etiqueta={m?.paquete ? (m.paquete.plan === "vip" ? "Ronda Médica VIP" : "Estancia Plus") : undefined}
        />
        {(m?.saldo_general ?? 0) > 0 && (
          <p className="mt-2 text-center text-xs text-tinta-suave">
            Incluye <b>{m!.saldo_general} h</b> de recompensas y créditos.
          </p>
        )}
      </Tarjeta>

      {/* Pagos pendientes de completar */}
      {(pagosPendientes ?? [])
        .filter((p) => !p.comprobante_path)
        .map((p) => (
          <Link
            key={p.id}
            href={`/pago/nuevo?pago=${p.id}`}
            className="tarjeta flex items-center justify-between border-alerta/40 bg-alerta-suave/40 p-4"
          >
            <span className="text-sm font-bold">
              💳 Tienes un pago pendiente de ${Number(p.monto).toFixed(2)}
            </span>
            <span className="text-alerta font-bold">Completar →</span>
          </Link>
        ))}

      <Link href="/calendario" className="btn-primario w-full py-3.5 text-base">
        📅 Reservar mi espacio
      </Link>

      {/* Próximas reservas */}
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-borde bg-fondo px-4 py-3">
          <p className="text-sm font-bold">Próximas reservas</p>
          <Link href="/reservas" className="text-xs font-semibold text-primario">Ver todas →</Link>
        </div>
        {(proximas ?? []).length === 0 ? (
          <p className="p-5 text-center text-sm text-tinta-suave">
            No tienes reservas próximas.
          </p>
        ) : (
          <ul className="divide-y divide-borde/70">
            {(proximas ?? []).map((r) => {
              const s = r.spaces as unknown as { nombre: string } | null;
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="capitalize">
                    <b>{r.fecha === hoy ? "Hoy" : formatoFechaCorta(r.fecha)}</b> · {formatoRangoHora(r.hora)}
                    <span className="ml-1 text-xs text-tinta-suave">{s?.nombre}</span>
                  </span>
                  <InsigniaEstado estado={r.estado} />
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      {/* Notificaciones sin leer */}
      {(notifs ?? []).length > 0 && (
        <Tarjeta className="overflow-hidden">
          <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">🔔 Novedades</p>
          <ul className="divide-y divide-borde/70">
            {(notifs ?? []).map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="text-sm font-bold">{n.titulo}</p>
                <p className="text-xs leading-relaxed text-tinta-suave">{n.cuerpo}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {perfil.rol === "comanager" && (
        <Link href="/admin" className="btn-secundario w-full">Ir al panel de administración</Link>
      )}
      <div className="pt-2 text-center">
        <CerrarSesion className="text-xs text-tinta-suave underline cursor-pointer" />
      </div>
    </main>
  );
}
