"use client";

// Modo kiosco / recepción: agenda del día con check-in / check-out forzado,
// countdown de gracia en vivo y actualización en tiempo real.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  formatoRangoHora,
  hoyGye,
  inicioBloque,
} from "@/lib/negocio/calendario";
import { Alerta, InsigniaEstado, LogoVital } from "@/components/ui";
import { traducirError } from "@/components/calendario/CalendarioReservas";

interface FilaKiosco {
  id: string;
  hora: number;
  estado: string;
  fecha: string;
  es_hora_extra: boolean;
  profiles: { nombre_completo: string; telefono: string | null; alias: string } | null;
  spaces: { nombre: string } | null;
  sessions: { checkin_at: string; checkout_at: string | null } | null;
}

export function PanelKiosco({ graciaMinutos }: { graciaMinutos: number }) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [filas, setFilas] = useState<FilaKiosco[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloj, setReloj] = useState(new Date());
  const hoy = hoyGye();

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("reservations")
      .select("id, hora, estado, fecha, es_hora_extra, profiles(nombre_completo, telefono, alias), spaces(nombre), sessions(checkin_at, checkout_at)")
      .eq("fecha", hoyGye())
      .in("estado", ["pendiente_pago", "confirmada", "en_curso", "completada", "no_show"])
      .order("hora");
    setFilas((data as unknown as FilaKiosco[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel("kiosco")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, cargar)
      .subscribe();
    const t = setInterval(() => setReloj(new Date()), 15_000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(t);
    };
  }, [supabase, cargar]);

  const accion = async (fn: "fn_checkin" | "fn_checkout" | "fn_marcar_no_show", id: string) => {
    setError(null);
    const args = fn === "fn_marcar_no_show"
      ? { p_reserva: id }
      : { p_reserva: id, p_dispositivo: "kiosco" };
    const { error: e } = await supabase.rpc(fn, args);
    if (e) setError(traducirError(e.message));
    cargar();
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-6 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoVital tam="text-2xl" />
          <span className="rounded-full bg-primario-suave px-3 py-1 text-xs font-bold text-primario-oscuro">
            MODO RECEPCIÓN
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-tinta-suave">
            {reloj.toLocaleString("es-EC", {
              timeZone: "America/Guayaquil",
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <Link href="/admin" className="btn-fantasma !py-1.5 text-xs">Panel admin</Link>
        </div>
      </header>

      {error && <div className="mb-4"><Alerta tono="peligro">{error}</Alerta></div>}

      {filas.length === 0 ? (
        <div className="py-24 text-center text-tinta-suave">
          <div className="text-5xl">🗓️</div>
          <p className="mt-3">No hay reservas para hoy.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filas.map((f) => {
            const inicio = inicioBloque(f.fecha, f.hora);
            const fin = new Date(inicio.getTime() + 3600_000);
            const finGracia = new Date(fin.getTime() + graciaMinutos * 60_000);
            const enCurso = f.estado === "en_curso";
            const msFin = fin.getTime() - reloj.getTime();
            const msGracia = finGracia.getTime() - reloj.getTime();
            const pasoInicio = reloj >= inicio;
            return (
              <div key={f.id} className={`tarjeta p-4 ${enCurso ? "border-alerta/50" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-extrabold text-primario">{formatoRangoHora(f.hora)}</p>
                    <p className="text-sm font-bold">{f.profiles?.nombre_completo ?? f.profiles?.alias}</p>
                    <p className="text-xs text-tinta-suave">
                      {f.spaces?.nombre}
                      {f.profiles?.telefono && ` · ${f.profiles.telefono}`}
                      {f.es_hora_extra && " · hora extra"}
                    </p>
                  </div>
                  <InsigniaEstado estado={f.estado} />
                </div>

                {enCurso && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${
                    msFin > 0 ? "bg-primario-suave text-primario-oscuro"
                    : msGracia > 0 ? "bg-alerta-suave text-alerta animate-pulse"
                    : "bg-peligro-suave text-peligro animate-pulse"
                  }`}>
                    {msFin > 0
                      ? `⏱ ${Math.ceil(msFin / 60000)} min restantes`
                      : msGracia > 0
                        ? `⚠ Gracia: ${Math.ceil(msGracia / 60000)} min (Art. 9)`
                        : "🚨 Excedido: aplicar hora adicional al finalizar"}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {f.estado === "confirmada" && (
                    <>
                      <button onClick={() => accion("fn_checkin", f.id)} className="btn-primario !py-2 text-xs">
                        ▶ Iniciar uso
                      </button>
                      {pasoInicio && (
                        <button onClick={() => accion("fn_marcar_no_show", f.id)} className="btn-peligro !py-2 text-xs">
                          Marcar inasistencia
                        </button>
                      )}
                    </>
                  )}
                  {enCurso && (
                    <button onClick={() => accion("fn_checkout", f.id)} className="btn-primario !py-2 text-xs">
                      ⏹ Finalizar uso
                    </button>
                  )}
                  {f.estado === "pendiente_pago" && (
                    <Link href="/admin/ventanilla" className="btn-secundario !py-2 text-xs">
                      💵 Registrar pago
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="mt-8 text-center">
        <a
          href={`/api/export/sesiones?desde=${hoy.slice(0, 8)}01&hasta=${hoy}`}
          className="text-xs font-semibold text-primario underline"
        >
          Descargar historial de sesiones del mes (CSV)
        </a>
      </footer>
    </main>
  );
}
