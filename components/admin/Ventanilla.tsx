"use client";

// Ventanilla / recepción del co-manager:
//  · Agendar a nombre de cualquier co-med (reservas por WhatsApp/teléfono/presencial)
//  · Confirmar transferencias (con comprobante) y registrar pagos en efectivo
//  · Cancelar cualquier reserva con motivo (notifica al co-med)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { CalendarioReservas, traducirError } from "@/components/calendario/CalendarioReservas";
import { formatoRangoHora } from "@/lib/negocio/calendario";
import { formatoUSD } from "@/lib/negocio/precios";
import { Alerta, InsigniaEstado, Modal, Tarjeta, Vacio } from "@/components/ui";
import type { Espacio, MetodoPago } from "@/lib/tipos";
import type { Jornadas } from "@/lib/negocio/calendario";

interface ComedOpcion {
  id: string;
  nombre_completo: string;
  cedula: string | null;
}

interface PagoPendiente {
  id: string;
  numero_recibo: number;
  monto: number;
  metodo: string;
  comprobante_path: string | null;
  creado_en: string;
  profiles: { nombre_completo: string } | null;
  packages: { plan_id: string; horas_total: number } | null;
}

interface ReservaAdmin {
  id: string;
  fecha: string;
  hora: number;
  estado: string;
  profiles: { nombre_completo: string } | null;
}

