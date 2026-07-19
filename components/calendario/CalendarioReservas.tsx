"use client";

// Calendario de reservas VitalCowork
//  · Vistas día / semana / mes con bloques de 1 hora (lun–vie)
//  · Receso de almuerzo y feriados/bloqueos marcados
//  · Privacidad: reservas ajenas muestran solo alias + especialidad
//  · Multi-selección de bloques y reserva en máximo 3 taps
//  · Sincronización en tiempo real (Supabase Realtime)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  diasHabilesSemana,
  formatoFechaCorta,
  formatoFechaLarga,
  formatoHora,
  formatoRangoHora,
  horaActualGye,
  horasReceso,
  horasReservables,
  hoyGye,
  semanasDelMes,
  sumarDias,
  ultimoDiaDelMes,
  type Jornadas,
} from "@/lib/negocio/calendario";
import { formatoUSD } from "@/lib/negocio/precios";
import { Alerta, Modal } from "@/components/ui";
import type {
  BloqueoFeriado,
  Bloque,
  Espacio,
  OrigenReserva,
  ResumenMonedero,
  SlotCalendario,
} from "@/lib/tipos";

type Vista = "dia" | "semana" | "mes";

export function CalendarioReservas({
  jornadas,
  espacios,
  precioTriaje,
  paraPerfil,
  origen = "app",
}: {
  jornadas: Jornadas;
  espacios: Espacio[];
  precioTriaje: number;
  /** Modo ventanilla: el co-manager reserva a nombre de este co-med */
  paraPerfil?: { id: string; nombre: string };
  origen?: OrigenReserva;
}) {
  const router = useRouter();
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const hoy = hoyGye();

  const [vista, setVista] = useState<Vista>("semana");
  const [fechaBase, setFechaBase] = useState(hoy);
  const [espacioId, setEspacioId] = useState(
    espacios.find((e) => e.es_principal)?.id ?? espacios[0]?.id
  );
  const [slots, setSlots] = useState<SlotCalendario[]>([]);
  const [bloqueos, setBloqueos] = useState<BloqueoFeriado[]>([]);
  const [misIds, setMisIds] = useState<Set<string>>(new Set());
  const [habilitaciones, setHabilitaciones] = useState<{ space_id: string; fecha_inicio: string; fecha_fin: string }[]>([]);
  const [seleccion, setSeleccion] = useState<Bloque[]>([]);
  const [monedero, setMonedero] = useState<ResumenMonedero | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horas = useMemo(() => horasReservables(jornadas), [jornadas]);
  const receso = useMemo(() => horasReceso(jornadas), [jornadas]);
  const todasHoras = useMemo(
    () => [...horas, ...receso].sort((a, b) => a - b),
    [horas, receso]
  );

  // Rango visible según vista
  const rango = useMemo((): [string, string] => {
    if (vista === "dia") return [fechaBase, fechaBase];
    if (vista === "semana") {
      const dias = diasHabilesSemana(fechaBase);
      return [dias[0], dias[4]];
    }
    const [a, m] = [Number(fechaBase.slice(0, 4)), Number(fechaBase.slice(5, 7))];
    const semanas = semanasDelMes(a, m);
    return [semanas[0][0], semanas[semanas.length - 1][4]];
  }, [vista, fechaBase]);

  const cargar = useCallback(async () => {
    const [d, h] = rango;
    const [{ data: s }, { data: b }, { data: r }, { data: hab }] = await Promise.all([
      supabase.from("calendar_slots").select("*").gte("fecha", d).lte("fecha", h),
      supabase.from("holidays_blocks").select("*").gte("fecha", d).lte("fecha", h),
      supabase.from("reservations").select("id").gte("fecha", d).lte("fecha", h)
        .in("estado", ["pendiente_pago", "confirmada", "en_curso", "completada"]),
      supabase.from("space_availability").select("space_id, fecha_inicio, fecha_fin")
        .lte("fecha_inicio", h).gte("fecha_fin", d),
    ]);
    setSlots((s as SlotCalendario[]) ?? []);
    setBloqueos((b as BloqueoFeriado[]) ?? []);
    setMisIds(new Set((r ?? []).map((x: { id: string }) => x.id)));
    setHabilitaciones(hab ?? []);
  }, [rango, supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Monedero (para saber si el paquete cubre la selección)
  useEffect(() => {
    supabase
      .rpc("fn_resumen_monedero", paraPerfil ? { p_profile: paraPerfil.id } : {})
      .then(({ data }) => setMonedero(data as ResumenMonedero | null));
  }, [supabase, paraPerfil]);

  // Tiempo real: cualquier cambio en slots o bloqueos recarga el rango
  useEffect(() => {
    const canal = supabase
      .channel("calendario-tiempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_slots" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays_blocks" }, cargar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, cargar]);

  // Espacios visibles: principal siempre; satélite solo si está habilitado (o modo manager)
  const esManager = Boolean(paraPerfil);
  const espaciosVisibles = espacios.filter(
    (e) =>
      e.activo &&
      (e.reservable_publico ||
        esManager ||
        habilitaciones.some((h) => h.space_id === e.id))
  );

  const slotDe = (fecha: string, hora: number): SlotCalendario | undefined =>
    slots.find((s) => s.fecha === fecha && s.hora === hora && s.space_id === espacioId);

  const bloqueoDe = (fecha: string, hora?: number): BloqueoFeriado | undefined =>
    bloqueos.find(
      (b) =>
        b.fecha === fecha &&
        (b.space_id === null || b.space_id === espacioId) &&
        (b.hora_inicio === null ||
          (hora !== undefined && hora >= b.hora_inicio && hora < (b.hora_fin ?? 24)))
    );

  const esPasado = (fecha: string, hora: number): boolean =>
    fecha < hoy || (fecha === hoy && hora <= horaActualGye());

  const satelHabilitado = (fecha: string): boolean => {
    const esp = espacios.find((e) => e.id === espacioId);
    if (!esp || esp.reservable_publico || esManager) return true;
    return habilitaciones.some(
      (h) => h.space_id === espacioId && fecha >= h.fecha_inicio && fecha <= h.fecha_fin
    );
  };

  const estaSeleccionado = (fecha: string, hora: number) =>
    seleccion.some((s) => s.fecha === fecha && s.hora === hora);

  const alternarBloque = (fecha: string, hora: number) => {
    setError(null);
    setSeleccion((sel) =>
      estaSeleccionado(fecha, hora)
        ? sel.filter((s) => !(s.fecha === fecha && s.hora === hora))
        : [...sel, { fecha, hora }]
    );
  };

  // Cobertura del paquete
  const saldoPaquete = monedero?.paquete?.saldo ?? 0;
  const cubrePaquete = saldoPaquete >= seleccion.length && seleccion.length > 0;
  const totalIndividual = seleccion.length * precioTriaje;

  const reservar = async () => {
    setEnviando(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("fn_reservar_bloques", {
      p_bloques: seleccion,
      p_space: espacioId,
      p_usar_paquete: true,
      p_origen: origen,
      ...(paraPerfil ? { p_para: paraPerfil.id } : {}),
    });
    setEnviando(false);
    if (e) {
      setError(traducirError(e.message));
      await cargar();
      return;
    }
    const resultado = data as { reservas: string[]; estado: string; total: number };
    setConfirmando(false);
    setSeleccion([]);
    if (resultado.estado === "confirmada") {
      router.push(esManager ? "/admin/ventanilla?ok=paquete" : "/reservas?ok=paquete");
    } else if (esManager) {
      router.push(`/admin/ventanilla?pagar=${resultado.reservas.join(",")}`);
    } else {
      router.push(`/pago/nuevo?reservas=${resultado.reservas.join(",")}`);
    }
    router.refresh();
  };

  // ---------- Renderizado de una celda ----------
  const Celda = ({ fecha, hora, ancha }: { fecha: string; hora: number; ancha?: boolean }) => {
    const slot = slotDe(fecha, hora);
    const bloqueo = bloqueoDe(fecha, hora);
    const enReceso = receso.includes(hora);
    const pasado = esPasado(fecha, hora);
    const mio = slot && misIds.has(slot.reservation_id);
    const texto = ancha ? formatoRangoHora(hora) : formatoHora(hora);

    if (enReceso)
      return (
        <div className="bloque-receso" title="Receso de almuerzo">
          {ancha ? "No disponible — receso" : "receso"}
        </div>
      );
    if (bloqueo)
      return (
        <div className="bloque-bloqueado" title={bloqueo.motivo}>
          {ancha ? `Bloqueado — ${bloqueo.motivo}` : "🚫"}
        </div>
      );
    if (slot) {
      const etiqueta = ancha
        ? `${slot.alias}${slot.especialidad ? " — " + slot.especialidad : ""}`
        : slot.alias;
      if (mio)
        return (
          <div className={slot.estado === "en_curso" ? "bloque-en-curso" : "bloque-mio"} title="Tu reserva">
            {ancha ? `Tu reserva · ${texto}` : "Tuya"}
          </div>
        );
      if (slot.estado === "en_curso")
        return <div className="bloque-en-curso" title={etiqueta}>{etiqueta}</div>;
      if (slot.estado === "completada")
        return <div className="bloque-completado" title={etiqueta}>{etiqueta}</div>;
      return <div className="bloque-reservado" title={etiqueta}>{etiqueta}</div>;
    }
    if (pasado) return <div className="bloque-pasado">—</div>;
    if (!satelHabilitado(fecha))
      return <div className="bloque-bloqueado" title="Espacio no habilitado este día">·</div>;

    const sel = estaSeleccionado(fecha, hora);
    return (
      <button
        className={sel ? "bloque-seleccionado w-full" : "bloque-disponible w-full"}
        onClick={() => alternarBloque(fecha, hora)}
      >
        {sel ? "✓ " + texto : texto}
      </button>
    );
  };

  // ---------- Vistas ----------
  const diasSemana = diasHabilesSemana(fechaBase);

  const navegar = (dir: 1 | -1) => {
    setFechaBase((f) =>
      vista === "dia"
        ? sumarDias(f, dir)
        : vista === "semana"
          ? sumarDias(f, dir * 7)
          : sumarDias(ultimoDiaDelMes(f).slice(0, 8) + "01", dir === 1 ? 32 : -1).slice(0, 8) + "01"
    );
  };

  return (
    <div className="px-4">
      {/* Controles superiores */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex rounded-xl border border-borde bg-tarjeta p-0.5 text-xs font-semibold">
          {(["dia", "semana", "mes"] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-lg px-3 py-1.5 capitalize transition cursor-pointer ${
                vista === v ? "bg-primario text-white" : "text-tinta-suave"
              }`}
            >
              {v === "dia" ? "Día" : v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navegar(-1)} className="btn-fantasma !px-2.5 !py-1.5">←</button>
          <button onClick={() => setFechaBase(hoy)} className="btn-fantasma !px-2.5 !py-1.5 text-xs">Hoy</button>
          <button onClick={() => navegar(1)} className="btn-fantasma !px-2.5 !py-1.5">→</button>
        </div>
      </div>

      {/* Selector de espacio (satélite solo si está habilitado) */}
      {espaciosVisibles.length > 1 && (
        <div className="mb-3 flex gap-2">
          {espaciosVisibles.map((e) => (
            <button
              key={e.id}
              onClick={() => { setEspacioId(e.id); setSeleccion([]); }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                espacioId === e.id
                  ? "bg-primario text-white"
                  : "border border-borde bg-tarjeta text-tinta-suave"
              }`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      )}

      {error && <div className="mb-3"><Alerta tono="peligro">{error}</Alerta></div>}

      {/* ===== Vista SEMANA ===== */}
      {vista === "semana" && (
        <div className="overflow-x-auto sin-barra -mx-4 px-4">
          <div className="grid min-w-[560px] grid-cols-[44px_repeat(5,1fr)] gap-1">
            <div />
            {diasSemana.map((f) => (
              <button
                key={f}
                onClick={() => { setFechaBase(f); setVista("dia"); }}
                className={`rounded-lg py-1.5 text-center text-[11px] font-bold cursor-pointer ${
                  f === hoy ? "bg-primario text-white" : "text-tinta-suave hover:bg-primario-suave"
                }`}
              >
                {formatoFechaCorta(f)}
                {bloqueoDe(f) && <div className="text-[9px] font-normal opacity-80">feriado</div>}
              </button>
            ))}
            {todasHoras.map((h) => (
              <FilaSemana key={h} hora={h} dias={diasSemana} Celda={Celda} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Vista DÍA ===== */}
      {vista === "dia" && (
        <div>
          <p className="mb-2 text-sm font-bold capitalize">{formatoFechaLarga(fechaBase)}</p>
          {bloqueoDe(fechaBase) ? (
            <Alerta tono="alerta">
              Día no disponible: {bloqueoDe(fechaBase)!.motivo}
            </Alerta>
          ) : !["1", "2", "3", "4", "5"].includes(String(new Date(fechaBase + "T12:00:00Z").getUTCDay())) ? (
            <Alerta tono="alerta">Solo se reserva de lunes a viernes.</Alerta>
          ) : (
            <div className="space-y-1.5">
              {todasHoras.map((h) => (
                <Celda key={h} fecha={fechaBase} hora={h} ancha />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Vista MES ===== */}
      {vista === "mes" && (
        <VistaMes
          fechaBase={fechaBase}
          hoy={hoy}
          slots={slots}
          espacioId={espacioId!}
          horasTotales={horas.length}
          bloqueoDe={bloqueoDe}
          alElegirDia={(f) => { setFechaBase(f); setVista("dia"); }}
        />
      )}

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-tinta-suave">
        <Leyenda clase="border border-borde bg-tarjeta" texto="Disponible" />
        <Leyenda clase="bg-primario-suave" texto="Reservado" />
        <Leyenda clase="bg-exito-suave" texto="Tu reserva" />
        <Leyenda clase="bg-alerta-suave" texto="En curso" />
        <Leyenda clase="bloque-receso !min-h-0" texto="Receso / bloqueado" />
      </div>

      {/* Barra de selección flotante */}
      {seleccion.length > 0 && (
        <div className="fixed bottom-16 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 pb-[env(safe-area-inset-bottom)]">
          <div className="tarjeta flex items-center justify-between gap-3 border-primario/30 p-3 shadow-xl">
            <div className="text-sm">
              <b>{seleccion.length}</b> bloque{seleccion.length > 1 ? "s" : ""} ·{" "}
              {cubrePaquete ? (
                <span className="font-semibold text-exito">cubierto por tu paquete</span>
              ) : (
                <b>{formatoUSD(totalIndividual)}</b>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSeleccion([])} className="btn-fantasma !py-2 text-xs">
                Limpiar
              </button>
              <button onClick={() => setConfirmando(true)} className="btn-primario !py-2">
                Reservar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación (3er tap) */}
      <Modal abierto={confirmando} onCerrar={() => setConfirmando(false)} titulo="Confirma tu reserva">
        <div className="space-y-3">
          {paraPerfil && (
            <Alerta tono="primario">Reservando a nombre de <b>{paraPerfil.nombre}</b> (ventanilla).</Alerta>
          )}
          <ul className="space-y-1.5 text-sm">
            {[...seleccion]
              .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
              .map((s) => (
                <li key={s.fecha + s.hora} className="flex justify-between rounded-lg bg-fondo px-3 py-2">
                  <span className="capitalize">{formatoFechaCorta(s.fecha)}</span>
                  <b>{formatoRangoHora(s.hora)}</b>
                </li>
              ))}
          </ul>
          <div className="rounded-xl border border-borde p-3 text-sm">
            {cubrePaquete ? (
              <p>
                Se descontarán <b>{seleccion.length} hora(s)</b> de tu paquete
                (saldo actual: {saldoPaquete} h). Sin pago adicional. ✅
              </p>
            ) : (
              <p>
                Total a pagar: <b>{formatoUSD(totalIndividual)}</b>{" "}
                <span className="text-tinta-suave">({formatoUSD(precioTriaje)}/hora · Plan Triaje)</span>.
                Elegirás el método de pago en el siguiente paso.
              </p>
            )}
          </div>
          {error && <Alerta tono="peligro">{error}</Alerta>}
          <button onClick={reservar} disabled={enviando} className="btn-primario w-full py-3">
            {enviando ? "Reservando…" : cubrePaquete ? "Confirmar reserva" : "Confirmar y pagar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function FilaSemana({
  hora,
  dias,
  Celda,
}: {
  hora: number;
  dias: string[];
  Celda: (p: { fecha: string; hora: number; ancha?: boolean }) => React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-1 text-[10px] font-semibold text-tinta-suave">
        {formatoHora(hora)}
      </div>
      {dias.map((f) => (
        <Celda key={f + hora} fecha={f} hora={hora} />
      ))}
    </>
  );
}

function VistaMes({
  fechaBase,
  hoy,
  slots,
  espacioId,
  horasTotales,
  bloqueoDe,
  alElegirDia,
}: {
  fechaBase: string;
  hoy: string;
  slots: SlotCalendario[];
  espacioId: string;
  horasTotales: number;
  bloqueoDe: (fecha: string) => BloqueoFeriado | undefined;
  alElegirDia: (f: string) => void;
}) {
  const anio = Number(fechaBase.slice(0, 4));
  const mes = Number(fechaBase.slice(5, 7));
  const semanas = semanasDelMes(anio, mes);
  const nombreMes = new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${fechaBase.slice(0, 8)}01T12:00:00Z`));

  return (
    <div>
      <p className="mb-2 text-sm font-bold capitalize">{nombreMes}</p>
      <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-tinta-suave">
        {["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
        {semanas.flat().map((f) => {
          const delMes = f.slice(5, 7) === String(mes).padStart(2, "0");
          const ocupadas = slots.filter(
            (s) => s.fecha === f && s.space_id === espacioId &&
              ["pendiente_pago", "confirmada", "en_curso"].includes(s.estado)
          ).length;
          const bloqueado = bloqueoDe(f);
          const libres = Math.max(0, horasTotales - ocupadas);
          return (
            <button
              key={f}
              onClick={() => alElegirDia(f)}
              disabled={!delMes}
              className={`flex min-h-16 flex-col items-center justify-start gap-1 rounded-xl border p-1.5 transition cursor-pointer disabled:opacity-25 ${
                f === hoy ? "border-primario bg-primario-suave" : "border-borde bg-tarjeta hover:border-acento"
              }`}
            >
              <span className={`text-xs font-bold ${f === hoy ? "text-primario" : ""}`}>
                {Number(f.slice(8, 10))}
              </span>
              {bloqueado ? (
                <span className="text-[9px] text-peligro">🚫 {bloqueado.tipo}</span>
              ) : f >= hoy && delMes ? (
                <span className={`text-[9px] font-semibold ${libres === 0 ? "text-peligro" : "text-exito"}`}>
                  {libres === 0 ? "lleno" : `${libres} libres`}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3.5 w-3.5 rounded ${clase}`} />
      {texto}
    </span>
  );
}

export function traducirError(mensaje: string): string {
  const partes = mensaje.split(": ");
  if (mensaje.includes("BLOQUE_OCUPADO")) return partes.slice(1).join(": ") || "Ese bloque acaba de ser reservado por otro profesional.";
  if (mensaje.includes("SUSPENSION_ART9")) return partes.slice(1).join(": ");
  if (mensaje.includes("PERFIL_NO_APROBADO")) return "Tu cuenta aún no está aprobada por el administrador.";
  if (mensaje.includes("FUERA_DE_MES")) return "Con hora individual (Plan Triaje) solo puedes reservar dentro del mes en curso. Compra un paquete para reservar más adelante.";
  if (mensaje.includes("FUERA_DE_VIGENCIA")) return partes.slice(1).join(": ");
  if (mensaje.includes("FUERA_DE_TIEMPO")) return partes.slice(1).join(": ");
  if (mensaje.includes("FUERA_DE_SEMANA")) return partes.slice(1).join(": ");
  if (mensaje.includes("LIMITE_REAGENDA")) return partes.slice(1).join(": ");
  if (mensaje.includes("BLOQUE_PASADO")) return "Ese bloque ya pasó.";
  if (mensaje.includes("BLOQUE_INVALIDO")) return partes.slice(1).join(": ");
  return mensaje;
}
