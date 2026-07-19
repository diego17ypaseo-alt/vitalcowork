"use client";

// Ficha completa del co-med (solo co-manager): datos, acreditación,
// tensiómetro de saldo, calificación interna, historial y ajustes.

import { useCallback, useEffect, useMemo, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoRangoHora } from "@/lib/negocio/calendario";
import { formatoUSD } from "@/lib/negocio/precios";
import { Tensiometro } from "@/components/tensiometro/Tensiometro";
import { Alerta, Cargando, Estrellas, InsigniaEstado, Tarjeta } from "@/components/ui";
import type { ResumenMonedero } from "@/lib/tipos";

interface Datos {
  perfil: {
    id: string; nombre_completo: string; cedula: string | null; alias: string;
    email: string; telefono: string | null; estado: string;
    reincidencias_excedente: number; suspension_proxima_reserva: boolean;
    creado_en: string;
    specialties: { nombre: string } | null;
  };
  acreditaciones: { id: string; tipo: string; numero: string; estado: string; documento_path: string | null }[];
  reservas: { id: string; fecha: string; hora: number; estado: string; precio: number; reagendamientos: number; es_hora_extra: boolean }[];
  pagos: { id: string; numero_recibo: number; monto: number; metodo: string; estado: string; creado_en: string }[];
  rating: { estrellas: number; notas: string | null } | null;
  monedero: ResumenMonedero | null;
}

