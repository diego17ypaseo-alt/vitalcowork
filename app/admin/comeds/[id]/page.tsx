import { crearClienteServidor } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { FichaComed } from "@/components/admin/FichaComed";

export const metadata = { title: "Ficha de co-med" };

export default async function PaginaFichaComed({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, nombre_completo")
    .eq("id", id)
    .maybeSingle();
  if (!perfil) notFound();

  return <FichaComed comedId={id} />;
}
