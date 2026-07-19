"use client";

// Carrusel tipo reel de fotos del establecimiento con efecto marca de agua.
// Busca las fotos reales (foto1.jpg … foto5.jpg) en /public/assets/fotos;
// si alguna no existe, usa automáticamente el placeholder SVG.

import { useEffect, useState } from "react";

const FOTOS = [
  "/assets/fotos/foto1.jpg", // recepción
  "/assets/fotos/foto2.jpg", // consultorio principal
  "/assets/fotos/foto3.jpg", // consultorio satélite (ECG / eco)
  "/assets/fotos/foto4.jpg", // área de procedimientos
  "/assets/fotos/foto5.jpg", // instalaciones
];

const RESPALDOS = [
  "/assets/fotos/foto1.svg",
  "/assets/fotos/foto2.svg",
  "/assets/fotos/foto3.svg",
];

export function CarruselFotos() {
  const [activa, setActiva] = useState(0);
  const [fallidas, setFallidas] = useState<Set<string>>(new Set());

  // Fotos reales disponibles; si ninguna carga, rotan los placeholders
  const visibles = FOTOS.filter((f) => !fallidas.has(f));
  const lista = visibles.length > 0 ? visibles : RESPALDOS;

  useEffect(() => {
    const t = setInterval(() => setActiva((a) => (a + 1) % lista.length), 4500);
    return () => clearInterval(t);
  }, [lista.length]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {lista.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          onError={() =>
            setFallidas((prev) => {
              const s = new Set(prev);
              s.add(src);
              return s;
            })
          }
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1800ms]"
          style={{ opacity: i === activa % lista.length ? 0.35 : 0 }}
        />
      ))}
      {/* Velo marca de agua + degradado para legibilidad */}
      <div className="absolute inset-0 bg-gradient-to-b from-primario-oscuro/80 via-primario-oscuro/60 to-primario-oscuro/90" />
    </div>
  );
}
