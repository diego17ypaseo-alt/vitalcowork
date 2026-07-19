"use client";

// Botón flotante de WhatsApp, visible en toda la app.
// El mensaje precargado cambia según el contexto (deep link wa.me, sin costo de API).

import { usePathname } from "next/navigation";
import { enlaceWhatsApp, type ContextoWhatsApp } from "@/lib/whatsapp";

export function WhatsAppFab({
  numero,
  contexto,
}: {
  numero: string;
  contexto?: ContextoWhatsApp;
}) {
  const ruta = usePathname();
  const ctx: ContextoWhatsApp =
    contexto ??
    (ruta?.startsWith("/pago")
      ? { tipo: "ayuda" }
      : ruta?.startsWith("/calendario") || ruta?.startsWith("/reservas")
        ? { tipo: "reservar" }
        : { tipo: "ayuda" });

  return (
    <a
      href={enlaceWhatsApp(numero, ctx)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-20 right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-[#25D366] shadow-lg shadow-black/20 transition hover:scale-105 active:scale-95"
      style={{ height: 52, width: 52 }}
    >
      <svg width="28" height="28" viewBox="0 0 32 32" fill="white">
        <path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.8 5 2.3 7L4.5 27a1 1 0 0 0 1.2 1.3l5.3-1.7a12 12 0 0 0 5 1.1c6.6 0 12-5.3 12-11.9S22.6 3 16 3zm0 21.8c-1.6 0-3.2-.4-4.5-1.1l-.4-.2-3.1 1 1-2.9-.3-.4a9.8 9.8 0 0 1-2-5.9C6.7 9.5 10.9 5.4 16 5.4s9.3 4.1 9.3 9.5-4.2 9.9-9.3 9.9zm5.4-7.3c-.3-.2-1.7-.9-2-1s-.5-.1-.7.2l-.9 1.1c-.2.2-.3.2-.6.1a7.6 7.6 0 0 1-3.8-3.3c-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.2.2 2.2 3.4 5.4 4.8 2 .9 2.8.9 3.8.8.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4z" />
      </svg>
    </a>
  );
}
