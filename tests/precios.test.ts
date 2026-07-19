import { describe, expect, it } from "vitest";
import {
  ahorroVsTriaje,
  calcularPenalizacion,
  cumpleMinimoPaquete,
  evaluarExcedente,
  precioPaquete,
  puedeReagendar,
} from "@/lib/negocio/precios";
import type { Plan } from "@/lib/tipos";

const triaje: Plan = {
  id: "triaje", nivel: "Básico", nombre: "Plan Triaje", precio_hora: 15,
  min_horas_semana: null, min_horas_mes: null, reagendamientos_por_reserva: 1,
  color: "#0e7490", badge: null, copy_comercial: null, orden: 1, activo: true,
};
const estancia: Plan = {
  ...triaje, id: "estancia", nivel: "Silver", nombre: "Plan Estancia Plus",
  precio_hora: 12, min_horas_semana: 5, min_horas_mes: 15,
  reagendamientos_por_reserva: null,
};
const vip: Plan = {
  ...triaje, id: "vip", nivel: "Gold", nombre: "Plan Ronda Médica VIP",
  precio_hora: 10, min_horas_semana: 10, min_horas_mes: 30,
  reagendamientos_por_reserva: null,
};

describe("motor de precios y paquetes", () => {
  it("calcula el precio del paquete: horas × precio_hora", () => {
    expect(precioPaquete(estancia, 15)).toBe(180);
    expect(precioPaquete(vip, 30)).toBe(300);
    expect(precioPaquete(estancia, 5)).toBe(60);
  });

  it("calcula el ahorro vs. Plan Triaje (ej. del brief: VIP ahorra $150/mes con 30h)", () => {
    expect(ahorroVsTriaje(vip, triaje, 30)).toBe(150);
    expect(ahorroVsTriaje(estancia, triaje, 15)).toBe(45);
    expect(ahorroVsTriaje(triaje, triaje, 10)).toBe(0);
  });

  it("valida el mínimo de horas del paquete", () => {
    expect(cumpleMinimoPaquete(estancia, 5)).toBe(true);
    expect(cumpleMinimoPaquete(estancia, 4)).toBe(false);
    expect(cumpleMinimoPaquete(vip, 10)).toBe(true);
    expect(cumpleMinimoPaquete(vip, 9)).toBe(false);
    expect(cumpleMinimoPaquete(triaje, 100)).toBe(false); // Triaje no vende paquetes
  });
});

describe("política de cancelación (Art. 4)", () => {
  const inicio = new Date("2026-08-10T14:00:00-05:00");

  it("≥24h de anticipación: sin costo, devuelve la hora completa", () => {
    const r = calcularPenalizacion(inicio, new Date("2026-08-09T13:59:00-05:00"));
    expect(r.pct).toBe(0);
    expect(r.horasDevueltas).toBe(1);
  });

  it("dentro de las 24h: penaliza el 50%", () => {
    const r = calcularPenalizacion(inicio, new Date("2026-08-09T14:01:00-05:00"));
    expect(r.pct).toBe(0.5);
    expect(r.horasDevueltas).toBe(0.5);
  });

  it("límite exacto de 24h cuenta como sin costo", () => {
    const r = calcularPenalizacion(inicio, new Date("2026-08-09T14:00:00-05:00"));
    expect(r.pct).toBe(0);
  });

  it("no-show: penaliza el 100%", () => {
    const r = calcularPenalizacion(inicio, new Date("2026-08-10T15:00:00-05:00"), { noShow: true });
    expect(r.pct).toBe(1);
    expect(r.horasDevueltas).toBe(0);
  });

  it("respeta un porcentaje configurable", () => {
    const r = calcularPenalizacion(inicio, new Date("2026-08-10T10:00:00-05:00"), { pctDentro24h: 0.3 });
    expect(r.pct).toBe(0.3);
    expect(r.horasDevueltas).toBe(0.7);
  });
});

describe("reagendamiento por plan", () => {
  const inicio = new Date("2026-08-10T14:00:00-05:00");

  it("bloquea a menos de la anticipación mínima (4h)", () => {
    const r = puedeReagendar({
      inicioReserva: inicio,
      ahora: new Date("2026-08-10T10:30:00-05:00"),
      anticipacionHoras: 4,
      limitePlan: null,
      reagendamientosUsados: 0,
    });
    expect(r.permitido).toBe(false);
  });

  it("permite con 4h o más de anticipación", () => {
    const r = puedeReagendar({
      inicioReserva: inicio,
      ahora: new Date("2026-08-10T10:00:00-05:00"),
      anticipacionHoras: 4,
      limitePlan: null,
      reagendamientosUsados: 99,
    });
    expect(r.permitido).toBe(true);
  });

  it("Plan Triaje: máximo 1 reagendamiento por reserva", () => {
    const base = {
      inicioReserva: inicio,
      ahora: new Date("2026-08-09T14:00:00-05:00"),
      anticipacionHoras: 4,
      limitePlan: 1,
    };
    expect(puedeReagendar({ ...base, reagendamientosUsados: 0 }).permitido).toBe(true);
    expect(puedeReagendar({ ...base, reagendamientosUsados: 1 }).permitido).toBe(false);
  });

  it("Estancia Plus / Ronda Médica VIP: ilimitado (limite null)", () => {
    const r = puedeReagendar({
      inicioReserva: inicio,
      ahora: new Date("2026-08-09T14:00:00-05:00"),
      anticipacionHoras: 4,
      limitePlan: null,
      reagendamientosUsados: 500,
    });
    expect(r.permitido).toBe(true);
  });
});

describe("excedente de tiempo (Art. 9: 8 min de gracia)", () => {
  const fin = new Date("2026-08-10T15:00:00-05:00");

  it("dentro de la hora: sin exceso", () => {
    const r = evaluarExcedente({
      finBloque: fin, ahora: new Date("2026-08-10T14:59:00-05:00"),
      graciaMinutos: 8, siguienteFranjaOcupada: false,
    });
    expect(r.excesoMinutos).toBe(0);
    expect(r.cobraHoraExtra).toBe(false);
  });

  it("dentro de los 8 minutos de gracia: no cobra", () => {
    const r = evaluarExcedente({
      finBloque: fin, ahora: new Date("2026-08-10T15:07:00-05:00"),
      graciaMinutos: 8, siguienteFranjaOcupada: false,
    });
    expect(r.enGracia).toBe(true);
    expect(r.cobraHoraExtra).toBe(false);
  });

  it("superada la gracia con franja libre: cobra una hora adicional", () => {
    const r = evaluarExcedente({
      finBloque: fin, ahora: new Date("2026-08-10T15:09:00-05:00"),
      graciaMinutos: 8, siguienteFranjaOcupada: false,
    });
    expect(r.cobraHoraExtra).toBe(true);
    expect(r.alertaConflicto).toBe(false);
  });

  it("superada la gracia con franja ocupada: alerta urgente, no cobra automático", () => {
    const r = evaluarExcedente({
      finBloque: fin, ahora: new Date("2026-08-10T15:20:00-05:00"),
      graciaMinutos: 8, siguienteFranjaOcupada: true,
    });
    expect(r.cobraHoraExtra).toBe(false);
    expect(r.alertaConflicto).toBe(true);
  });
});
