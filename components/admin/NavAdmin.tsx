"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", etiqueta: "📊 Dashboard", exacta: true },
  { href: "/admin/aprobaciones", etiqueta: "✅ Aprobaciones" },
  { href: "/admin/comeds", etiqueta: "👩‍⚕️ Co-meds" },
  { href: "/admin/ventanilla", etiqueta: "🪟 Ventanilla" },
  { href: "/admin/recompensas", etiqueta: "🎁 Recompensas" },
  { href: "/admin/config", etiqueta: "⚙️ Configuración" },
];

export function NavAdmin() {
  const ruta = usePathname();
  return (
    <nav className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4">
      {ITEMS.map((i) => {
        const activo = i.exacta ? ruta === i.href : ruta?.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition ${
              activo
                ? "bg-primario text-white"
                : "border border-borde bg-tarjeta text-tinta-suave hover:border-acento"
            }`}
          >
            {i.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
