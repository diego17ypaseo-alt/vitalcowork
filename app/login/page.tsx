"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { BotonesOAuth } from "@/components/BotonesOAuth";
import { Alerta, LogoVital } from "@/components/ui";

function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "oauth" ? "No se pudo completar el acceso. Intenta de nuevo." : null
  );
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    setCargando(false);
    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "Correo o contraseña incorrectos."
          : error.message.includes("not confirmed")
            ? "Debes verificar tu correo antes de ingresar. Revisa tu bandeja."
            : error.message
      );
      return;
    }
    router.push(params.get("desde") ?? "/inicio");
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <LogoVital tam="text-3xl" />
        <p className="mt-1 text-sm text-tinta-suave">Ingresa a tu espacio</p>
      </div>

      <BotonesOAuth />

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-tinta-suave">
        <div className="h-px flex-1 bg-borde" /> o con tu correo <div className="h-px flex-1 bg-borde" />
      </div>

      <form onSubmit={entrar} className="space-y-3">
        {error && <Alerta tono="peligro">{error}</Alerta>}
        <div>
          <label className="etiqueta">Correo electrónico</label>
          <input
            type="email"
            required
            className="campo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="etiqueta">Contraseña</label>
          <input
            type="password"
            required
            className="campo"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <button type="submit" disabled={cargando} className="btn-primario w-full py-3">
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-primario">
          Regístrate como co-med
        </Link>
      </p>
    </main>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
