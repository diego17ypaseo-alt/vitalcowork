import { requierePerfil, leerConfig } from "@/lib/auth";
import { BarraNavegacion } from "@/components/BarraNavegacion";
import { WhatsAppFab } from "@/components/WhatsAppFab";

export default async function LayoutComed({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await requierePerfil();
  const numeroWhatsApp = await leerConfig<string>("whatsapp_numero", "593983936496");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-20">
      {children}
      <WhatsAppFab numero={numeroWhatsApp} />
      <BarraNavegacion esComanager={perfil.rol === "comanager"} />
    </div>
  );
}
