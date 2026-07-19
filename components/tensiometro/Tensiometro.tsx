"use client";

// "Tensiómetro de saldo": manómetro aneroide clásico (SVG vectorial animado).
// Diseño genérico sin marcas comerciales — solo el logo VitalCowork.
//  · La aguja marca las horas restantes (más saldo = más "presión")
//  · Zonas verde / amarilla / roja según saldo y vigencia
//  · La pera "bombea" cuando se acreditan horas nuevas

import { useEffect, useRef, useState } from "react";

const CX = 100;
const CY = 100;
const BARRIDO = 240; // grados de la escala
const ANG0 = -120; // ángulo inicial (izquierda abajo)

function polar(r: number, anguloDeg: number): [number, number] {
  const rad = ((anguloDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function arco(r: number, desdeFrac: number, hastaFrac: number): string {
  const a1 = ANG0 + BARRIDO * desdeFrac;
  const a2 = ANG0 + BARRIDO * hastaFrac;
  const [x1, y1] = polar(r, a1);
  const [x2, y2] = polar(r, a2);
  const grande = a2 - a1 > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2}`;
}

export function Tensiometro({
  horas,
  maxHoras,
  diasRestantes,
  etiqueta,
}: {
  horas: number;
  maxHoras: number;
  diasRestantes: number | null;
  etiqueta?: string;
}) {
  const max = Math.max(maxHoras, 1);
  const frac = Math.min(Math.max(horas / max, 0), 1);
  const angulo = ANG0 + BARRIDO * frac;
  const previa = useRef(horas);
  const [bombeando, setBombeando] = useState(false);

  // La pera bombea cuando el saldo SUBE (acreditación de horas)
  useEffect(() => {
    if (horas > previa.current) {
      setBombeando(true);
      const t = setTimeout(() => setBombeando(false), 2200);
      return () => clearTimeout(t);
    }
    previa.current = horas;
  }, [horas]);
  useEffect(() => {
    previa.current = horas;
  }, [horas]);

  const vigenciaCritica = diasRestantes !== null && diasRestantes <= 5;
  const zonaTexto =
    frac <= 0.25 || vigenciaCritica ? "text-peligro" : frac <= 0.55 ? "text-alerta" : "text-exito";

  // Ticks de la escala
  const ticks = Array.from({ length: 21 }, (_, i) => i / 20);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 232 190" className="w-full max-w-70" role="img"
        aria-label={`Tensiómetro de saldo: ${horas} horas restantes`}>
        {/* Manguera hacia la pera */}
        <path d="M 172 100 C 196 104 200 130 196 150" fill="none" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />

        {/* Pera de insuflación (decorativa, bombea al acreditar horas) */}
        <g className={bombeando ? "pera-bombeando" : ""}>
          <ellipse cx="197" cy="163" rx="17" ry="22" fill="#155e70" />
          <ellipse cx="192" cy="156" rx="6" ry="9" fill="#ffffff" opacity="0.18" />
          <rect x="192" y="140" width="10" height="8" rx="2" fill="#64748b" />
        </g>

        {/* Cuerpo del manómetro */}
        <circle cx={CX} cy={CY} r="86" fill="#d7dee3" />
        <circle cx={CX} cy={CY} r="80" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
        {/* Carátula blanca */}
        <circle cx={CX} cy={CY} r="72" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />

        {/* Zonas de color (rojo = por agotarse, verde = holgado) */}
        <path d={arco(62, 0, 0.25)} stroke="#dc2626" strokeWidth="9" fill="none" strokeLinecap="butt" opacity="0.85" />
        <path d={arco(62, 0.25, 0.55)} stroke="#f59e0b" strokeWidth="9" fill="none" opacity="0.85" />
        <path d={arco(62, 0.55, 1)} stroke="#059669" strokeWidth="9" fill="none" opacity="0.85" />

        {/* Escala graduada */}
        {ticks.map((f, i) => {
          const mayor = i % 4 === 0;
          const [x1, y1] = polar(mayor ? 50 : 53, ANG0 + BARRIDO * f);
          const [x2, y2] = polar(57, ANG0 + BARRIDO * f);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#334155" strokeWidth={mayor ? 2 : 1} />
          );
        })}
        {/* Números de la escala (0, ½, max) */}
        {[0, 0.5, 1].map((f) => {
          const [x, y] = polar(41, ANG0 + BARRIDO * f);
          return (
            <text key={f} x={x} y={y + 3} textAnchor="middle"
              fontSize="9" fontWeight="700" fill="#334155">
              {Math.round(max * f)}
            </text>
          );
        })}

        {/* Logo en la carátula (única marca permitida) */}
        <text x={CX} y={CY + 30} textAnchor="middle" fontSize="9" fontWeight="800" fill="#155e70">
          Vital<tspan fill="#0891b2">Cowork</tspan>
        </text>
        <text x={CX} y={CY + 40} textAnchor="middle" fontSize="5.5" fill="#94a3b8">
          HORAS DE CONSULTORIO
        </text>

        {/* Aguja indicadora */}
        <g className="aguja-tensiometro" style={{ transform: `rotate(${angulo}deg)` }}>
          <path d={`M ${CX - 3} ${CY + 8} L ${CX} ${CY - 54} L ${CX + 3} ${CY + 8} Z`} fill="#0f2733" />
        </g>
        <circle cx={CX} cy={CY} r="6" fill="#0f2733" />
        <circle cx={CX} cy={CY} r="2.5" fill="#94a3b8" />
      </svg>

      <div className="-mt-2 text-center">
        <p className={`text-2xl font-extrabold ${zonaTexto}`}>
          {Number(horas.toFixed(1))} <span className="text-sm font-bold">h restantes</span>
        </p>
        <p className="text-xs text-tinta-suave">
          {etiqueta && <span className="font-semibold">{etiqueta} · </span>}
          {diasRestantes !== null
            ? diasRestantes > 0
              ? `${diasRestantes} día(s) de vigencia`
              : "vigencia vencida"
            : "sin paquete activo"}
          {vigenciaCritica && diasRestantes! > 0 && " · ⚠ por vencer"}
        </p>
      </div>
    </div>
  );
}