export function FichaComed({ comedId }: { comedId: string }) {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [d, setD] = useState<Datos | null>(null);
  const [estrellas, setEstrellas] = useState(0);
  const [notas, setNotas] = useState("");
  const [ajuste, setAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: perfil }, { data: acred }, { data: reservas }, { data: pagos }, { data: rating }, { data: monedero }] =
      await Promise.all([
        supabase.from("profiles")
          .select("id, nombre_completo, cedula, alias, email, telefono, estado, reincidencias_excedente, suspension_proxima_reserva, creado_en, specialties(nombre)")
          .eq("id", comedId).single(),
        supabase.from("accreditations").select("id, tipo, numero, estado, documento_path").eq("profile_id", comedId),
        supabase.from("reservations")
          .select("id, fecha, hora, estado, precio, reagendamientos, es_hora_extra")
          .eq("profile_id", comedId).order("fecha", { ascending: false }).limit(30),
        supabase.from("payments")
          .select("id, numero_recibo, monto, metodo, estado, creado_en")
          .eq("profile_id", comedId).order("creado_en", { ascending: false }).limit(20),
        supabase.from("ratings").select("estrellas, notas").eq("profile_id", comedId).maybeSingle(),
        supabase.rpc("fn_resumen_monedero", { p_profile: comedId }),
      ]);
    setD({
      perfil: perfil as unknown as Datos["perfil"],
      acreditaciones: acred ?? [],
      reservas: reservas ?? [],
      pagos: pagos ?? [],
      rating: rating ?? null,
      monedero: (monedero as ResumenMonedero) ?? null,
    });
    if (rating) {
      setEstrellas(rating.estrellas);
      setNotas(rating.notas ?? "");
    }
  }, [supabase, comedId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!d) return <Cargando texto="Cargando ficha…" />;
  const totalReagendas = d.reservas.reduce((s, r) => s + r.reagendamientos, 0);

  const guardarRating = async () => {
    setError(null);
    setMensaje(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("ratings").upsert(
      {
        profile_id: comedId,
        estrellas: estrellas || 1,
        notas,
        creado_por: user!.id,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );
    if (e) return setError(e.message);
    setMensaje("Calificación guardada (visible solo para ti).");
  };

  const aplicarAjuste = async () => {
    setError(null);
    setMensaje(null);
    const horas = Number(ajuste);
    if (!horas || !motivoAjuste.trim())
      return setError("Indica horas (± ) y un motivo para el ajuste.");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("wallet_ledger").insert({
      profile_id: comedId,
      delta_horas: horas,
      origen: "ajuste_manual",
      descripcion: motivoAjuste,
      creado_por: user!.id,
    });
    if (e) return setError(e.message);
    setAjuste("");
    setMotivoAjuste("");
    setMensaje("Ajuste aplicado al monedero.");
    cargar();
  };

  const cambiarEstado = async (estado: "aprobado" | "suspendido") => {
    setError(null);
    const { error: e } = await supabase.from("profiles").update({ estado }).eq("id", comedId);
    if (e) return setError(e.message);
    cargar();
  };

  const verDocumento = async (ruta: string) => {
    const { data } = await supabase.storage.from("acreditaciones").createSignedUrl(ruta, 300);
    if (data) window.open(data.signedUrl, "_blank");
  };

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{d.perfil.nombre_completo}</h1>
          <p className="text-sm text-tinta-suave">
            {d.perfil.specialties?.nombre} · alias “{d.perfil.alias}” · C.I. {d.perfil.cedula ?? "—"}
          </p>
          <p className="text-xs text-tinta-suave">{d.perfil.email} · {d.perfil.telefono ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <InsigniaEstado estado={d.perfil.estado} />
          {d.perfil.estado !== "suspendido" ? (
            <button onClick={() => cambiarEstado("suspendido")} className="btn-peligro !py-1.5 text-xs">Suspender</button>
          ) : (
            <button onClick={() => cambiarEstado("aprobado")} className="btn-primario !py-1.5 text-xs">Reactivar</button>
          )}
        </div>
      </div>

      {mensaje && <Alerta tono="exito">{mensaje}</Alerta>}
      {error && <Alerta tono="peligro">{error}</Alerta>}
      {d.perfil.suspension_proxima_reserva && (
        <Alerta tono="alerta">⚠ Tiene activa la suspensión automática de su próxima reserva (Art. 9).</Alerta>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tensiómetro + monedero */}
        <Tarjeta className="p-5">
          <p className="mb-2 text-sm font-bold">Tensiómetro de saldo</p>
          <Tensiometro
            horas={d.monedero?.saldo_total ?? 0}
            maxHoras={d.monedero?.paquete?.horas_total ?? Math.max(d.monedero?.saldo_total ?? 0, 10)}
            diasRestantes={d.monedero?.paquete?.dias_restantes ?? null}
            etiqueta={d.monedero?.paquete ? (d.monedero.paquete.plan === "vip" ? "Ronda Médica VIP" : "Estancia Plus") : undefined}
          />
          <div className="mt-4 space-y-2 border-t border-borde pt-3">
            <p className="text-xs font-bold uppercase text-tinta-suave">Ajuste manual del monedero</p>
            <div className="flex gap-2">
              <input className="campo !w-24" placeholder="±horas" value={ajuste}
                onChange={(e) => setAjuste(e.target.value)} inputMode="decimal" />
              <input className="campo flex-1" placeholder="Motivo del ajuste"
                value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} />
              <button onClick={aplicarAjuste} className="btn-secundario text-xs">Aplicar</button>
            </div>
          </div>
        </Tarjeta>

        {/* Calificación interna */}
        <Tarjeta className="p-5">
          <p className="mb-1 text-sm font-bold">Calificación interna</p>
          <p className="mb-3 text-xs text-tinta-suave">
            Solo visible para ti. El co-med nunca ve estas notas.
          </p>
          <Estrellas valor={estrellas} onCambiar={setEstrellas} />
          <textarea
            className="campo mt-3 min-h-24"
            placeholder="Notas y recomendaciones internas (puntualidad, trato, orden del consultorio…)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
          <button onClick={guardarRating} className="btn-primario mt-2 w-full">Guardar calificación</button>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-borde pt-3 text-center">
            <Mini titulo="Reagendamientos" valor={String(totalReagendas)} />
            <Mini titulo="Excedentes" valor={String(d.perfil.reincidencias_excedente)} />
            <Mini titulo="Reservas" valor={String(d.reservas.length)} />
          </div>
        </Tarjeta>
      </div>

      {/* Acreditaciones */}
      <Tarjeta className="p-5">
        <p className="mb-2 text-sm font-bold">Acreditación profesional</p>
        {d.acreditaciones.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin acreditaciones cargadas.</p>
        ) : (
          d.acreditaciones.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl bg-fondo px-3 py-2.5 text-sm">
              <span><b>{a.tipo}</b> · {a.numero}</span>
              <div className="flex items-center gap-2">
                <InsigniaEstado estado={a.estado} />
                {a.documento_path && (
                  <button onClick={() => verDocumento(a.documento_path!)} className="btn-secundario !py-1.5 text-xs">Ver</button>
                )}
              </div>
            </div>
          ))
        )}
      </Tarjeta>

      {/* Historial de reservas */}
      <Tarjeta className="overflow-hidden">
        <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">Últimas reservas</p>
        <ul className="max-h-80 divide-y divide-borde/70 overflow-y-auto">
          {d.reservas.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                {r.fecha} · {formatoRangoHora(r.hora)}
                {r.es_hora_extra && " · hora extra"}
                {r.reagendamientos > 0 && ` · ↻×${r.reagendamientos}`}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-tinta-suave">{formatoUSD(Number(r.precio))}</span>
                <InsigniaEstado estado={r.estado} />
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      {/* Pagos */}
      <Tarjeta className="overflow-hidden">
        <p className="border-b border-borde bg-fondo px-4 py-3 text-sm font-bold">Pagos</p>
        <ul className="divide-y divide-borde/70">
          {d.pagos.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>Recibo N° {p.numero_recibo} · <span className="capitalize">{p.metodo}</span></span>
              <span className="flex items-center gap-2">
                <b>{formatoUSD(Number(p.monto))}</b>
                <InsigniaEstado estado={p.estado} />
                <a href={`/api/recibo/${p.id}`} target="_blank" className="text-xs font-semibold text-primario underline">ver</a>
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </main>
  );
}

function Mini({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-lg font-extrabold">{valor}</p>
      <p className="text-[10px] text-tinta-suave">{titulo}</p>
    </div>
  );
}
