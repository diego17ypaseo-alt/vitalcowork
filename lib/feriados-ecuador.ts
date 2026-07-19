// Feriados nacionales de Ecuador con reglas de traslado según la
// Ley Orgánica reformatoria (2016) a la LOSEP y al Código del Trabajo:
//  · martes → lunes anterior
//  · miércoles/jueves → viernes de esa semana
//  · sábado → viernes anterior; domingo → lunes posterior
//  · NO trasladables: 1 de enero, 25 de diciembre y Carnaval
// Si un traslado colisiona con otro feriado, se mantiene la fecha original.

export interface Feriado {
  fecha: string; // fecha de descanso observada (YYYY-MM-DD)
  original: string; // fecha original del feriado
  nombre: string;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, 12));
}

/** Domingo de Pascua (algoritmo de Meeus/Butcher) */
export function pascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(anio, mes, dia);
}

function trasladar(fecha: Date): Date {
  const dia = fecha.getUTCDay(); // 0=dom ... 6=sáb
  const t = new Date(fecha);
  if (dia === 2) t.setUTCDate(t.getUTCDate() - 1); // martes → lunes
  else if (dia === 3) t.setUTCDate(t.getUTCDate() + 2); // miércoles → viernes
  else if (dia === 4) t.setUTCDate(t.getUTCDate() + 1); // jueves → viernes
  else if (dia === 6) t.setUTCDate(t.getUTCDate() - 1); // sábado → viernes
  else if (dia === 0) t.setUTCDate(t.getUTCDate() + 1); // domingo → lunes
  return t;
}

export function feriadosEcuador(anio: number): Feriado[] {
  const domingoPascua = pascua(anio);
  const lunesCarnaval = new Date(domingoPascua);
  lunesCarnaval.setUTCDate(lunesCarnaval.getUTCDate() - 48);
  const martesCarnaval = new Date(domingoPascua);
  martesCarnaval.setUTCDate(martesCarnaval.getUTCDate() - 47);
  const viernesSanto = new Date(domingoPascua);
  viernesSanto.setUTCDate(viernesSanto.getUTCDate() - 2);

  const fijos: { fecha: Date; nombre: string; trasladable: boolean }[] = [
    { fecha: utc(anio, 1, 1), nombre: "Año Nuevo", trasladable: false },
    { fecha: lunesCarnaval, nombre: "Carnaval", trasladable: false },
    { fecha: martesCarnaval, nombre: "Carnaval", trasladable: false },
    { fecha: viernesSanto, nombre: "Viernes Santo", trasladable: false },
    { fecha: utc(anio, 5, 1), nombre: "Día del Trabajo", trasladable: true },
    { fecha: utc(anio, 5, 24), nombre: "Batalla de Pichincha", trasladable: true },
    { fecha: utc(anio, 8, 10), nombre: "Primer Grito de Independencia", trasladable: true },
    { fecha: utc(anio, 10, 9), nombre: "Independencia de Guayaquil", trasladable: true },
    { fecha: utc(anio, 11, 2), nombre: "Día de los Difuntos", trasladable: true },
    { fecha: utc(anio, 11, 3), nombre: "Independencia de Cuenca", trasladable: true },
    { fecha: utc(anio, 12, 25), nombre: "Navidad", trasladable: false },
  ];

  const resultado: Feriado[] = [];
  const ocupadas = new Set<string>();
  for (const f of fijos) {
    let observada = f.trasladable ? trasladar(f.fecha) : f.fecha;
    // Colisión con otro feriado: vuelve a la fecha original; si también está
    // ocupada, corre al siguiente día libre (comportamiento de los decretos,
    // p. ej. 2 y 3 de noviembre consecutivos).
    if (ocupadas.has(fmt(observada))) observada = new Date(f.fecha);
    while (ocupadas.has(fmt(observada))) {
      observada = new Date(observada);
      observada.setUTCDate(observada.getUTCDate() + 1);
    }
    ocupadas.add(fmt(observada));
    resultado.push({ fecha: fmt(observada), original: fmt(f.fecha), nombre: f.nombre });
  }
  return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
