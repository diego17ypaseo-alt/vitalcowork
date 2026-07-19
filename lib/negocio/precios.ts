// Motor de precios y paquetes (puro, testeable)

import type { Plan } from "@/lib/tipos";

/** Total de un paquete: horas × precio_hora del plan */
export function precioPaquete(plan: Plan, horas: number): number {
  return redondear2(horas * plan.precio_hora);
}

/** Total de N horas individuales al precio del plan base */
export function precioHorasIndividuales(planTriaje: Plan, bloques: number): number {
  return redondear2(bloques * planTriaje.precio_hora);
}

/**
 * Ahorro vs. Plan Triaje para el mismo número de horas
 * (p. ej. "Ronda Médica VIP: ahorras $150/mes" con 30h)
 */
export function ahorroVsTriaje(plan: Plan, planTriaje: Plan, horas: number): number {
  return redondear2(horas * (planTriaje.precio_hora - plan.precio_hora));
}

/** ¿Cumple el mínimo de horas del plan? */
export function cumpleMinimoPaquete(plan: Plan, horas: number): boolean {
  if (plan.min_horas_semana === null) return false; // Triaje no vende paquetes
  return horas >= plan.min_horas_semana;
}

/**
 * Penalización por cancelación (Art. 4):
 *  ≥24h → 0% | <24h → 50% | no-show → 100%
 * Devuelve la fracción penalizada y las horas devueltas al monedero.
 */
export function calcularPenalizacion(
  inicioReserva: Date,
  ahora: Date,
  opciones: { noShow?: boolean; pctDentro24h?: number } = {}
): { pct: number; horasDevueltas: number } {
  const pct24 = opciones.pctDentro24h ?? 0.5;
  if (opciones.noShow) return { pct: 1, horasDevueltas: 0 };
  const msRestantes = inicioReserva.getTime() - ahora.getTime();
  const pct = msRestantes >= 24 * 3600 * 1000 ? 0 : pct24;
  return { pct, horasDevueltas: redondear2(1 - pct) };
}

/**
 * Reagendamiento: ¿está permitido para este plan y esta reserva?
 * limite = null → ilimitado (Estancia Plus / Ronda Médica VIP)
 */
export function puedeReagendar(opts: {
  inicioReserva: Date;
  ahora: Date;
  anticipacionHoras: number; // configurable, inicial 4
  limitePlan: number | null;
  reagendamientosUsados: number;
}): { permitido: boolean; motivo?: string } {
  const msMin = opts.anticipacionHoras * 3600 * 1000;
  if (opts.inicioReserva.getTime() - opts.ahora.getTime() < msMin) {
    return {
      permitido: false,
      motivo: `Solo se puede reagendar con al menos ${opts.anticipacionHoras} horas de anticipación`,
    };
  }
  if (opts.limitePlan !== null && opts.reagendamientosUsados >= opts.limitePlan) {
    return {
      permitido: false,
      motivo: `Tu plan permite ${opts.limitePlan} reagendamiento(s) por reserva`,
    };
  }
  return { permitido: true };
}

/**
 * Excedente de tiempo (Art. 9): minutos de exceso y si corresponde
 * el cobro de una hora adicional (tras los minutos de gracia).
 */
export function evaluarExcedente(opts: {
  finBloque: Date;
  ahora: Date;
  graciaMinutos: number; // inicial 8
  siguienteFranjaOcupada: boolean;
}): {
  excesoMinutos: number;
  enGracia: boolean;
  cobraHoraExtra: boolean;
  alertaConflicto: boolean;
} {
  const excesoMs = opts.ahora.getTime() - opts.finBloque.getTime();
  const excesoMinutos = Math.max(0, Math.ceil(excesoMs / 60000));
  const enGracia = excesoMinutos > 0 && excesoMinutos <= opts.graciaMinutos;
  const superoGracia = excesoMinutos > opts.graciaMinutos;
  return {
    excesoMinutos,
    enGracia,
    cobraHoraExtra: superoGracia && !opts.siguienteFranjaOcupada,
    alertaConflicto: superoGracia && opts.siguienteFranjaOcupada,
  };
}

/** Horas de recompensa por derivación con pago confirmado */
export function horasPorDerivacion(
  catalogo: { id: number; horas: number }[],
  rewardId: number
): number {
  return catalogo.find((c) => c.id === rewardId)?.horas ?? 0;
}

export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatoUSD(n: number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}
