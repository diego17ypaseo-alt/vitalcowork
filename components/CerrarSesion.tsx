"use client";

import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

export function CerrarSesion({ className = "btn-fantasma" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
      onClick={async () => {
        await crearClienteNavegador().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}
