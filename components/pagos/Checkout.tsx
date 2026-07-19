"use client";

// Checkout: tarjeta vía Payphone, transferencia bancaria con comprobante,
// o (solo recepción) efectivo. Genera el pago en servidor con monto calculado allí.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoUSD } from "@/lib/negocio/precios";
import { formatoFechaCorta, formatoRangoHora } from "@/lib/negocio/calendario";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { Alerta, Cargando, Tarjeta } from "@/components/ui";
import { traducirError } from "@/components/calendario/CalendarioReservas";

interface Banco {
  banco: string;
  tipo: string;
  numero: string;
  titular: string;
  cedula_ruc: string;
}

export function Checkout({
  bancos,
  whatsapp,
  payphoneDisponible,
}: {
  bancos: Banco[];
  whatsapp: string;
  payphoneDisponible: boolean;
}) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const router = useRouter();
  const params = useSearchParams();
  const idsReservas = params.get("reservas")?.split(",").filter(Boolean) ?? [];
  const pagoParam = params.get("pago");

  const [detalle, setDetalle] = useState<{
    total: number;
    lineas: { texto: string; monto: number }[];
    pagoId: string | null;
  } | null>(null);
  const [metodo, setMetodo] = useState<"payphone" | "transferencia" | null>(null);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [transferenciaLista, setTransferenciaLista] = useState<number | null>(null); // numero_recibo
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (pagoParam) {
        const { data: pago } = await supabase
          .from("payments")
          .select("id, monto, estado, package_id, numero_recibo, comprobante_path, packages(plan_id, horas_total)")
          .eq("id", pagoParam)
          .maybeSingle();
        if (!pago) return setError("Pago no encontrado.");
        if (pago.estado !== "pendiente") return router.replace(`/pago/exito?pago=${pago.id}`);
        const pk = pago.packages as unknown as { plan_id: string; horas_total: number } | null;

        // Detalle: reservas asociadas a este pago (si no es un paquete)
        let lineas: { texto: string; monto: number }[];
        if (pk) {
          lineas = [{
            texto: `Paquete ${pk.plan_id === "vip" ? "Ronda Médica VIP" : "Estancia Plus"} · ${pk.horas_total} horas`,
            monto: Number(pago.monto),
          }];
        } else {
          const { data: reservasPago } = await supabase
            .from("reservations")
            .select("fecha, hora, precio")
            .eq("pago_id", pago.id)
            .order("fecha");
          lineas = (reservasPago ?? []).map((r) => ({
            texto: `${formatoFechaCorta(r.fecha)} · ${formatoRangoHora(r.hora)}`,
            monto: Number(r.precio),
          }));
          if (!lineas.length) lineas = [{ texto: "Pago pendiente", monto: Number(pago.monto) }];
        }
        setDetalle({ total: Number(pago.monto), pagoId: pago.id, lineas });

        // Transferencia con comprobante ya enviado: mostrar estado, no re-cobrar
        if (pago.comprobante_path) setTransferenciaLista(pago.numero_recibo);
      } else if (idsReservas.length) {
        const { data: reservas } = await supabase
          .from("reservations")
          .select("id, fecha, hora, precio, estado")
          .in("id", idsReservas);
        const pendientes = (reservas ?? []).filter((r) => r.estado === "pendiente_pago");
        if (!pendientes.length) return setError("No hay reservas pendientes de pago.");
        setDetalle({
          total: pendientes.reduce((s, r) => s + Number(r.precio), 0),
          pagoId: null,
          lineas: pendientes.map((r) => ({
            texto: `${formatoFechaCorta(r.fecha)} · ${formatoRangoHora(r.hora)}`,
            monto: Number(r.precio),
          })),
        });
      } else {
        setError("Nada que pagar.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Garantiza que exista el registro de pago con el método elegido */
  const asegurarPago = async (m: "payphone" | "transferencia"): Promise<string> => {
    if (detalle?.pagoId) {
      await supabase.from("payments").update({ metodo: m }).eq("id", detalle.pagoId);
      return detalle.pagoId;
    }
    const { data, error: e } = await supabase.rpc("fn_crear_pago", {
      p_reservas: idsReservas,
      p_metodo: m,
    });
    if (e) throw new Error(traducirError(e.message));
    const r = data as { pago: string };
    setDetalle((d) => (d ? { ...d, pagoId: r.pago } : d));
    return r.pago;
  };

  const pagarConPayphone = async () => {
    setOcupado(true);
    setError(null);
    try {
      const pagoId = await asegurarPago("payphone");
      const res = await fetch("/api/payphone/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagoId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo iniciar el pago con tarjeta.");
      window.location.href = j.url; // → Payphone
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setOcupado(false);
    }
  };

  const enviarTransferencia = async () => {
    if (!comprobante) return setError("Adjunta el comprobante de tu transferencia.");
    setOcupado(true);
    setError(null);
    try {
      const pagoId = await asegurarPago("transferencia");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ext = comprobante.name.split(".").pop() ?? "jpg";
      const ruta = `${user!.id}/${pagoId}.${ext}`;
      const { error: es } = await supabase.storage
        .from("comprobantes")
        .upload(ruta, comprobante, { upsert: true });
      if (es) throw new Error(es.message);
      await supabase.from("payments").update({ comprobante_path: ruta }).eq("id", pagoId);
      const { data: pago } = await supabase
        .from("payments").select("numero_recibo").eq("id", pagoId).single();
      setTransferenciaLista(pago?.numero_recibo ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
    setOcupado(false);
  };

  if (error && !detalle) return <div className="px-4"><Alerta tono="peligro">{error}</Alerta></div>;
  if (!detalle) return <Cargando texto="Preparando tu pago…" />;

  // ---------- Pantalla de éxito de transferencia ----------
  if (transferenciaLista !== null) {
    return (
      <div className="space-y-4 px-4">
        <Tarjeta className="p-6 text-center">
          <div className="text-4xl">🧾</div>
          <h2 className="mt-3 text-lg font-bold">Comprobante recibido</h2>
          <p className="mt-2 text-sm leading-relaxed text-tinta-suave">
            Tu reserva queda <b>pendiente de confirmación</b> hasta que el
            administrador verifique la transferencia (recibirás una
            notificación). Referencia de pago: <b>N° {transferenciaLista}</b>.
          </p>
        </Tarjeta>
        <a
          href={enlaceWhatsApp(whatsapp, {
            tipo: "pago_transferencia",
            numeroReserva: String(transferenciaLista),
            monto: detalle.total,
          })}
          target="_blank"
          className="btn-primario w-full !bg-[#25D366] py-3"
        >
          Avisar por WhatsApp para agilizar ✓
        </a>
        <button onClick={() => router.push("/reservas")} className="btn-fantasma w-full">
          Ver mis reservas
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4">
      {/* Resumen */}
      <Tarjeta className="p-4">
        <p className="mb-2 text-sm font-bold">Resumen</p>
        <ul className="space-y-1 text-sm">
          {detalle.lineas.map((l, i) => (
            <li key={i} className="flex justify-between capitalize">
              <span>{l.texto}</span>
              <span>{formatoUSD(l.monto)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-borde pt-3 text-base font-extrabold">
          <span>Total</span>
          <span>{formatoUSD(detalle.total)}</span>
        </div>
      </Tarjeta>

      {error && <Alerta tono="peligro">{error}</Alerta>}

      {/* Métodos */}
      <div className="space-y-2.5">
        <button
          onClick={() => { setMetodo("payphone"); if (payphoneDisponible) pagarConPayphone(); }}
          disabled={ocupado}
          className={`tarjeta w-full p-4 text-left transition hover:border-acento cursor-pointer ${metodo === "payphone" ? "border-primario" : ""}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div className="flex-1">
              <p className="text-sm font-bold">Tarjeta de crédito o débito</p>
              <p className="text-xs text-tinta-suave">Pago inmediato y seguro vía Payphone</p>
            </div>
            {ocupado && metodo === "payphone" && <span className="text-xs">…</span>}
          </div>
          {metodo === "payphone" && !payphoneDisponible && (
            <div className="mt-3">
              <Alerta tono="alerta">
                Payphone aún no está configurado en este entorno. Usa
                transferencia bancaria o pago en ventanilla.
              </Alerta>
            </div>
          )}
        </button>

        <div
          className={`tarjeta w-full p-4 transition ${metodo === "transferencia" ? "border-primario" : "hover:border-acento"}`}
        >
          <button className="flex w-full items-center gap-3 text-left cursor-pointer" onClick={() => setMetodo("transferencia")}>
            <span className="text-2xl">🏦</span>
            <div>
              <p className="text-sm font-bold">Transferencia bancaria</p>
              <p className="text-xs text-tinta-suave">
                Sube tu comprobante; el administrador confirma tu reserva
              </p>
            </div>
          </button>
          {metodo === "transferencia" && (
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                {bancos.map((b) => (
                  <div key={b.banco} className="rounded-xl bg-fondo p-3 text-xs">
                    <p className="font-bold">{b.banco} · {b.tipo}</p>
                    <p>N° {b.numero}</p>
                    <p className="text-tinta-suave">{b.titular} · {b.cedula_ruc}</p>
                  </div>
                ))}
              </div>
              <div>
                <label className="etiqueta">Comprobante (foto o PDF) *</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="campo"
                  onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
                />
              </div>
              <button onClick={enviarTransferencia} disabled={ocupado} className="btn-primario w-full py-3">
                {ocupado ? "Enviando…" : `Enviar comprobante · ${formatoUSD(detalle.total)}`}
              </button>
            </div>
          )}
        </div>

        <div className="tarjeta p-4 opacity-80">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💵</span>
            <div>
              <p className="text-sm font-bold">Efectivo en ventanilla</p>
              <p className="text-xs text-tinta-suave">
                Puedes pagar en recepción antes o después de tu hora reservada;
                el personal registrará tu pago.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
