"use client";

// Paso 3 del onboarding: aceptación de T&C con scroll obligatorio.
// Guarda fecha/hora, versión e identidad (firma digital del reglamento).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { VisorTerminos } from "@/components/VisorTerminos";
import { Cargando, LogoVital } from "@/components/ui";

export default function PaginaTerminosOnboarding() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const [version, setVersion] = useState<{ id: number; version: string; contenido_md: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: v } = await supabase
        .from("tnc_versions")
        .select("id, version, contenido_md")
        .eq("publicado", true)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!v) return router.replace("/pendiente");
      // ¿Ya aceptó esta versión?
      const { data: previa } = await supabase
        .from("tnc_acceptances")
        .select("id")
        .eq("profile_id", user.id)
        .eq("version_id", v.id)
        .maybeSingle();
      if (previa) return router.replace("/pendiente");
      setVersion(v);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aceptar = async () => {
    if (!version) return;
    setGuardando(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.replace("/login");
    const { error } = await supabase.from("tnc_acceptances").insert({
      profile_id: user.id,
      version_id: version.id,
      user_agent: navigator.userAgent,
    });
    if (!error || error.code === "23505") {
      router.push("/pendiente");
      router.refresh();
    } else {
      setGuardando(false);
      alert("No se pudo registrar la aceptación: " + error.message);
    }
  };

  if (!version) return <Cargando texto="Cargando reglamento…" />;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="mb-5 text-center">
        <LogoVital tam="text-2xl" />
        <h1 className="mt-3 text-lg font-bold">Términos, Condiciones y Reglamento Interno</h1>
        <p className="text-sm text-tinta-suave">
          Paso 3 de 3 · Versión {version.version}
        </p>
      </div>
      <VisorTerminos
        contenidoMd={version.contenido_md}
        onAceptar={aceptar}
        cargando={guardando}
      />
    </main>
  );
}
