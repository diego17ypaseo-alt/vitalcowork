"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/inicio", etiqueta: "Inicio", icono: IconoInicio },
  { href: "/calendario", etiqueta: "Calendario", icono: IconoCalendario },
  { href: "/reservas", etiqueta: "Reservas", icono: IconoReservas },
  { href: "/planes", etiqueta: "Planes", icono: IconoPlanes },
  { href: "/recompensas", etiqueta: "Recompensas", icono: IconoRegalo },
];

export function BarraNavegacion({ esComanager }: { esComanager?: boolean }) {
  const ruta = usePathname();
  const items = esComanager
    ? [...ITEMS.slice(0, 3), { href: "/admin", etiqueta: "Panel", icono: IconoPanel }]
    : ITEMS;

  return (
    <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-3xl -translate-x-1/2 border-t border-borde bg-tarjeta/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {items.map((item) => {
          const activo = ruta?.startsWith(item.href);
          const Icono = item.icono;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${
                activo ? "text-primario" : "text-tinta-suave"
              }`}
            >
              <Icono activo={!!activo} />
              {item.etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function IconoInicio({ activo }: { activo: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}
function IconoCalendario({ activo }: { activo: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" fill={activo ? "currentColor" : "none"} />
      <path d="M8 3v4M16 3v4M3 10h18" stroke={activo ? "var(--vc-tarjeta)" : "currentColor"} />
    </svg>
  );
}
function IconoReservas({ activo }: { activo: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" stroke={activo ? "var(--vc-tarjeta)" : "currentColor"} strokeLinecap="round" />
    </svg>
  );
}
function IconoPlanes({ activo }: { activo: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l2.5 5.3 5.5.7-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.5-.7z" strokeLinejoin="round" />
    </svg>
  );
}
function IconoRegalo({ activo }: { activo: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M12 9v12M3 13h18M12 9c-4 0-5-2-5-3.5A2 2 0 0 1 9.5 3C11.5 3 12 6 12 9zm0 0c4 0 5-2 5-3.5A2 2 0 0 0 14.5 3C12.5 3 12 6 12 9z" stroke={activo ? "var(--vc-tarjeta)" : "currentColor"} />
    </svg>
  );
}
function IconoPanel({ activo }: { activo: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
