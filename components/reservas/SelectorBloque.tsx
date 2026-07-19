"use client";

// Selector de bloque destino para reagendar: muestra SOLO bloques libres
// dentro de la ventana permitida (misma semana laboral para hora individual,
// vigencia del paquete para paquetes).

import { useEffect, useMemo, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  formatoFechaCorta,
  formatoRangoHora,
  horaActualGye,
  horasReservables,
  hoyGye,
  type Jornadas,
} from "@/lib/negocio/calendario";
import type { Bloque, BloqueoFeriado, SlotCalendario } from "@/lib/tipos";
import { Cargando, Vacio } from "@/components/ui";

export function SelectorBloque({
  desde,
  hasta,
  espacioId,
  jornadas,
  excluir,
  onElegir,
}: {
  desde: string;
  hasta: string;
  espacioId: string;
  jornadas: Jornadas;
  excluir?: Bloque; // el bloque actual de la reserva
  onElegir: (b: Bloque) => void;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [slots, setSlots] = useState<SlotCalendario[] | null>(null);
  const [bloqueos, setBloqueos] = useState<BloqueoFeriado[]>([]);
  const [elegido, setElegido] = useState<Bloque | null>(null);
  const hoy = hoyGye();
  const horas = horasReservables(jornadas);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("calendar_slots").select("*")
          .eq("space_id", espacioId).gte("fecha", desde).lte("fecha", hasta),
        supabase.from("holidays_blocks").select("*").gte("fecha", desde).lte("fecha", hasta),
      ]);
      setSlots((s as SlotCalendario[]) ?? []);
      setBloqueos((b as BloqueoFeriado[]) ?? []);
    })();
  }, [supabase, desde, hasta, espacioId]);

  if (!slots) return <Cargando texto="Buscando bloques libres…" />;

  // Días hábiles del rango
  const dias: string[] = [];
  for (let f = desde; f <= hasta; ) {
    const d = new Date(`${f}T12:00:00Z`).getUTCDay();
    if (d >= 1 && d <= 5 && f >= hoy) dias.push(f);
    const sig = new Date(`${f}T12:00:00Z`);
    sig.setUTCDate(sig.getUTCDate() + 1);
    f = sig.toISOString().slice(0, 10);
  }

  const disponibles = dias.flatMap((fecha) =>
    horas
      .filter((hora) => {
        if (fecha === hoy && hora <= horaActualGye()) return false;
        if (excluir && excluir.fecha === fecha && excluir.hora === hora) return false;
        const ocupado = slots.some(
          (s) => s.fecha === fecha && s.hora === hora &&
            ["pendiente_pago", "confirmada", "en_curso"].includes(s.estado)
        );
        const bloqueado = bloqueos.some(
          (b) => b.fecha === fecha && (b.space_id === null || b.space_id === espacioId) &&
            (b.hora_inicio === null || (hora >= b.hora_inicio && hora < (b.hora_fin ?? 24)))
        );
        return !ocupado && !bloqueado;
      })
      .map((hora) => ({ fecha, hora }))
  );

  if (disponibles.length === 0)
    return <Vacio icono="😕" texto="No hay bloques libres en la ventana permitida." />;

  const porDia = disponibles.reduce<Record<string, Bloque[]>>((acc, b) => {
    (acc[b.fecha] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-3 max-h-[45dvh] overflow-y-auto pr-1">
      {Object.entries(porDia).map(([fecha, bloques]) => (
        <div key={fecha}>
          <p className="mb-1.5 text-xs font-bold capitalize text-tinta-suave">
            {formatoFechaCorta(fecha)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bloques.map((b) => {
              const sel = elegido?.fecha === b.fecha && elegido?.hora === b.hora;
              return (
                <button
                  key={b.fecha + b.hora}
                  onClick={() => { setElegido(b); onElegir(b); }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    sel
                      ? "border-primario bg-primario text-white"
                      : "border-borde bg-tarjeta hover:border-acento"
                  }`}
                >
                  {formatoRangoHora(b.hora)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
