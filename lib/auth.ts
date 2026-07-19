import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/tipos";

/**
 * Carga sesión + perfil y aplica las puertas del onboarding:
 *  sin sesión → /login · sin perfil → /registro/perfil ·
 *  sin aceptar T&C vigentes → /registro/terminos ·
 *  pendiente de aprobación → /pendiente
 */
export async function requierePerfil(opciones?: {
  permitirPendiente?: boolean;
  soloComanager?: boolean;
}): Promise<{ perfil: Perfil; userId: string }> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil) redirect("/registro/perfil");

  if (perfil.rol !== "comanager") {
    // ¿Aceptó la última versión publicada de los T&C?
    const { data: version } = await supabase
      .from("tnc_versions")
      .select("id")
      .eq("publicado", true)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (version) {
      const { data: aceptacion } = await supabase
        .from("tnc_acceptances")
        .select("id")
        .eq("profile_id", user.id)
        .eq("version_id", version.id)
        .maybeSingle();
      if (!aceptacion) redirect("/registro/terminos");
    }
    if (perfil.estado !== "aprobado" && !opciones?.permitirPendiente) {
      redirect("/pendiente");
    }
  }

  if (opciones?.soloComanager && perfil.rol !== "comanager") redirect("/inicio");

  return { perfil: perfil as Perfil, userId: user.id };
}

/** Valor de una clave de settings (servidor) */
export async function leerConfig<T>(clave: string, porDefecto: T): Promise<T> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("settings")
    .select("valor")
    .eq("clave", clave)
    .maybeSingle();
  return (data?.valor as T) ?? porDefecto;
}
