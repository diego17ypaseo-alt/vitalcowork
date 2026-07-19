// Deep links wa.me con mensajes precargados por contexto (sin costo de API)

export type ContextoWhatsApp =
  | { tipo: "ayuda" }
  | { tipo: "pago_transferencia"; numeroReserva: string; monto: number }
  | { tipo: "agenda"; fecha: string; hora: number }
  | { tipo: "reservar" };

export function mensajeWhatsApp(ctx: ContextoWhatsApp): string {
  switch (ctx.tipo) {
    case "ayuda":
      return "Hola, necesito ayuda con VitalCowork";
    case "pago_transferencia":
      return `Hola, envío el comprobante de mi transferencia. Reserva N° ${ctx.numeroReserva} por $${ctx.monto.toFixed(2)}.`;
    case "agenda":
      return `Hola, quiero confirmar mi reserva del ${ctx.fecha} a las ${String(ctx.hora).padStart(2, "0")}:00 en VitalCowork.`;
    case "reservar":
      return "Hola, quiero reservar un espacio en VitalCowork. Mi nombre y cédula son: ";
  }
}

export function enlaceWhatsApp(numero: string, ctx: ContextoWhatsApp): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeWhatsApp(ctx))}`;
}
