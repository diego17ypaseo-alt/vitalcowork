// Deep links wa.me con mensajes precargados por contexto (sin costo de API).
// Nota: el envío 100% automático requiere la API de WhatsApp Business (Meta,
// con costo); aquí usamos enlaces de un toque con el mensaje ya escrito.

export type ContextoWhatsApp =
  | { tipo: "ayuda" }
  | { tipo: "pago_transferencia"; numeroReserva: string; monto: number }
  | { tipo: "agenda"; fecha: string; hora: number }
  | { tipo: "reservar" }
  | { tipo: "registro_enviado"; nombre: string; cedula?: string }
  | { tipo: "cuenta_aprobada"; nombre: string; url: string }
  | { tipo: "pago_ventanilla"; nombre: string; monto: number; detalle: string };

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
    case "registro_enviado":
      return `Hola, soy ${ctx.nombre}${ctx.cedula ? ` (C.I. ${ctx.cedula})` : ""}. Acabo de enviar mi solicitud de registro en VitalCowork con mi acreditación. Le agradezco revisarla y aprobarla. 🙏`;
    case "cuenta_aprobada":
      return `✅ Hola ${ctx.nombre}, le saludamos de VitalCowork. Su cuenta fue APROBADA: ya puede reservar su consultorio cuando lo necesite. Ingrese aquí: ${ctx.url}`;
    case "pago_ventanilla":
      return `Hola, soy ${ctx.nombre}. Confirmé una reserva en VitalCowork con pago en ventanilla (${ctx.detalle}). Valor pendiente: $${ctx.monto.toFixed(2)}. Lo cancelo en recepción. ✅`;
  }
}

/** Enlace al número del establecimiento (settings.whatsapp_numero) */
export function enlaceWhatsApp(numero: string, ctx: ContextoWhatsApp): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeWhatsApp(ctx))}`;
}

/**
 * Normaliza un teléfono ecuatoriano al formato internacional de wa.me:
 * "0983936496" → "593983936496"; acepta también "+593..." o "593...".
 */
export function normalizarTelefonoEcuador(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("593")) return digitos;
  if (digitos.startsWith("0")) return "593" + digitos.slice(1);
  if (digitos.length === 9) return "593" + digitos; // sin el 0 inicial
  return digitos;
}

/** Enlace wa.me a un número arbitrario (p. ej. el celular de un co-med) */
export function enlaceWhatsAppANumero(telefono: string, ctx: ContextoWhatsApp): string | null {
  const numero = normalizarTelefonoEcuador(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeWhatsApp(ctx))}`;
}
