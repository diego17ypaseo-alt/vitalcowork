"use client";

// Solicitudes de derivación: el co-manager acredita las horas cuando el
// pago del estudio derivado está confirmado (doble confirmación).

import { useCallback, useEffect, useMemo, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Alerta, Cargando, InsigniaEstado, Tarjeta, Vacio } from "@/components/ui";

interface Solicitud {
  id: string;
  paciente_iniciales: string;
  estado: string;
  creado_en: string;
  nota: string | null;
  profiles: { nombre_completo: string } | null;
  reward_catalog: { estudio: string; horas: number } | null;
}

export default function PaginaRecompensasAdmin() {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [nota, setNota] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("referrals")
      .select("id, paciente_iniciales, estado, creado_en, nota, profiles(nombre_completo), reward_catalog(estudio, horas)")
      .order("creado_en", { ascending: false })
      .limit(60);
    setSolicitudes((data as unknown as Solicitud[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const decidir = async (id: string, aprobar: boolean) => {
    setError(null);
    const { error: e } = await supabase.rpc("fn_acreditar_recompensa", {
      p_referral: id,
      p_aprobar: aprobar,
      p_nota: nota[id] || null,
    });
    if (e) return setError(e.message);
    setMensaje(aprobar ? "Horas acreditadas al monedero del co-med 🎉" : "Derivación rechazada.");
    cargar();
  };

  if (!solicitudes) return <Cargando />;
  const pendientes = solicitudes.filter((s) => s.estado === "solicitada");
  const resto = solicitudes.filter((s) => s.estado !== "solicitada");

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">Recompensas por derivación</h1>
      {mensaje && <Alerta tono="exito">{mensaje}</Alerta>}
      {error && <Alerta tono="peligro">{error}</Alerta>}

      <h2 className="text-sm font-bold text-tinta-suave">Pendientes ({pendientes.length})</h2>
      {pendientes.length === 0 ? (
        <Vacio icono="🎁" texto="No hay derivaciones esperando acreditación." />
      ) : (
        pendientes.map((s) => (
          <Tarjeta key={s.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">
                  {s.reward_catalog?.estudio} · paciente {s.paciente_iniciales}
                </p>
                <p className="text-xs text-tinta-suave">
                  {s.profiles?.nombre_completo} ·{" "}
                  {new Date(s.creado_en).toLocaleDateString("es-EC")} · otorga{" "}
                  <b>{s.reward_catalog?.horas} h</b>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input className="campo !w-44 text-xs" placeholder="Nota (opcional)"
                  value={nota[s.id] ?? ""} onChange={(e) => setNota({ ...nota, [s.id]: e.target.value })} />
                <button onClick={() => decidir(s.id, true)} className="btn-primario !py-2 text-xs">
                  ✅ Acreditar horas
                </button>
                <button onClick={() => decidir(s.id, false)} className="btn-peligro !py-2 text-xs">✕</button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-tinta-suave">
              Acredita únicamente cuando el pago del estudio esté confirmado.
            </p>
          </Tarjeta>
        ))
      )}

      <h2 className="text-sm font-bold text-tinta-suave">Historial</h2>
      <div className="tarjeta divide-y divide-borde/70 overflow-hidden">
        {resto.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>
              {s.reward_catalog?.estudio} · {s.profiles?.nombre_completo} ·{" "}
              <span className="text-tinta-suave">{s.paciente_iniciales}</span>
            </span>
            <InsigniaEstado estado={s.estado} />
          </div>
        ))}
      </div>
    </main>
  );
}
