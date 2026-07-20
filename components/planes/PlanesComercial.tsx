"use client";

// Página comercial de planes: identidad visual por nivel, ahorro vs. Triaje,
// tabla comparativa y compra de paquetes (Estancia Plus / Ronda Médica VIP).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { ahorroVsTriaje, formatoUSD, precioPaquete } from "@/lib/negocio/precios";
import { Alerta, Insignia, Modal } from "@/components/ui";
import { traducirError } from "@/components/calendario/CalendarioReservas";
import type { Plan } from "@/lib/tipos";

const ICONO_NIVEL: Record<string, string> = {
  triaje: "🩺",
  estancia: "🛋️",
  vip: "⭐",
};

export function PlanesComercial({ planes }: { planes: Plan[] }) {
  const router = useRouter();
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const triaje = planes.find((p) => p.id === "triaje")!;
  const [comprando, setComprando] = useState<Plan | null>(null);
  const [horas, setHoras] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const abrirCompra = (p: Plan) => {
    setComprando(p);
    setHoras(p.min_horas_mes ?? p.min_horas_semana ?? 0);
    setError(null);
  };

  const comprar = async () => {
    if (!comprando) return;
    setOcupado(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("fn_comprar_paquete", {
      p_plan: comprando.id,
      p_horas: horas,
      p_metodo: "transferencia", // método definitivo se elige en el checkout
    });
    setOcupado(false);
    if (e) return setError(traducirError(e.message));
    const r = data as { pago: string };
    router.push(`/pago/nuevo?pago=${r.pago}`);
  };

  return (
    <div className="space-y-4 px-4">
      {planes.map((p) => {
        const esPaquete = p.min_horas_semana !== null;
        const horasEjemplo = p.min_horas_mes ?? p.min_horas_semana ?? 1;
        const ahorro = ahorroVsTriaje(p, triaje, horasEjemplo);
        return (
          <div
            key={p.id}
            className="tarjeta relative overflow-hidden p-5"
            style={{ borderColor: p.color + "55" }}
          >
            <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: p.color }} />
            {p.badge && (
              <span
                className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white"
                style={{ background: p.color }}
              >
                {p.badge}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="text-2xl">{ICONO_NIVEL[p.id] ?? "🏥"}</span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: p.color }}>
                  Nivel {p.nivel}
                </p>
                <h2 className="text-lg font-extrabold">{p.nombre}</h2>
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold">
              {formatoUSD(p.precio_hora)}
              <span className="text-sm font-semibold text-tinta-suave">/hora</span>
            </p>
            {esPaquete ? (
              <p className="text-xs text-tinta-suave">
                Desde {p.min_horas_semana} h/semana o {p.min_horas_mes} h/mes ·
                vigencia 30 días
              </p>
            ) : (
              <p className="text-xs text-tinta-suave">
                Hora individual · reserva para hoy, la semana o el mes en curso
              </p>
            )}
            <p className="mt-3 text-[13px] leading-relaxed text-tinta">{p.copy_comercial}</p>

            {esPaquete && ahorro > 0 && (
              <div className="mt-3">
                <Insignia tono={p.id === "vip" ? "oro" : "plata"}>
                  💰 Ahorras {formatoUSD(ahorro)}/mes vs. Plan Triaje ({horasEjemplo} h)
                </Insignia>
              </div>
            )}

            <div className="mt-4">
              {esPaquete ? (
                <button onClick={() => abrirCompra(p)} className="btn-primario w-full"
                  style={{ background: p.color }}>
                  Contratar {p.nombre}
                </button>
              ) : (
                <button onClick={() => router.push("/calendario")} className="btn-fantasma w-full">
                  Reservar por hora en el calendario
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* ===== Tabla comparativa ===== */}
      <div className="tarjeta overflow-hidden">
        <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">
          Comparativa de beneficios
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[12px]">
            <thead>
              <tr className="border-b border-borde text-left text-tinta-suave">
                <th className="px-4 py-2.5 font-semibold">Beneficio</th>
                {planes.map((p) => (
                  <th key={p.id} className="px-3 py-2.5 text-center font-bold" style={{ color: p.color }}>
                    {p.nivel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-b [&_tr]:border-borde/60">
              <Fila etiqueta="Precio por hora" valores={planes.map((p) => formatoUSD(p.precio_hora))} />
              <Fila etiqueta="Reserva mínima" valores={planes.map((p) => p.min_horas_semana ? `${p.min_horas_semana} h/sem · ${p.min_horas_mes} h/mes` : "1 hora")} />
              <Fila
                etiqueta="Reagendamientos por reserva"
                valores={planes.map((p) =>
                  p.reagendamientos_por_reserva === null ? "✅ Ilimitados" : String(p.reagendamientos_por_reserva)
                )}
                destacar
              />
              <Fila etiqueta="Vigencia del paquete" valores={planes.map((p) => p.min_horas_semana ? "30 días" : "—")} />
              <Fila etiqueta="Consultorio amoblado y lencería" valores={planes.map(() => "✅")} />
              <Fila etiqueta="Papelería: recetarios y órdenes de exámenes" valores={planes.map(() => "✅")} />
              <Fila etiqueta="WiFi e impresiones" valores={planes.map(() => "✅")} />
              <Fila etiqueta="Insumos: alcohol antiséptico, torundas, bajalenguas" valores={planes.map(() => "✅")} />
              <Fila etiqueta="Recompensas por derivación" valores={planes.map(() => "✅")} />
              <Fila
                etiqueta="Asistente: agendamiento, reagendamiento y confirmación de citas"
                valores={["—", "—", "⭐"]}
                destacar
              />
              <Fila etiqueta="Prioridad y acceso total" valores={["—", "—", "⭐"]} />
            </tbody>
          </table>
        </div>
      </div>

      <Alerta tono="alerta">
        <b>Importante:</b> las horas de los paquetes tienen vigencia de{" "}
        <b>30 días calendario</b> desde la contratación, se consumen solo en
        días hábiles y <b>no son acumulables</b>: el saldo no usado expira.
      </Alerta>

      {/* ===== Modal de compra ===== */}
      <Modal abierto={!!comprando} onCerrar={() => setComprando(null)}
        titulo={comprando ? `Contratar ${comprando.nombre}` : ""}>
        {comprando && (
          <div className="space-y-4">
            <div>
              <label className="etiqueta">¿Cuántas horas quieres contratar?</label>
              <div className="flex flex-wrap gap-2">
                {[comprando.min_horas_semana!, comprando.min_horas_mes!, comprando.min_horas_mes! * 2]
                  .filter((h, i, a) => a.indexOf(h) === i)
                  .map((h) => (
                    <button key={h} onClick={() => setHoras(h)}
                      className={`rounded-xl border px-4 py-2 text-sm font-bold transition cursor-pointer ${
                        horas === h ? "border-primario bg-primario text-white" : "border-borde bg-tarjeta"
                      }`}>
                      {h} h
                    </button>
                  ))}
                <input
                  type="number"
                  min={comprando.min_horas_semana!}
                  value={horas}
                  onChange={(e) => setHoras(Number(e.target.value))}
                  className="campo !w-24 text-center"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-tinta-suave">
                Mínimo {comprando.min_horas_semana} horas.
              </p>
            </div>
            <div className="rounded-xl bg-fondo p-4 text-sm">
              <div className="flex justify-between"><span>{horas} h × {formatoUSD(comprando.precio_hora)}</span>
                <b>{formatoUSD(precioPaquete(comprando, horas))}</b></div>
              <div className="mt-1 flex justify-between text-exito text-xs">
                <span>Ahorro vs. Plan Triaje</span>
                <b>{formatoUSD(ahorroVsTriaje(comprando, triaje, horas))}</b>
              </div>
            </div>
            <Alerta tono="alerta">
              Vigencia: 30 días desde la confirmación del pago. El saldo no
              usado <b>expira</b> (no acumulable).
            </Alerta>
            {error && <Alerta tono="peligro">{error}</Alerta>}
            <button
              disabled={ocupado || horas < (comprando.min_horas_semana ?? 1)}
              onClick={comprar}
              className="btn-primario w-full py-3"
            >
              {ocupado ? "Creando orden…" : `Continuar al pago · ${formatoUSD(precioPaquete(comprando, horas))}`}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Fila({ etiqueta, valores, destacar }: { etiqueta: string; valores: string[]; destacar?: boolean }) {
  return (
    <tr className={destacar ? "bg-primario-suave/40" : ""}>
      <td className="font-semibold">{etiqueta}</td>
      {valores.map((v, i) => (
        <td key={i} className="text-center">{v}</td>
      ))}
    </tr>
  );
}
