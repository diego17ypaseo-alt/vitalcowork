import { describe, expect, it } from "vitest";
import { feriadosEcuador, pascua } from "@/lib/feriados-ecuador";

describe("feriados de Ecuador con traslados según ley", () => {
  it("calcula la Pascua correctamente", () => {
    expect(pascua(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(pascua(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });

  it("feriados 2026: fechas observadas", () => {
    const f = feriadosEcuador(2026);
    const fechas = f.map((x) => x.fecha);
    expect(fechas).toContain("2026-01-01"); // Año Nuevo (no trasladable, jueves)
    expect(fechas).toContain("2026-02-16"); // Carnaval lunes
    expect(fechas).toContain("2026-02-17"); // Carnaval martes
    expect(fechas).toContain("2026-04-03"); // Viernes Santo
    expect(fechas).toContain("2026-05-01"); // 1 Mayo (viernes, queda)
    expect(fechas).toContain("2026-05-25"); // 24 Mayo domingo → lunes 25
    expect(fechas).toContain("2026-08-10"); // lunes, queda
    expect(fechas).toContain("2026-10-09"); // viernes, queda
    expect(fechas).toContain("2026-11-02"); // lunes, queda
    expect(fechas).toContain("2026-11-03"); // martes: el traslado colisiona con el 2 → queda
    expect(fechas).toContain("2026-12-25"); // Navidad no trasladable
  });

  it("feriados 2027: aplica traslados martes→lunes, miércoles→viernes, sábado→viernes", () => {
    const fechas = feriadosEcuador(2027).map((x) => x.fecha);
    expect(fechas).toContain("2027-04-30"); // 1 Mayo sábado → viernes 30 abr
    expect(fechas).toContain("2027-08-09"); // 10 Ago martes → lunes 9
    expect(fechas).toContain("2027-10-08"); // 9 Oct sábado → viernes 8
    expect(fechas).toContain("2027-11-01"); // 2 Nov martes → lunes 1
    expect(fechas).toContain("2027-11-05"); // 3 Nov miércoles → viernes 5
  });

  it("nunca duplica fechas de descanso", () => {
    for (const anio of [2026, 2027, 2028, 2029, 2030]) {
      const fechas = feriadosEcuador(anio).map((x) => x.fecha);
      expect(new Set(fechas).size).toBe(fechas.length);
    }
  });
});
