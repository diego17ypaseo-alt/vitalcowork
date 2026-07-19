// Lógica pura del calendario (testeable, sin dependencias de red)
// Zona horaria de negocio: America/Guayaquil

import type { BloqueoFeriado } from "@/lib/tipos";

export const ZONA_HORARIA = "America/Guayaquil";

export type Jornadas = [number, number][]; // [[9,12],[13,18]]
export const JORNADAS_INICIALES: Jornadas = [
  [9, 12],
  [13, 18],
];

/** Fecha actual (YYYY-MM-DD) en America/Guayaquil */
export function hoyGye(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Hora actual (0-23) en America/Guayaquil */
export function horaActualGye(ahora: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA_HORARIA,
      hour: "2-digit",
      hour12: false,
    }).format(ahora),
    10
  );
}

/** Instante UTC del inicio de un bloque (fecha + hora local de Guayaquil, UTC-5 fijo) */
export function inicioBloque(fecha: string, hora: number): Date {
  // Ecuador continental no tiene horario de verano: siempre UTC-5
  return new Date(`${fecha}T${String(hora).padStart(2, "0")}:00:00-05:00`);
}

/** Horas de inicio reservables según las jornadas configuradas */
export function horasReservables(jornadas: Jornadas = JORNADAS_INICIALES): number[] {
  const horas: number[] = [];
  for (const [inicio, fin] of jornadas) {
    for (let h = inicio; h < fin; h++) horas.push(h);
  }
  return horas;
}

/** Horas de receso (huecos entre jornadas), p. ej. [12] = almuerzo */
export function horasReceso(jornadas: Jornadas = JORNADAS_INICIALES): number[] {
  const horas: number[] = [];
  const ordenadas = [...jornadas].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < ordenadas.length - 1; i++) {
    for (let h = ordenadas[i][1]; h < ordenadas[i + 1][0]; h++) horas.push(h);
  }
  return horas;
}

export function esDiaHabil(fecha: string): boolean {
  const d = new Date(`${fecha}T12:00:00-05:00`).getUTCDay();
  return d >= 1 && d <= 5;
}

export function bloqueoDelDia(
  fecha: string,
  bloqueos: BloqueoFeriado[],
  spaceId?: string
): BloqueoFeriado | undefined {
  return bloqueos.find(
    (b) =>
      b.fecha === fecha &&
      (b.space_id === null || b.space_id === spaceId) &&
      b.hora_inicio === null
  );
}

export function horaBloqueada(
  fecha: string,
  hora: number,
  bloqueos: BloqueoFeriado[],
  spaceId?: string
): BloqueoFeriado | undefined {
  return bloqueos.find(
    (b) =>
      b.fecha === fecha &&
      (b.space_id === null || b.space_id === spaceId) &&
      (b.hora_inicio === null || (hora >= b.hora_inicio && hora < (b.hora_fin ?? 24)))
  );
}

/** Suma días a una fecha YYYY-MM-DD */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de una fecha */
export function lunesDeSemana(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dia = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return sumarDias(fecha, 1 - dia);
}

/** Los 5 días hábiles (lun–vie) de la semana de una fecha */
export function diasHabilesSemana(fecha: string): string[] {
  const lunes = lunesDeSemana(fecha);
  return [0, 1, 2, 3, 4].map((i) => sumarDias(lunes, i));
}

/** ¿Dos fechas caen en la misma semana laboral? (ventana de reagendamiento Triaje) */
export function mismaSemanaLaboral(a: string, b: string): boolean {
  return lunesDeSemana(a) === lunesDeSemana(b);
}

export function ultimoDiaDelMes(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))
    .toISOString()
    .slice(0, 10);
}

/** Matriz de semanas (fechas YYYY-MM-DD) para la vista mensual */
export function semanasDelMes(anio: number, mes: number): string[][] {
  const primero = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const inicio = lunesDeSemana(primero);
  const semanas: string[][] = [];
  let cursor = inicio;
  for (let s = 0; s < 6; s++) {
    const semana = [0, 1, 2, 3, 4].map((i) => sumarDias(cursor, i));
    semanas.push(semana);
    cursor = sumarDias(cursor, 7);
    if (new Date(`${cursor}T12:00:00Z`).getUTCMonth() + 1 !== mes && s >= 3) break;
  }
  return semanas.filter((sem) => sem.some((f) => f.slice(5, 7) === String(mes).padStart(2, "0")));
}

export function formatoFechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${fecha}T12:00:00Z`));
}

export function formatoFechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${fecha}T12:00:00Z`));
}

export function formatoHora(hora: number): string {
  return `${String(hora).padStart(2, "0")}:00`;
}

export function formatoRangoHora(hora: number): string {
  return `${formatoHora(hora)}–${formatoHora(hora + 1)}`;
}
