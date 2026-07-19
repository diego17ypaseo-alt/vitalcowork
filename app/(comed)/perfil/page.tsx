import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/auth";
import { formatoUSD } from "@/lib/negocio/precios";
import { InsigniaEstado, Tarjeta } from "@/components/ui";
import { ActivarPush } from "@/components/ActivarPush";
import { CerrarSesion } from "@/components/CerrarSesion";

export const metadata = { title: "Mi perfil" };

export default async function PaginaPerfil() {
  const { perfil } = await requierePerfil();
  const supabase = await crearClienteServidor();

  const [{ data: especialidad }, { data: acreditaciones }, { data: paquetes }, { data: pagos }, { data: notifs }] =
    await Promise.all([
      perfil.especialidad_id
        ? supabase.from("specialties").select("nombre").eq("id", perfil.especialidad_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("accreditations").select("tipo, numero, estado").eq("profile_id", perfil.id),
      supabase.from("packages").select("*, plans(nombre)").eq("profile_id", perfil.id).order("creado_en", { ascending: false }).limit(5),
      supabase.from("payments").select("id, numero_recibo, monto, metodo, estado, creado_en").eq("profile_id", perfil.id).order("creado_en", { ascending: false }).limit(10),
      supabase.from("notifications").select("id, titulo, cuerpo, creado_en").order("creado_en", { ascending: false }).limit(10),
    ]);

  return (
    <main className="space-y-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primario text-lg font-extrabold text-white">
          {perfil.alias.slice(0, 2)}
        </div>
        <div>
          <h1 className="text-lg font-extrabold">{perfil.nombre_completo}</h1>
          <p className="text-sm text-tinta-suave">
            {especialidad?.nombre ?? "Sin especialidad"} · alias “{perfil.alias}”
          </p>
        </div>
      </header>

      <Tarjeta className="space-y-2 p-4 text-sm">
        <Fila k="Correo" v={perfil.email} />
        <Fila k="Teléfono" v={perfil.telefono ?? "—"} />
        <Fila k="Cédula" v={perfil.cedula ?? "—"} />
        <Fila k="Estado de cuenta" v={<InsigniaEstado estado={perfil.estado} />} />
        {(acreditaciones ?? []).map((a, i) => (
          <Fila key={i} k={`Registro ${a.tipo}`} v={<span className="flex items-center gap-2">{a.numero} <InsigniaEstado estado={a.estado} /></span>} />
        ))}
      </Tarjeta>

      <ActivarPush />

      {/* Paquetes */}
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-borde bg-fondo px-4 py-3">
          <p className="text-sm font-bold">Mis paquetes</p>
          <Link href="/planes" className="text-xs font-semibold text-primario">Comprar →</Link>
        </div>
        {(paquetes ?? []).length === 0 ? (
          <p className="p-5 text-center text-sm text-tinta-suave">Sin paquetes contratados.</p>
        ) : (
          <ul className="divide-y divide-borde/70">
            {(paquetes ?? []).map((p) => {
              const plan = p.plans as unknown as { nombre: string } | null;
              return (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    <b>{plan?.nombre}</b> · {Number(p.horas_total)} h
                    {p.fin && <span className="text-xs text-tinta-suave"> · vence {p.fin}</span>}
                  </span>
                  <InsigniaEstado estado={p.estado} />
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      {/* Pagos y recibos */}
      <Tarjeta className="overflow-hidden">
        <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">Pagos y recibos</p>
        {(pagos ?? []).length === 0 ? (
          <p className="p-5 text-center text-sm text-tinta-suave">Sin pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-borde/70">
            {(pagos ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  N° {p.numero_recibo} · <span className="capitalize">{p.metodo}</span>{" "}
                  <span className="text-xs text-tinta-suave">
                    {new Date(p.creado_en).toLocaleDateString("es-EC")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <b>{formatoUSD(Number(p.monto))}</b>
                  <InsigniaEstado estado={p.estado} />
                  <a href={`/api/recibo/${p.id}`} target="_blank" className="text-xs font-semibold text-primario underline">
                    recibo
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {/* Notificaciones */}
      <Tarjeta className="overflow-hidden">
        <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">🔔 Notificaciones</p>
        {(notifs ?? []).length === 0 ? (
          <p className="p-5 text-center text-sm text-tinta-suave">Sin notificaciones.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-borde/70 overflow-y-auto">
            {(notifs ?? []).map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="text-sm font-semibold">{n.titulo}</p>
                <p className="text-xs leading-relaxed text-tinta-suave">{n.cuerpo}</p>
                <p className="mt-0.5 text-[10px] text-tinta-suave/70">
                  {new Date(n.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil", dateStyle: "short", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <div className="flex items-center justify-between pt-2">
        <Link href="/terminos" className="text-xs text-tinta-suave underline">
          Términos y Reglamento
        </Link>
        <CerrarSesion className="btn-fantasma !py-2 text-xs" />
      </div>
    </main>
  );
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-tinta-suave">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
}
