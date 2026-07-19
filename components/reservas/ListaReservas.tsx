"use client";

// Mis reservas: reagendar (según plan), cancelar (Art. 4 con vista previa de
// penalización) y check-in / check-out con countdown y minutos de gracia (Art. 9).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  formatoFechaLarga,
  formatoRangoHora,
  inicioBloque,
  lunesDeSemana,
  sumarDias,
  hoyGye,
  type Jornadas,
} from "@/lib/negocio/calendario";
import { calcularPenalizacion, formatoUSD } from "@/lib/negocio/precios";
import { Alerta, Cargando, InsigniaEstado, Modal, Vacio } from "@/components/ui";
import { SelectorBloque } from "@/components/reservas/SelectorBloque";
import { traducirError } from "@/components/calendario/CalendarioReservas";
import type { Bloque, Reserva } from "@/lib/tipos";

type ReservaExt = Reserva & {
  packages: { inicio: string | null; fin: string | null } | null;
  plans: { reagendamientos_por_reserva: number | null; nombre: string } | null;
};

export function ListaReservas({
  anticipacionHoras,
  graciaMinutos,
  jornadas,
  pctPenalizacion24h,
}: {
  anticipacionHoras: number;
  graciaMinutos: number;
  jornadas: Jornadas;
  pctPenalizacion24h: number;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const router = useRouter();
  const params = useSearchParams();
  const [reservas, setReservas] = useState<ReservaExt[] | null>(null);
  const [pestania, setPestania] = useState<"proximas" | "historial">("proximas");
  const [reagendando, setReagendando] = useState<ReservaExt | null>(null);
  const [cancelando, setCancelando] = useState<ReservaExt | null>(null);
  const [destino, setDestino] = useState<Bloque | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultadoCheckout, setResultadoCheckout] = useState<string | null>(null);
  const [, setTic] = useState(0);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("reservations")
      .select("*, packages(inicio, fin), plans(reagendamientos_por_reserva, nombre)")
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false })
      .limit(120);
    setReservas((data as ReservaExt[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel("mis-reservas")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, cargar)
      .subscribe();
    const t = setInterval(() => setTic((x) => x + 1), 30_000); // refresco del countdown
    return () => {
      supabase.removeChannel(canal);
      clearInterval(t);
    };
  }, [supabase, cargar]);

  if (!reservas) return <Cargando texto="Cargando tus reservas…" />;

  const ahora = new Date();
  const hoy = hoyGye();
  const activas = ["pendiente_pago", "confirmada", "en_curso"];
  const proximas = reservas
    .filter((r) => activas.includes(r.estado) && (r.fecha > hoy || (r.fecha === hoy && !["completada"].includes(r.estado))))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const historial = reservas.filter((r) => !proximas.includes(r));
  const lista = pestania === "proximas" ? proximas : historial;

  // -------- acciones --------
  const ejecutarReagenda = async () => {
    if (!reagendando || !destino) return;
    setOcupado(true);
    setError(null);
    const { error: e } = await supabase.rpc("fn_reagendar", {
      p_reserva: reagendando.id,
      p_fecha: destino.fecha,
      p_hora: destino.hora,
    });
    setOcupado(false);
    if (e) return setError(traducirError(e.message));
    setReagendando(null);
    setDestino(null);
    cargar();
  };

  const ejecutarCancelacion = async () => {
    if (!cancelando) return;
    setOcupado(true);
    setError(null);
    const { error: e } = await supabase.rpc("fn_cancelar", {
      p_reserva: cancelando.id,
      p_motivo: motivo || null,
    });
    setOcupado(false);
    if (e) return setError(traducirError(e.message));
    setCancelando(null);
    setMotivo("");
    cargar();
  };

  const checkin = async (r: ReservaExt) => {
    setError(null);
    const { error: e } = await supabase.rpc("fn_checkin", { p_reserva: r.id, p_dispositivo: "app" });
    if (e) setError(traducirError(e.message));
    cargar();
  };

  const checkout = async (r: ReservaExt) => {
    setError(null);
    const { data, error: e } = await supabase.rpc("fn_checkout", { p_reserva: r.id, p_dispositivo: "app" });
    if (e) return setError(traducirError(e.message));
    const res = data as { exceso_min: number; hora_extra: boolean; siguiente_ocupada: boolean };
    if (res.hora_extra) {
      setResultadoCheckout(
        `Excediste tu hora por ${res.exceso_min} minutos (más de ${graciaMinutos} de gracia). Se cobró una hora adicional según el Art. 9 del reglamento.`
      );
    } else if (res.siguiente_ocupada) {
      setResultadoCheckout(
        "⚠ Excediste tu hora y la siguiente franja está reservada por otro profesional. El administrador fue alertado."
      );
    } else if (res.exceso_min > 0) {
      setResultadoCheckout(`Sesión finalizada con ${res.exceso_min} min de exceso (dentro de la gracia). ¡Gracias!`);
    } else {
      setResultadoCheckout("Sesión finalizada a tiempo. ¡Gracias! ✅");
    }
    cargar();
  };

  // Ventana de reagendamiento del bloque destino
  const ventanaReagenda = (r: ReservaExt): [string, string] => {
    if (r.package_id && r.packages?.fin) {
      return [hoy, r.packages.fin];
    }
    const lunes = lunesDeSemana(r.fecha);
    return [lunes > hoy ? lunes : hoy, sumarDias(lunes, 4)];
  };

  return (
    <div className="px-4">
      {params.get("ok") === "paquete" && (
        <div className="mb-3"><Alerta tono="exito">¡Reserva confirmada con tu paquete! 🎉</Alerta></div>
      )}
      {error && <div className="mb-3"><Alerta tono="peligro">{error}</Alerta></div>}

      <div className="mb-4 flex rounded-xl border border-borde bg-tarjeta p-0.5 text-sm font-semibold">
        {(["proximas", "historial"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPestania(p)}
            className={`flex-1 rounded-lg py-2 transition cursor-pointer ${
              pestania === p ? "bg-primario text-white" : "text-tinta-suave"
            }`}
          >
            {p === "proximas" ? `Próximas (${proximas.length})` : "Historial"}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Vacio texto={pestania === "proximas" ? "No tienes reservas próximas. ¡Reserva tu espacio desde el calendario!" : "Aún no hay historial."} />
      ) : (
        <div className="space-y-3">
          {lista.map((r) => {
            const inicio = inicioBloque(r.fecha, r.hora);
            const fin = new Date(inicio.getTime() + 3600_000);
            const finConGracia = new Date(fin.getTime() + graciaMinutos * 60_000);
            const puedeCheckin =
              r.estado === "confirmada" &&
              r.fecha === hoy &&
              ahora >= new Date(inicio.getTime() - 15 * 60_000) &&
              ahora <= fin;
            const enCurso = r.estado === "en_curso";
            const msParaFin = fin.getTime() - ahora.getTime();
            const msParaGracia = finConGracia.getTime() - ahora.getTime();
            const reagendable =
              activas.includes(r.estado) &&
              inicio.getTime() - ahora.getTime() >= anticipacionHoras * 3600_000;
            const limite = r.plans?.reagendamientos_por_reserva ?? null;
            const agotoReagendas = limite !== null && r.reagendamientos >= limite;
            const cancelable = activas.includes(r.estado) && inicio > ahora;

            return (
              <div key={r.id} className="tarjeta p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold capitalize">{formatoFechaLarga(r.fecha)}</p>
                    <p className="text-lg font-extrabold text-primario">{formatoRangoHora(r.hora)}</p>
                    <p className="text-xs text-tinta-suave">
                      {r.plans?.nombre ?? "Plan Triaje"}
                      {r.es_hora_extra && " · hora extra (Art. 9)"}
                      {r.package_id ? " · paquete" : ` · ${formatoUSD(r.precio)}`}
                    </p>
                  </div>
                  <InsigniaEstado estado={r.estado} />
                </div>

                {/* Countdown en sesión */}
                {enCurso && (
                  <div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${
                    msParaFin > 0 ? "bg-primario-suave text-primario-oscuro"
                    : msParaGracia > 0 ? "bg-alerta-suave text-alerta animate-pulse"
                    : "bg-peligro-suave text-peligro animate-pulse"
                  }`}>
                    {msParaFin > 0
                      ? `⏱ Sesión en curso · quedan ${minutos(msParaFin)} min`
                      : msParaGracia > 0
                        ? `⚠ Tiempo excedido · ${minutos(msParaGracia)} min de gracia restantes`
                        : "🚨 Gracia agotada: se cobrará una hora adicional (Art. 9)"}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {puedeCheckin && (
                    <button onClick={() => checkin(r)} className="btn-primario !py-2 text-xs">
                      ▶ Iniciar uso
                    </button>
                  )}
                  {enCurso && (
                    <button onClick={() => checkout(r)} className="btn-primario !py-2 text-xs">
                      ⏹ Finalizar uso
                    </button>
                  )}
                  {activas.includes(r.estado) && !enCurso && (
                    <>
                      <button
                        disabled={!reagendable || agotoReagendas}
                        title={
                          !reagendable
                            ? `El reagendamiento se desactiva a menos de ${anticipacionHoras}h de la cita`
                            : agotoReagendas
                              ? `Tu plan permite ${limite} reagendamiento(s) por reserva`
                              : ""
                        }
                        onClick={() => { setReagendando(r); setDestino(null); setError(null); }}
                        className="btn-secundario !py-2 text-xs"
                      >
                        ↻ Reagendar{limite !== null ? ` (${r.reagendamientos}/${limite})` : ""}
                      </button>
                      <button
                        disabled={!cancelable}
                        onClick={() => { setCancelando(r); setError(null); }}
                        className="btn-peligro !py-2 text-xs"
                      >
                        ✕ Cancelar
                      </button>
                    </>
                  )}
                  {r.estado === "pendiente_pago" && !r.pago_id && (
                    <button
                      onClick={() => router.push(`/pago/nuevo?reservas=${r.id}`)}
                      className="btn-primario !py-2 text-xs"
                    >
                      💳 Pagar
                    </button>
                  )}
                </div>
                {agotoReagendas && activas.includes(r.estado) && (
                  <p className="mt-2 text-[11px] text-tinta-suave">
                    💡 Con <b>Estancia Plus</b> o <b>Ronda Médica VIP</b> los reagendamientos son ilimitados.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Modal reagendar ===== */}
      <Modal
        abierto={!!reagendando}
        onCerrar={() => setReagendando(null)}
        titulo="Reagendar reserva"
      >
        {reagendando && (
          <div className="space-y-3">
            <Alerta tono="primario">
              Mueves tu hora del <b className="capitalize">{formatoFechaLarga(reagendando.fecha)} {formatoRangoHora(reagendando.hora)}</b>{" "}
              sin costo. {reagendando.package_id
                ? "El nuevo bloque debe estar dentro de la vigencia de tu paquete."
                : "Con hora individual, el nuevo bloque debe caer en la misma semana laboral."}
            </Alerta>
            <SelectorBloque
              desde={ventanaReagenda(reagendando)[0]}
              hasta={ventanaReagenda(reagendando)[1]}
              espacioId={reagendando.space_id}
              jornadas={jornadas}
              excluir={{ fecha: reagendando.fecha, hora: reagendando.hora }}
              onElegir={setDestino}
            />
            {error && <Alerta tono="peligro">{error}</Alerta>}
            <button
              disabled={!destino || ocupado}
              onClick={ejecutarReagenda}
              className="btn-primario w-full py-3"
            >
              {ocupado
                ? "Reagendando…"
                : destino
                  ? `Confirmar: ${formatoFechaLarga(destino.fecha)} ${formatoRangoHora(destino.hora)}`
                  : "Elige el nuevo bloque"}
            </button>
          </div>
        )}
      </Modal>

      {/* ===== Modal cancelar ===== */}
      <Modal abierto={!!cancelando} onCerrar={() => setCancelando(null)} titulo="Cancelar reserva">
        {cancelando && (() => {
          const pen = calcularPenalizacion(
            inicioBloque(cancelando.fecha, cancelando.hora),
            new Date(),
            { pctDentro24h: pctPenalizacion24h }
          );
          return (
            <div className="space-y-3">
              {pen.pct === 0 ? (
                <Alerta tono="exito">
                  Cancelas con más de 24 horas de anticipación: <b>sin costo</b>.
                  {cancelando.estado === "confirmada" && " La hora vuelve íntegra a tu monedero."}
                </Alerta>
              ) : (
                <Alerta tono="alerta">
                  Estás cancelando dentro de las 24 horas previas. Según el{" "}
                  <b>Art. 4 del reglamento</b> se aplica una penalización del{" "}
                  <b>{Math.round(pen.pct * 100)}%</b> del valor de la hora
                  {cancelando.estado === "confirmada"
                    ? ` (se devuelve ${pen.horasDevueltas} h a tu monedero).`
                    : "."}
                </Alerta>
              )}
              <div>
                <label className="etiqueta">Motivo (opcional)</label>
                <input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: mi paciente reprogramó" />
              </div>
              {error && <Alerta tono="peligro">{error}</Alerta>}
              <button onClick={ejecutarCancelacion} disabled={ocupado} className="btn-peligro w-full py-3">
                {ocupado ? "Cancelando…" : "Confirmar cancelación"}
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* ===== Resultado de checkout ===== */}
      <Modal abierto={!!resultadoCheckout} onCerrar={() => setResultadoCheckout(null)} titulo="Sesión finalizada">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{resultadoCheckout}</p>
          <button onClick={() => setResultadoCheckout(null)} className="btn-primario w-full">
            Entendido
          </button>
        </div>
      </Modal>
    </div>
  );
}

function minutos(ms: number): number {
  return Math.max(0, Math.ceil(ms / 60_000));
}
