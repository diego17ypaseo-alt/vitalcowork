"use client";

// Configuración completa del establecimiento — sin tocar código:
// horarios, reglas, precios/planes, bancos, feriados/bloqueos, satélite,
// catálogo de recompensas y versiones del reglamento (T&C).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { feriadosEcuador } from "@/lib/feriados-ecuador";
import { Alerta, Cargando, Tarjeta } from "@/components/ui";
import type { BloqueoFeriado, Espacio, Plan } from "@/lib/tipos";

interface Banco {
  banco: string; tipo: string; numero: string; titular: string; cedula_ruc: string;
}

export function Configuracion() {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [cargado, setCargado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [jornadas, setJornadas] = useState<[number, number][]>([[9, 12], [13, 18]]);
  const [gracia, setGracia] = useState(8);
  const [umbral, setUmbral] = useState(3);
  const [anticipacion, setAnticipacion] = useState(4);
  const [pct24, setPct24] = useState(50);
  const [whatsapp, setWhatsapp] = useState("593983936496");
  const [bancos, setBancos] = useState<Banco[]>([]);
  // Catálogos
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [bloqueos, setBloqueos] = useState<BloqueoFeriado[]>([]);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [recompensas, setRecompensas] = useState<{ id: number; estudio: string; horas: number; activo: boolean }[]>([]);
  const [versionesTnc, setVersionesTnc] = useState<{ id: number; version: string; publicado: boolean; creado_en: string }[]>([]);
  // Formularios
  const [nuevoBloqueo, setNuevoBloqueo] = useState({ fecha: "", motivo: "", espacio: "", horaInicio: "", horaFin: "" });
  const [nuevaHabilitacion, setNuevaHabilitacion] = useState({ desde: "", hasta: "", nota: "" });
  const [habilitaciones, setHabilitaciones] = useState<{ id: string; fecha_inicio: string; fecha_fin: string; nota: string | null }[]>([]);
  const [nuevaVersionTnc, setNuevaVersionTnc] = useState({ version: "", contenido: "" });

  const cargar = useCallback(async () => {
    const [{ data: s }, { data: p }, { data: b }, { data: e }, { data: r }, { data: t }, { data: h }] =
      await Promise.all([
        supabase.from("settings").select("clave, valor"),
        supabase.from("plans").select("*").order("orden"),
        supabase.from("holidays_blocks").select("*").gte("fecha", new Date().toISOString().slice(0, 10)).order("fecha"),
        supabase.from("spaces").select("*").order("es_principal", { ascending: false }),
        supabase.from("reward_catalog").select("*").order("orden"),
        supabase.from("tnc_versions").select("id, version, publicado, creado_en").order("id", { ascending: false }),
        supabase.from("space_availability").select("id, fecha_inicio, fecha_fin, nota").order("fecha_inicio", { ascending: false }).limit(20),
      ]);
    const mapa = Object.fromEntries((s ?? []).map((x) => [x.clave, x.valor]));
    if (mapa.horario?.jornadas) setJornadas(mapa.horario.jornadas);
    if (mapa.gracia_minutos !== undefined) setGracia(Number(mapa.gracia_minutos));
    if (mapa.umbral_reincidencias !== undefined) setUmbral(Number(mapa.umbral_reincidencias));
    if (mapa.reagenda_anticipacion_horas !== undefined) setAnticipacion(Number(mapa.reagenda_anticipacion_horas));
    if (mapa.penalizacion_dentro_24h !== undefined) setPct24(Number(mapa.penalizacion_dentro_24h) * 100);
    if (mapa.whatsapp_numero) setWhatsapp(String(mapa.whatsapp_numero));
    if (mapa.bancos) setBancos(mapa.bancos);
    setPlanes((p as Plan[]) ?? []);
    setBloqueos((b as BloqueoFeriado[]) ?? []);
    setEspacios((e as Espacio[]) ?? []);
    setRecompensas(r ?? []);
    setVersionesTnc(t ?? []);
    setHabilitaciones(h ?? []);
    setCargado(true);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ok = (m: string) => { setMensaje(m); setError(null); setTimeout(() => setMensaje(null), 4000); };
  const fallo = (m: string) => { setError(m); setMensaje(null); };

  const guardarSetting = async (clave: string, valor: unknown, aviso = "Guardado ✅") => {
    const { error: e } = await supabase.from("settings").upsert({
      clave, valor, actualizado_en: new Date().toISOString(),
    });
    e ? fallo(e.message) : ok(aviso);
  };

  const guardarReglas = async () => {
    await guardarSetting("horario", { jornadas }, "");
    await guardarSetting("gracia_minutos", gracia, "");
    await guardarSetting("umbral_reincidencias", umbral, "");
    await guardarSetting("reagenda_anticipacion_horas", anticipacion, "");
    await guardarSetting("penalizacion_dentro_24h", pct24 / 100, "");
    await guardarSetting("whatsapp_numero", whatsapp, "Reglas y horario guardados ✅");
  };

  const guardarPlan = async (p: Plan) => {
    const { error: e } = await supabase.from("plans").update({
      precio_hora: p.precio_hora,
      min_horas_semana: p.min_horas_semana,
      min_horas_mes: p.min_horas_mes,
      reagendamientos_por_reserva: p.reagendamientos_por_reserva,
      badge: p.badge,
      copy_comercial: p.copy_comercial,
    }).eq("id", p.id);
    e ? fallo(e.message) : ok(`${p.nombre} actualizado ✅`);
  };

  const agregarBloqueo = async () => {
    if (!nuevoBloqueo.fecha || !nuevoBloqueo.motivo) return fallo("Fecha y motivo son obligatorios.");
    const { error: e } = await supabase.from("holidays_blocks").insert({
      fecha: nuevoBloqueo.fecha,
      tipo: "manual",
      motivo: nuevoBloqueo.motivo,
      space_id: nuevoBloqueo.espacio || null,
      hora_inicio: nuevoBloqueo.horaInicio ? Number(nuevoBloqueo.horaInicio) : null,
      hora_fin: nuevoBloqueo.horaFin ? Number(nuevoBloqueo.horaFin) : null,
    });
    if (e) return fallo(e.message);
    setNuevoBloqueo({ fecha: "", motivo: "", espacio: "", horaInicio: "", horaFin: "" });
    ok("Bloqueo agregado ✅");
    cargar();
  };

  const quitarBloqueo = async (id: string) => {
    await supabase.from("holidays_blocks").delete().eq("id", id);
    cargar();
  };

  const cargarFeriados = async (anio: number) => {
    const feriados = feriadosEcuador(anio).map((f) => ({
      fecha: f.fecha,
      tipo: "feriado" as const,
      motivo: f.nombre + (f.fecha !== f.original ? ` (trasladado del ${f.original})` : ""),
    }));
    const { error: e } = await supabase.from("holidays_blocks").insert(feriados);
    e ? fallo("Algunos feriados ya existían o hubo un error: " + e.message) : ok(`Feriados ${anio} cargados ✅`);
    cargar();
  };

  const satelite = espacios.find((s) => !s.es_principal);

  const agregarHabilitacion = async () => {
    if (!satelite || !nuevaHabilitacion.desde || !nuevaHabilitacion.hasta)
      return fallo("Indica el rango de fechas.");
    const { error: e } = await supabase.from("space_availability").insert({
      space_id: satelite.id,
      fecha_inicio: nuevaHabilitacion.desde,
      fecha_fin: nuevaHabilitacion.hasta,
      nota: nuevaHabilitacion.nota || null,
    });
    if (e) return fallo(e.message);
    setNuevaHabilitacion({ desde: "", hasta: "", nota: "" });
    ok("Consultorio satélite habilitado para ese rango ✅");
    cargar();
  };

  const guardarRecompensa = async (r: { id: number; estudio: string; horas: number; activo: boolean }) => {
    const { error: e } = await supabase.from("reward_catalog")
      .update({ estudio: r.estudio, horas: r.horas, activo: r.activo }).eq("id", r.id);
    e ? fallo(e.message) : ok("Catálogo actualizado ✅");
  };

  const publicarTnc = async () => {
    if (!nuevaVersionTnc.version || !nuevaVersionTnc.contenido)
      return fallo("Indica número de versión y contenido.");
    const { error: e } = await supabase.from("tnc_versions").insert({
      version: nuevaVersionTnc.version,
      contenido_md: nuevaVersionTnc.contenido,
      publicado: true,
    });
    if (e) return fallo(e.message);
    setNuevaVersionTnc({ version: "", contenido: "" });
    ok("Nueva versión publicada: todos los co-meds deberán re-aceptarla al entrar ✅");
    cargar();
  };

  if (!cargado) return <Cargando texto="Cargando configuración…" />;

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">Configuración</h1>
      {mensaje && <Alerta tono="exito">{mensaje}</Alerta>}
      {error && <Alerta tono="peligro">{error}</Alerta>}

      {/* ===== Horario y reglas ===== */}
      <Seccion titulo="🕘 Horario y reglas del reglamento">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {jornadas.map((j, i) => (
            <div key={i} className="col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="etiqueta">Jornada {i + 1} inicio</label>
                <input type="number" min={6} max={20} className="campo" value={j[0]}
                  onChange={(e) => setJornadas(jornadas.map((x, k) => k === i ? [Number(e.target.value), x[1]] : x))} />
              </div>
              <div>
                <label className="etiqueta">fin</label>
                <input type="number" min={7} max={21} className="campo" value={j[1]}
                  onChange={(e) => setJornadas(jornadas.map((x, k) => k === i ? [x[0], Number(e.target.value)] : x))} />
              </div>
            </div>
          ))}
          <Num etiqueta="Gracia (min, Art. 9)" valor={gracia} set={setGracia} />
          <Num etiqueta="Umbral reincidencias" valor={umbral} set={setUmbral} />
          <Num etiqueta="Anticipación reagenda (h)" valor={anticipacion} set={setAnticipacion} />
          <Num etiqueta="Penalización <24h (%)" valor={pct24} set={setPct24} />
          <div className="col-span-2">
            <label className="etiqueta">WhatsApp del establecimiento</label>
            <input className="campo" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
        </div>
        <button onClick={guardarReglas} className="btn-primario mt-3">Guardar horario y reglas</button>
      </Seccion>

      {/* ===== Planes ===== */}
      <Seccion titulo="💲 Precios y planes">
        <div className="space-y-4">
          {planes.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-borde p-3">
              <p className="mb-2 text-sm font-bold" style={{ color: p.color }}>
                {p.nivel} · {p.nombre}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className="etiqueta">$/hora</label>
                  <input type="number" step="0.5" className="campo" value={p.precio_hora}
                    onChange={(e) => setPlanes(planes.map((x, k) => k === i ? { ...x, precio_hora: Number(e.target.value) } : x))} />
                </div>
                {p.min_horas_semana !== null && (
                  <>
                    <div>
                      <label className="etiqueta">Mín. h/semana</label>
                      <input type="number" className="campo" value={p.min_horas_semana ?? 0}
                        onChange={(e) => setPlanes(planes.map((x, k) => k === i ? { ...x, min_horas_semana: Number(e.target.value) } : x))} />
                    </div>
                    <div>
                      <label className="etiqueta">Mín. h/mes</label>
                      <input type="number" className="campo" value={p.min_horas_mes ?? 0}
                        onChange={(e) => setPlanes(planes.map((x, k) => k === i ? { ...x, min_horas_mes: Number(e.target.value) } : x))} />
                    </div>
                  </>
                )}
                <div>
                  <label className="etiqueta">Reagendas/reserva (vacío = ∞)</label>
                  <input className="campo" value={p.reagendamientos_por_reserva ?? ""}
                    onChange={(e) => setPlanes(planes.map((x, k) => k === i ? { ...x, reagendamientos_por_reserva: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                </div>
              </div>
              <textarea className="campo mt-2 text-xs" rows={2} value={p.copy_comercial ?? ""}
                onChange={(e) => setPlanes(planes.map((x, k) => k === i ? { ...x, copy_comercial: e.target.value } : x))} />
              <button onClick={() => guardarPlan(planes[i])} className="btn-secundario mt-2 !py-1.5 text-xs">
                Guardar {p.nombre}
              </button>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ===== Bancos ===== */}
      <Seccion titulo="🏦 Cuentas bancarias (transferencias)">
        <div className="space-y-3">
          {bancos.map((b, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-borde p-3 sm:grid-cols-5">
              {(["banco", "tipo", "numero", "titular", "cedula_ruc"] as const).map((campo) => (
                <input key={campo} className="campo text-xs" placeholder={campo} value={b[campo]}
                  onChange={(e) => setBancos(bancos.map((x, k) => k === i ? { ...x, [campo]: e.target.value } : x))} />
              ))}
            </div>
          ))}
          <button onClick={() => guardarSetting("bancos", bancos, "Cuentas bancarias guardadas ✅")} className="btn-primario">
            Guardar cuentas
          </button>
        </div>
      </Seccion>

      {/* ===== Feriados y bloqueos ===== */}
      <Seccion titulo="📅 Feriados y bloqueos">
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => cargarFeriados(new Date().getFullYear() + 1)} className="btn-secundario !py-1.5 text-xs">
            Cargar feriados de Ecuador {new Date().getFullYear() + 1}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input type="date" className="campo" value={nuevoBloqueo.fecha}
            onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, fecha: e.target.value })} />
          <input className="campo col-span-2" placeholder="Motivo (mantenimiento, uso propio…)"
            value={nuevoBloqueo.motivo} onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, motivo: e.target.value })} />
          <select className="campo" value={nuevoBloqueo.espacio}
            onChange={(e) => setNuevoBloqueo({ ...nuevoBloqueo, espacio: e.target.value })}>
            <option value="">Todo el local</option>
            {espacios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button onClick={agregarBloqueo} className="btn-primario">Bloquear</button>
        </div>
        <ul className="mt-3 max-h-60 space-y-1.5 overflow-y-auto">
          {bloqueos.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg bg-fondo px-3 py-2 text-xs">
              <span>
                <b>{b.fecha}</b> · {b.motivo}{" "}
                <span className="text-tinta-suave">({b.tipo}{b.space_id ? " · un espacio" : ""})</span>
              </span>
              <button onClick={() => quitarBloqueo(b.id)} className="font-bold text-peligro cursor-pointer">✕</button>
            </li>
          ))}
        </ul>
      </Seccion>

      {/* ===== Satélite ===== */}
      {satelite && (
        <Seccion titulo={`🛰 ${satelite.nombre} (modo emergente)`}>
          <p className="mb-3 text-xs text-tinta-suave">
            El satélite no es reservable por los co-meds salvo en los rangos que
            habilites aquí (alta demanda, excedentes del principal). Tú siempre
            puedes agendar en él desde Ventanilla.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input type="date" className="campo" value={nuevaHabilitacion.desde}
              onChange={(e) => setNuevaHabilitacion({ ...nuevaHabilitacion, desde: e.target.value })} />
            <input type="date" className="campo" value={nuevaHabilitacion.hasta}
              onChange={(e) => setNuevaHabilitacion({ ...nuevaHabilitacion, hasta: e.target.value })} />
            <input className="campo" placeholder="Nota" value={nuevaHabilitacion.nota}
              onChange={(e) => setNuevaHabilitacion({ ...nuevaHabilitacion, nota: e.target.value })} />
            <button onClick={agregarHabilitacion} className="btn-primario">Habilitar</button>
          </div>
          <ul className="mt-3 space-y-1.5">
            {habilitaciones.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded-lg bg-fondo px-3 py-2 text-xs">
                <span><b>{h.fecha_inicio}</b> → <b>{h.fecha_fin}</b>{h.nota && ` · ${h.nota}`}</span>
                <button onClick={async () => { await supabase.from("space_availability").delete().eq("id", h.id); cargar(); }}
                  className="font-bold text-peligro cursor-pointer">✕</button>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* ===== Recompensas ===== */}
      <Seccion titulo="🎁 Catálogo de recompensas por derivación">
        <div className="space-y-2">
          {recompensas.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <input className="campo flex-1" value={r.estudio}
                onChange={(e) => setRecompensas(recompensas.map((x, k) => k === i ? { ...x, estudio: e.target.value } : x))} />
              <input type="number" step="0.5" className="campo !w-20 text-center" value={r.horas}
                onChange={(e) => setRecompensas(recompensas.map((x, k) => k === i ? { ...x, horas: Number(e.target.value) } : x))} />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={r.activo}
                  onChange={(e) => setRecompensas(recompensas.map((x, k) => k === i ? { ...x, activo: e.target.checked } : x))} />
                activo
              </label>
              <button onClick={() => guardarRecompensa(recompensas[i])} className="btn-secundario !py-1.5 text-xs">💾</button>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ===== T&C ===== */}
      <Seccion titulo="📜 Reglamento / Términos y Condiciones">
        <p className="mb-2 text-xs text-tinta-suave">
          Versiones publicadas: {versionesTnc.map((v) => `v${v.version}`).join(", ") || "ninguna"}.
          Al publicar una versión nueva, todos los co-meds deberán re-aceptarla
          antes de seguir usando la app (Art. 12).
        </p>
        <input className="campo mb-2" placeholder="Nueva versión (ej. 1.1)"
          value={nuevaVersionTnc.version}
          onChange={(e) => setNuevaVersionTnc({ ...nuevaVersionTnc, version: e.target.value })} />
        <textarea className="campo min-h-40 text-xs" placeholder="Contenido completo en Markdown…"
          value={nuevaVersionTnc.contenido}
          onChange={(e) => setNuevaVersionTnc({ ...nuevaVersionTnc, contenido: e.target.value })} />
        <button onClick={publicarTnc} className="btn-primario mt-2">Publicar nueva versión</button>
      </Seccion>
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <Tarjeta className="overflow-hidden">
      <button
        onClick={() => setAbierta(!abierta)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-bold cursor-pointer hover:bg-fondo"
      >
        {titulo}
        <span className="text-tinta-suave">{abierta ? "▲" : "▼"}</span>
      </button>
      {abierta && <div className="border-t border-borde p-4">{children}</div>}
    </Tarjeta>
  );
}

function Num({ etiqueta, valor, set }: { etiqueta: string; valor: number; set: (n: number) => void }) {
  return (
    <div>
      <label className="etiqueta">{etiqueta}</label>
      <input type="number" className="campo" value={valor} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
}
