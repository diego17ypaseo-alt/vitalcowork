import Link from "next/link";
import { requierePerfil } from "@/lib/auth";
import { LogoVital } from "@/components/ui";
import { NavAdmin } from "@/components/admin/NavAdmin";

export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  await requierePerfil({ soloComanager: true });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-24 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <Link href="/admin"><LogoVital tam="text-xl" /></Link>
        <div className="flex items-center gap-2">
          <Link href="/kiosco" className="btn-secundario !py-1.5 text-xs">🖥 Kiosco</Link>
          <Link href="/calendario" className="btn-fantasma !py-1.5 text-xs">Calendario</Link>
        </div>
      </header>
      <NavAdmin />
      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}
