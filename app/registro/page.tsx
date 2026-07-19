"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { BotonesOAuth } from "@/components/BotonesOAuth";
import { Alerta, LogoVital } from "@/components/ui";

/** Paso 1 del onboarding: crear la cuenta (OAuth o correo + contraseña) */
export default function PaginaRegistro() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (clave !== clave2) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: clave,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?siguiente=/registro/perfil` },
    });
    setCargando(false);
    if (error) {
      setError(
        error.message.includes("already registered")
          ? "Este correo ya tiene una cuenta. Intenta ingresar."
          : error.message
      );
      return;
    }
    if (data.session) {
      // Confirmación de correo desactivada en el proyecto: sigue directo
      router.push("/registro/perfil");
      router.refresh();
    } else {
      setAviso("Te enviamos un correo de verificación. Ábrelo para continuar con tu registro.");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <LogoVital tam="text-3xl" />
        <p className="mt-1 text-sm text-tinta-suave">Crea tu cuenta de co-med</p>
      </div>

      <Alerta tono="primario">
        VitalCowork es para profesionales de la salud de consulta ambulatoria
        (medicina general, medicina interna, psicología, nutrición y afines).
        <b> No se admiten procedimientos quirúrgicos mayores o complejos</b>;
        solo procedimientos menores (p. ej. extracción de puntos, limpieza
        quirúrgica menor).
      </Alerta>

      <div className="mt-5">
        <BotonesOAuth />
      </div>

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-tinta-suave">
        <div className="h-px flex-1 bg-borde" /> o con tu correo <div className="h-px flex-1 bg-borde" />
      </div>

      <form onSubmit={crear} className="space-y-3">
        {error && <Alerta tono="peligro">{error}</Alerta>}
        {aviso && <Alerta tono="exito">{aviso}</Alerta>}
        <div>
          <label className="etiqueta">Correo electrónico</label>
          <input type="email" required className="campo" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className="etiqueta">Contraseña</label>
          <input type="password" required className="campo" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className="etiqueta">Repite la contraseña</label>
          <input type="password" required className="campo" value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={cargando} className="btn-primario w-full py-3">
          {cargando ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-primario">Ingresar</Link>
      </p>
    </main>
  );
}
