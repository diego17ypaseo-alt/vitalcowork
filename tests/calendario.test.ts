import { describe, expect, it } from "vitest";
import {
  diasHabilesSemana,
  esDiaHabil,
  horasReceso,
  horasReservables,
  inicioBloque,
  lunesDeSemana,
  mismaSemanaLaboral,
  ultimoDiaDelMes,
} from "@/lib/negocio/calendario";

describe("horario de jornadas", () => {
  it("genera las 8 horas reservables del horario inicial (9-12 y 13-18)", () => {
    expect(horasReservables([[9, 12], [13, 18]])).toEqual([9, 10, 11, 13, 14, 15, 16, 17]);
  });

  it("detecta el receso de almuerzo (12:00-13:00)", () => {
    expect(horasReceso([[9, 12], [13, 18]])).toEqual([12]);
  });

  it("soporta horarios reconfigurados por el co-manager", () => {
    expect(horasReservables([[8, 13], [14, 19]])).toEqual([8, 9, 10, 11, 12, 14, 15, 16, 17, 18]);
    expect(horasReceso([[8, 13], [14, 19]])).toEqual([13]);
  });
});

describe("días hábiles (solo lunes a viernes)", () => {
  it("acepta lunes a viernes y rechaza fines de semana", () => {
    expect(esDiaHabil("2026-07-20")).toBe(true); // lunes
    expect(esDiaHabil("2026-07-24")).toBe(true); // viernes
    expect(esDiaHabil("2026-07-25")).toBe(false); // sábado
    expect(esDiaHabil("2026-07-26")).toBe(false); // domingo
  });

  it("devuelve los 5 días hábiles de la semana", () => {
    expect(diasHabilesSemana("2026-07-22")).toEqual([
      "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
    ]);
  });
});

describe("ventanas de reagendamiento", () => {
  it("identifica la misma semana laboral (ventana del Plan Triaje)", () => {
    expect(mismaSemanaLaboral("2026-07-20", "2026-07-24")).toBe(true);
    expect(mismaSemanaLaboral("2026-07-24", "2026-07-27")).toBe(false);
    expect(lunesDeSemana("2026-07-26")).toBe("2026-07-20"); // domingo pertenece a esa semana
  });

  it("calcula el fin de mes (ventana del Plan Triaje para reservar)", () => {
    expect(ultimoDiaDelMes("2026-02-10")).toBe("2026-02-28");
    expect(ultimoDiaDelMes("2028-02-10")).toBe("2028-02-29"); // bisiesto
    expect(ultimoDiaDelMes("2026-12-01")).toBe("2026-12-31");
  });
});

describe("zona horaria America/Guayaquil (UTC-5 fijo, sin horario de verano)", () => {
  it("convierte un bloque local a instante UTC correcto", () => {
    const d = inicioBloque("2026-08-10", 9);
    expect(d.toISOString()).toBe("2026-08-10T14:00:00.000Z"); // 09:00 GYE = 14:00 UTC
  });
});
