import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { LogoVital } from "@/components/ui";
import { WhatsAppFab } from "@/components/WhatsAppFab";
import { CerrarSesion } from "@/components/CerrarSesion";

export default async function PaginaPendiente() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("estado, nombre_completo")
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
        Hola, <b>{perfil.nombre_completo}</b>. El administrador está verificando
        tu acreditación profesional. Te avisaremos por correo y notificación
        cuando tu cuenta sea aprobada — normalmente en menos de 24 horas.
      </p>
      <p className="mt-4 text-xs text-tinta-suave">
        ¿Tienes prisa? Escríbenos por WhatsApp y agilizamos la revisión.
      </p>
      <div className="mt-8 w-full space-y-2">
        <Link href="/pendiente" className="btn-secundario w-full">
          Volver a comprobar
        </Link>
        <CerrarSesion className="btn-fantasma w-full" />
      </div>
      <WhatsAppFab numero={numeroWhatsApp} contexto={{ tipo: "ayuda" }} />
    </main>
  );
}
