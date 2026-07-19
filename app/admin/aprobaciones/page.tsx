"use client";

// Aprobación de co-meds: revisar acreditación (documento en bucket privado)
// y aprobar o pedir correcciones.

import { useCallback, useEffect, useMemo, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Alerta, Cargando, Vacio } from "@/components/ui";

interface Pendiente {
  id: string;
  nombre_completo: string;
  cedula: string | null;
  email: string;
  telefono: string | null;
  alias: string;
  creado_en: string;
  specialties: { nombre: string } | null;
  accreditations: { id: string; tipo: string; numero: string; documento_path: string | null }[];
}

export default function PaginaAprobaciones() {
  const supabase = useMemo(() => crearClienteNavegador(), []);
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [comentario, setComentario] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, nombre_completo, cedula, email, telefono, alias, creado_en, specialties(nombre), accreditations(id, tipo, numero, documento_path)")
      .eq("estado", "pendiente")
      .eq("rol", "comed")
      .order("creado_en");
    setPendientes((data as unknown as Pendiente[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const verDocumento = async (ruta: string) => {
    const { data, error: e } = await supabase.storage
      .from("acreditaciones")
      .createSignedUrl(ruta, 300);
    if (e || !data) return setError("No se pudo abrir el documento.");
    window.open(data.signedUrl, "_blank");
  };

  const decidir = async (id: string, aprobar: boolean) => {
    setError(null);
    const { error: e } = await supabase.rpc("fn_aprobar_comed", {
      p_profile: id,
      p_aprobar: aprobar,
      p_comentario: comentario[id] || null,
    });
    if (e) return setError(e.message);
    cargar();
  };

  if (!pendientes) return <Cargando />;

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">Aprobaciones pendientes</h1>
      {error && <Alerta tono="peligro">{error}</Alerta>}
      {pendientes.length === 0 ? (
        <Vacio icono="🎉" texto="No hay co-meds esperando aprobación." />
      ) : (
        pendientes.map((p) => (
          <div key={p.id} className="tarjeta p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold">{p.nombre_completo}</p>
                <p className="text-sm text-tinta-suave">
                  {p.specialties?.nombre ?? "Sin especialidad"} · alias “{p.alias}”
                </p>
                <p className="mt-1 text-xs text-tinta-suave">
                  C.I. {p.cedula ?? "—"} · {p.telefono ?? "—"} · {p.email}
                </p>
              </div>
              <span className="text-[11px] text-tinta-suave">
                Registrado el {new Date(p.creado_en).toLocaleDateString("es-EC")}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {p.accreditations.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl bg-fondo px-3 py-2.5 text-sm">
                  <span><b>{a.tipo}</b> · {a.numero}</span>
                  {a.documento_path ? (
                    <button onClick={() => verDocumento(a.documento_path!)} className="btn-secundario !py-1.5 text-xs">
                      📄 Ver documento
                    </button>
                  ) : (
                    <span className="text-xs text-peligro">Sin documento</span>
                  )}
                </div>
              ))}
              {p.accreditations.length === 0 && (
                <Alerta tono="alerta">Este perfil no cargó acreditación.</Alerta>
              )}
            </div>

            <div className="mt-3 space-y-2">
              <input
                className="campo"
                placeholder="Comentario para el co-med (opcional)"
                value={comentario[p.id] ?? ""}
                onChange={(e) => setComentario({ ...comentario, [p.id]: e.target.value })}
              />
              <div className="flex gap-2">
                <button onClick={() => decidir(p.id, true)} className="btn-primario flex-1">
                  ✅ Aprobar cuenta
                </button>
                <button onClick={() => decidir(p.id, false)} className="btn-peligro flex-1">
                  Pedir correcciones
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
