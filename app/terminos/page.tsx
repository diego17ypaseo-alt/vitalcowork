import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ContenidoMarkdown } from "@/components/VisorTerminos";
import { LogoVital } from "@/components/ui";

/** Vista pública de los Términos y Reglamento Interno (solo lectura) */
export default async function PaginaTerminosPublica() {
  const supabase = await crearClienteServidor();
  const { data: version } = await supabase
    .from("tnc_versions")
    .select("version, contenido_md, creado_en")
    .eq("publicado", true)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/">
          <LogoVital tam="text-xl" />
        </Link>
        <Link href="/" className="text-sm font-semibold text-primario">← Volver</Link>
      </div>
      {version ? (
        <div className="tarjeta p-6 text-[13.5px] leading-relaxed">
          <p className="mb-4 text-xs text-tinta-suave">Versión {version.version}</p>
          <ContenidoMarkdown md={version.contenido_md} />
        </div>
      ) : (
        <p className="text-center text-sm text-tinta-suave">
          Los términos estarán disponibles próximamente.
        </p>
      )}
    </main>
  );
}