export function Ventanilla({
  jornadas,
  espacios,
  precioTriaje,
}: {
  jornadas: Jornadas;
  espacios: Espacio[];
  precioTriaje: number;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const params = useSearchParams();
  const router = useRouter();
  const [pestania, setPestania] = useState<"agendar" | "pagos" | "reservas">(
    params.get("pagar") ? "pagos" : "agendar"
  );
  const [comeds, setComeds] = useState<ComedOpcion[]>([]);
  const [comedElegido, setComedElegido] = useState<ComedOpcion | null>(null);
  const [pagos, setPagos] = useState<PagoPendiente[]>([]);
  const [reservas, setReservas] = useState<ReservaAdmin[]>([]);
  const [cancelando, setCancelando] = useState<ReservaAdmin | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Cobro directo de reservas recién creadas desde el calendario (?pagar=ids)
  const [porCobrar, setPorCobrar] = useState<string[]>(
    params.get("pagar")?.split(",").filter(Boolean) ?? []
  );
  const [totalPorCobrar, setTotalPorCobrar] = useState(0);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id, nombre_completo, cedula")
        .eq("rol", "comed").eq("estado", "aprobado").order("nombre_completo"),
      supabase.from("payments")
        .select("id, numero_recibo, monto, metodo, comprobante_path, creado_en, profiles(nombre_completo), packages(plan_id, horas_total)")
        .eq("estado", "pendiente").order("creado_en"),
      supabase.from("reservations")
        .select("id, fecha, hora, estado, profiles(nombre_completo)")
        .gte("fecha", new Date().toISOString().slice(0, 10))
        .in("estado", ["pendiente_pago", "confirmada", "en_curso"])
        .order("fecha").order("hora").limit(60),
    ]);
    setComeds(c ?? []);
    setPagos((p as unknown as PagoPendiente[]) ?? []);
    setReservas((r as unknown as ReservaAdmin[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!porCobrar.length) return;
    supabase
      .from("reservations").select("precio").in("id", porCobrar)
      .then(({ data }) =>
        setTotalPorCobrar((data ?? []).reduce((s, r) => s + Number(r.precio), 0))
      );
  }, [porCobrar, supabase]);

  const cobrarDirecto = async (metodo: MetodoPago) => {
    setError(null);
    try {
      const { data, error: e1 } = await supabase.rpc("fn_crear_pago", {
        p_reservas: porCobrar,
        p_metodo: metodo,
      });
      if (e1) throw new Error(traducirError(e1.message));
      const pagoId = (data as { pago: string }).pago;
      const { error: e2 } = await supabase.rpc("fn_confirmar_pago", {
        p_pago: pagoId,
        p_aprobar: true,
      });
      if (e2) throw new Error(traducirError(e2.message));
      setMensaje(`Pago en ${metodo} registrado y reserva confirmada. ✅`);
      setPorCobrar([]);
      router.replace("/admin/ventanilla");
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const decidirPago = async (pagoId: string, aprobar: boolean) => {
    setError(null);
    const { error: e } = await supabase.rpc("fn_confirmar_pago", {
      p_pago: pagoId,
      p_aprobar: aprobar,
    });
    if (e) return setError(traducirError(e.message));
    setMensaje(aprobar ? "Pago confirmado ✅" : "Pago rechazado");
    cargar();
  };

  const verComprobante = async (ruta: string) => {
    const { data } = await supabase.storage.from("comprobantes").createSignedUrl(ruta, 300);
    if (data) window.open(data.signedUrl, "_blank");
  };

  const cancelarReserva = async () => {
    if (!cancelando) return;
    setError(null);
    const { error: e } = await supabase.rpc("fn_cancelar", {
      p_reserva: cancelando.id,
      p_motivo: motivo || "Cancelada por administración",
      p_penalizar: false,
    });
    if (e) return setError(traducirError(e.message));
    setCancelando(null);
    setMotivo("");
    setMensaje("Reserva cancelada; el co-med fue notificado y se le devolvió su hora.");
    cargar();
  };

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">Ventanilla</h1>

      <div className="flex rounded-xl border border-borde bg-tarjeta p-0.5 text-sm font-semibold">
        {(
          [
            ["agendar", "🗓 Agendar"],
            ["pagos", `🧾 Pagos (${pagos.length + (porCobrar.length ? 1 : 0)})`],
            ["reservas", "📋 Reservas"],
          ] as const
        ).map(([id, texto]) => (
          <button key={id} onClick={() => setPestania(id)}
            className={`flex-1 rounded-lg py-2 transition cursor-pointer ${pestania === id ? "bg-primario text-white" : "text-tinta-suave"}`}>
            {texto}
          </button>
        ))}
      </div>

      {mensaje && <Alerta tono="exito">{mensaje}</Alerta>}
      {error && <Alerta tono="peligro">{error}</Alerta>}

      {/* ===== AGENDAR ===== */}
      {pestania === "agendar" && (
        <div className="space-y-3">
          <Tarjeta className="p-4">
            <label className="etiqueta">¿A nombre de qué co-med? (WhatsApp / teléfono / presencial)</label>
            <select
              className="campo"
              value={comedElegido?.id ?? ""}
              onChange={(e) =>
                setComedElegido(comeds.find((c) => c.id === e.target.value) ?? null)
              }
            >
              <option value="">Selecciona un co-med aprobado…</option>
              {comeds.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_completo} — C.I. {c.cedula ?? "—"}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-tinta-suave">
              El reglamento exige registrar nombre y cédula. Si aún no tiene
              cuenta, pídele registrarse en la app y apruébalo primero.
            </p>
          </Tarjeta>
          {comedElegido ? (
            <div className="-mx-4">
              <CalendarioReservas
                jornadas={jornadas}
                espacios={espacios}
                precioTriaje={precioTriaje}
                paraPerfil={{ id: comedElegido.id, nombre: comedElegido.nombre_completo }}
                origen="ventanilla"
              />
            </div>
          ) : (
            <Vacio icono="👆" texto="Elige un co-med para abrir el calendario." />
          )}
        </div>
      )}

      {/* ===== PAGOS ===== */}
      {pestania === "pagos" && (
        <div className="space-y-3">
          {porCobrar.length > 0 && (
            <Tarjeta className="border-primario/40 p-4">
              <p className="text-sm font-bold">
                Cobrar reserva recién agendada · {formatoUSD(totalPorCobrar)}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => cobrarDirecto("efectivo")} className="btn-primario flex-1">💵 Efectivo</button>
                <button onClick={() => cobrarDirecto("transferencia")} className="btn-secundario flex-1">🏦 Transferencia recibida</button>
              </div>
            </Tarjeta>
          )}
          {pagos.length === 0 && porCobrar.length === 0 ? (
            <Vacio icono="🧾" texto="No hay pagos pendientes de confirmación." />
          ) : (
            pagos.map((p) => (
              <Tarjeta key={p.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {p.profiles?.nombre_completo} · {formatoUSD(Number(p.monto))}
                    </p>
                    <p className="text-xs text-tinta-suave">
                      Recibo N° {p.numero_recibo} · <span className="capitalize">{p.metodo}</span>
                      {p.packages && ` · Paquete ${p.packages.plan_id === "vip" ? "Ronda Médica VIP" : "Estancia Plus"} (${p.packages.horas_total} h)`}
                      {" · "}{new Date(p.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil", dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {p.comprobante_path && (
                      <button onClick={() => verComprobante(p.comprobante_path!)} className="btn-fantasma !py-1.5 text-xs">
                        📄 Comprobante
                      </button>
                    )}
                    <button onClick={() => decidirPago(p.id, true)} className="btn-primario !py-1.5 text-xs">Confirmar</button>
                    <button onClick={() => decidirPago(p.id, false)} className="btn-peligro !py-1.5 text-xs">Rechazar</button>
                  </div>
                </div>
              </Tarjeta>
            ))
          )}
        </div>
      )}

      {/* ===== RESERVAS ===== */}
      {pestania === "reservas" && (
        <div className="tarjeta divide-y divide-borde/70 overflow-hidden">
          {reservas.length === 0 ? (
            <Vacio texto="Sin reservas próximas." />
          ) : (
            reservas.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <b>{r.fecha}</b> {formatoRangoHora(r.hora)} · {r.profiles?.nombre_completo}
                </span>
                <span className="flex items-center gap-2">
                  <InsigniaEstado estado={r.estado} />
                  <button onClick={() => setCancelando(r)} className="btn-peligro !py-1.5 text-xs">
                    Cancelar
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal cancelar (manager, con motivo obligatorio) */}
      <Modal abierto={!!cancelando} onCerrar={() => setCancelando(null)} titulo="Cancelar reserva (administración)">
        {cancelando && (
          <div className="space-y-3">
            <p className="text-sm">
              Cancelas la reserva de <b>{cancelando.profiles?.nombre_completo}</b> del{" "}
              <b>{cancelando.fecha} {formatoRangoHora(cancelando.hora)}</b>. Se devuelve la
              hora íntegra al co-med y se le notifica con el motivo.
            </p>
            <input className="campo" placeholder="Motivo (obligatorio)" value={motivo}
              onChange={(e) => setMotivo(e.target.value)} />
            <button disabled={!motivo.trim()} onClick={cancelarReserva} className="btn-peligro w-full py-3">
              Confirmar cancelación
            </button>
          </div>
        )}
      </Modal>
    </main>
  );
}
