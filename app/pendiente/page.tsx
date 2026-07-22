import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { LogoVital } from "@/components/ui";
import { CerrarSesion } from "@/components/CerrarSesion";
import { enlaceWhatsApp } from "@/lib/whatsapp";

export default async function PaginaPendiente() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("estado, nombre_completo, cedula")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil) redirect("/registro/perfil");
  if (perfil.estado === "aprobado") redirect("/inicio");

  const { data: ws } = await supabase
    .from("settings").select("valor").eq("clave", "whatsapp_numero").maybeSingle();
  const numeroWhatsApp = (ws?.valor as string) ?? "593983936496";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <LogoVital tam="text-2xl" />
      <div className="mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-alerta-suave text-4xl">
        ⏳
      </div>
      <h1 className="mt-5 text-xl font-bold">Tu cuenta está en revisión</h1>
      <p className="mt-3 text-sm leading-relaxed text-tinta-suave">
        Hola, <b>{perfil.nombre_completo}</b>. El administrador ya fue
        notificado de tu solicitud y está verificando tu acreditación
        profesional. Te avisaremos cuando tu cuenta sea aprobada — normalmente
        en menos de 24 horas.
      </p>
      <div className="mt-8 w-full space-y-2">
        <a
          href={enlaceWhatsApp(numeroWhatsApp, {
            tipo: "registro_enviado",
            nombre: perfil.nombre_completo,
            cedula: perfil.cedula ?? undefined,
          })}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primario w-full !bg-[#25D366] py-3"
        >
          📲 Avisar por WhatsApp para agilizar mi aprobación
        </a>
        <Link href="/pendiente" className="btn-secundario w-full">
          Volver a comprobar si ya fui aprobado
        </Link>
        <CerrarSesion className="btn-fantasma w-full" />
      </div>
    </main>
  );
}
