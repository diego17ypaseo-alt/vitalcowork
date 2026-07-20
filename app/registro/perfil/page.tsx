"use client";

// Paso 2 del onboarding: perfil profesional + acreditación (ACESS/Senescyt)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Alerta, LogoVital } from "@/components/ui";

interface Especialidad {
  id: number;
  nombre: string;
}

export default function PaginaPerfil() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [yaExiste, setYaExiste] = useState(false);
  const [f, setF] = useState({
    nombre: "",
    cedula: "",
    alias: "",
    especialidad: "",
    telefono: "",
    tipoAcreditacion: "Senescyt",
    numeroAcreditacion: "",
  });
  const [documento, setDocumento] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: perfil } = await supabase
        .from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (perfil) {
        setYaExiste(true);
        router.replace("/registro/terminos");
        return;
      }
      const { data } = await supabase
        .from("specialties").select("id, nombre").eq("activa", true).order("nombre");
      setEspecialidades(data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.especialidad) return setError("Selecciona tu especialidad.");
    if (!/^\d{10}$/.test(f.cedula)) return setError("La cédula debe tener 10 dígitos.");
    if (!documento) return setError("Adjunta tu documento de acreditación (PDF o imagen).");
    setCargando(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión expirada");

      // 1) Perfil (queda en estado 'pendiente' hasta aprobación del co-manager)
      const { error: ep } = await supabase.from("profiles").insert({
        id: user.id,
        nombre_completo: f.nombre.trim(),
        cedula: f.cedula,
        alias: f.alias.trim() || iniciales(f.nombre),
        especialidad_id: Number(f.especialidad),
        telefono: f.telefono.trim(),
        email: user.email,
      });
      if (ep) throw new Error(ep.message);

      // 2) Documento de acreditación → bucket privado (solo co-manager lo ve)
      const extension = documento.name.split(".").pop() ?? "pdf";
      const ruta = `${user.id}/acreditacion-${Date.now()}.${extension}`;
      const { error: es } = await supabase.storage
        .from("acreditaciones")
        .upload(ruta, documento, { upsert: true });
      if (es) throw new Error(`No se pudo subir el documento: ${es.message}`);

      const { error: ea } = await supabase.from("accreditations").insert({
        profile_id: user.id,
        tipo: f.tipoAcreditacion,
        numero: f.numeroAcreditacion.trim(),
        documento_path: ruta,
      });
      if (ea) throw new Error(ea.message);

      router.push("/registro/terminos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
      setCargando(false);
    }
  };

  if (yaExiste) return null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <div className="mb-6 text-center">
        <LogoVital tam="text-2xl" />
        <h1 className="mt-3 text-lg font-bold">Tu perfil profesional</h1>
        <p className="text-sm text-tinta-suave">
          Paso 2 de 3 · Estos datos los verifica el administrador
        </p>
      </div>

      <form onSubmit={guardar} className="space-y-3.5">
        {error && <Alerta tono="peligro">{error}</Alerta>}
        <div>
          <label className="etiqueta">Nombre completo *</label>
          <input required className="campo" value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Dra. Ana María Pérez" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiqueta">Cédula *</label>
            <input required inputMode="numeric" maxLength={10} className="campo" value={f.cedula}
              onChange={(e) => setF({ ...f, cedula: e.target.value.replace(/\D/g, "") })} placeholder="0912345678" />
          </div>
          <div>
            <label className="etiqueta">Teléfono *</label>
            <input required inputMode="tel" className="campo" value={f.telefono}
              onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="0991234567" />
          </div>
        </div>
        <div>
          <label className="etiqueta">Alias público (se muestra en el calendario)</label>
          <input className="campo" value={f.alias} maxLength={12}
            onChange={(e) => setF({ ...f, alias: e.target.value })}
            placeholder={f.nombre ? iniciales(f.nombre) : "A.P."} />
          <p className="mt-1 text-[11px] text-tinta-suave">
            Otros co-meds solo verán este alias y tu especialidad; nunca tu
            nombre completo, teléfono ni correo.
          </p>
        </div>
        <div>
          <label className="etiqueta">Especialidad *</label>
          <select required className="campo" value={f.especialidad}
            onChange={(e) => setF({ ...f, especialidad: e.target.value })}>
            <option value="">Selecciona…</option>
            {especialidades.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <div>
            <label className="etiqueta">Registro</label>
            <select className="campo" value={f.tipoAcreditacion}
              onChange={(e) => setF({ ...f, tipoAcreditacion: e.target.value })}>
              <option>Senescyt</option>
              <option>ACESS</option>
              <option>Otro</option>
            </select>
          </div>
          <div>
            <label className="etiqueta">N° de registro Senescyt *</label>
            <input required className="campo" value={f.numeroAcreditacion}
              onChange={(e) => setF({ ...f, numeroAcreditacion: e.target.value })}
              placeholder="1015-2018-2001234" />
          </div>
        </div>

        {/* Descarga rápida del certificado oficial */}
        <div className="rounded-xl border border-primario/20 bg-primario-suave/50 p-3.5">
          <p className="text-[12.5px] leading-relaxed">
            💡 <b>¿No tienes tu certificado a la mano?</b> Descárgalo del
            Senescyt en 1 minuto: entra con tu cédula, busca tu título y
            guárdalo en PDF. Luego súbelo aquí abajo.
          </p>
          <a
            href="https://www.senescyt.gob.ec/web/guest/consultas"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primario mt-2.5 w-full !py-2.5 text-sm"
          >
            🎓 Descargar mi certificado del Senescyt
          </a>
        </div>

        <div>
          <label className="etiqueta">Certificado / título en PDF o foto *</label>
          <input type="file" accept=".pdf,image/*" className="campo file:mr-3 file:rounded-lg file:border-0 file:bg-primario-suave file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primario-oscuro"
            onChange={(e) => setDocumento(e.target.files?.[0] ?? null)} />
        </div>

        <button type="submit" disabled={cargando} className="btn-primario w-full py-3">
          {cargando ? "Guardando…" : "Continuar a los Términos →"}
        </button>
      </form>
    </main>
  );
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() + ".")
    .join("");
}
