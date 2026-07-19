import { requierePerfil, leerConfig } from "@/lib/auth";
import { PanelKiosco } from "@/components/kiosco/PanelKiosco";

export const metadata = { title: "Recepción" };

/** Modo kiosco para las computadoras del establecimiento (cuenta del co-manager) */
export default async function PaginaKiosco() {
  await requierePerfil({ soloComanager: true });
  const gracia = await leerConfig<number>("gracia_minutos", 8);
  return <PanelKiosco graciaMinutos={Number(gracia)} />;
}
