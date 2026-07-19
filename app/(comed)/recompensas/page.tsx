"use client";

// Pestaña Recompensas del co-med: catálogo de estudios derivables,
// registro de derivación (solo iniciales del paciente) e historial.

import { useCallback, useEffect, useMemo, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Alerta, Cargando, InsigniaEstado, Modal, Tarjeta, Vacio } from "@/components/ui";

interface Estudio {
  id: number;
  estudio: string;
  horas: number;
}

interface Derivacion {
  id: string;
  paciente_iniciales: string;
  estado: string;
  creado_en: string;
  nota: string | null;
  reward_catalog: { estudio: string; horas: number } | null;
}

export default function PaginaRecompensas() {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [catalogo, setCatalogo] = useState<Estudio[] | null>(null);
  const [derivaciones, setDerivaciones] = useState<Derivacion[]>([]);
  const [saldoRecompensas, setSaldoRecompensas] = useState(0);
  const [registrando, setRegistrando] = useState<Estudio | null>(null);
  const [iniciales, setIniciales] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: d }, { data: w }] = await Promise.all([
      supabase.from("reward_catalog").select("id, estudio, horas").eq("activo", true).order("orden"),
      supabase.from("referrals")
        .select("id, paciente_iniciales, estado, creado_en, nota, reward_catalog(estudio, horas)")
        .order("creado_en", { ascending: false }).limit(30),
      supabase.from("wallet_ledger").select("delta_horas").eq("origen", "recompensa"),
    ]);
    setCatalogo(c ?? []);
    setDerivaciones((d as unknown as Derivacion[]) ?? []);
    setSaldoRecompensas((w ?? []).reduce((s, x) => s + Number(x.delta_horas), 0));
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const registrar = async () => {
    if (!registrando) return;
    const ini = iniciales.trim().toUpperCase();
    if (!/^[A-ZÑ]\.?([A-ZÑ]\.?){0,2}$/.test(ini.replaceAll(".", "") + "."))
      if (ini.length < 2 || ini.length > 6)
        return setError("Escribe solo las iniciales del paciente (ej. N.N.)");
    setOcupado(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("referrals").insert({
      profile_id: user!.id,
      reward_id: registrando.id,
      paciente_iniciales: ini,
    });
    setOcupado(false);
    if (e) return setError(e.message);
    setRegistrando(null);
    setIniciales("");
    setMensaje(
      "Derivación registrada. Cuando el establecimiento confirme el pago del estudio, verás las horas acreditadas en tu tensiómetro. 🎉"
    );
    cargar();
  };

  if (!catalogo) return <Cargando />;

  return (
    <main className="space-y-4 px-4 py-5">
      <header>
        <h1 className="text-xl font-extrabold">Recompensas</h1>
        <p className="text-sm text-tinta-suave">
          Deriva estudios dentro del establecimiento y gana horas gratis de consultorio.
        </p>
      </header>

      {mensaje && <Alerta tono="exito">{mensaje}</Alerta>}

      <Tarjeta className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-bold uppercase text-tinta-suave">Horas ganadas por derivación</p>
          <p className="text-2xl font-extrabold text-primario">{saldoRecompensas} h</p>
        </div>
        <span className="text-4xl">🎁</span>
      </Tarjeta>

      {/* Catálogo */}
      <div>
        <p className="mb-2 text-sm font-bold">Catálogo de estudios</p>
        <div className="space-y-2">
          {catalogo.map((e) => (
            <Tarjeta key={e.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold">{e.estudio}</p>
                <p className="text-xs text-exito font-semibold">
                  +{e.horas} hora{e.horas !== 1 ? "s" : ""} gratis
                </p>
              </div>
              <button
                onClick={() => { setRegistrando(e); setError(null); }}
                className="btn-primario !py-2 text-xs"
              >
                Derivé este estudio
              </button>
            </Tarjeta>
          ))}
        </div>
      </div>

      {/* Historial */}
      <div>
        <p className="mb-2 text-sm font-bold">Mis derivaciones</p>
        {derivaciones.length === 0 ? (
          <Vacio icono="🩻" texto="Aún no registras derivaciones." />
        ) : (
          <div className="tarjeta divide-y divide-borde/70 overflow-hidden">
            {derivaciones.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold">
                    {d.reward_catalog?.estudio}{" "}
                    <span className="text-xs text-tinta-suave">· paciente {d.paciente_iniciales}</span>
                  </p>
                  <p className="text-[11px] text-tinta-suave">
                    {new Date(d.creado_en).toLocaleDateString("es-EC")}
                    {d.estado === "acreditada" && ` · +${d.reward_catalog?.horas} h acreditadas`}
                    {d.nota && ` · ${d.nota}`}
                  </p>
                </div>
                <InsigniaEstado estado={d.estado} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal registrar derivación */}
      <Modal
        abierto={!!registrando}
        onCerrar={() => setRegistrando(null)}
        titulo={registrando ? `Derivé: ${registrando.estudio}` : ""}
      >
        {registrando && (
          <div className="space-y-3">
            <Alerta tono="primario">
              Por confidencialidad (Art. 7), registra <b>solo las iniciales</b> del
              paciente — nunca su nombre completo ni datos de contacto.
            </Alerta>
            <div>
              <label className="etiqueta">Iniciales del paciente *</label>
              <input
                className="campo uppercase"
                maxLength={6}
                placeholder="N.N."
                value={iniciales}
                onChange={(e) => setIniciales(e.target.value)}
              />
            </div>
            <p className="text-xs text-tinta-suave">
              El administrador acreditará <b>+{registrando.horas} h</b> a tu monedero
              cuando el pago del estudio esté confirmado (doble confirmación).
            </p>
            {error && <Alerta tono="peligro">{error}</Alerta>}
            <button onClick={registrar} disabled={ocupado || iniciales.trim().length < 2} className="btn-primario w-full py-3">
              {ocupado ? "Registrando…" : "Registrar derivación"}
            </button>
          </div>
        )}
      </Modal>
    </main>
  );
}
