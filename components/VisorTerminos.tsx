"use client";

// Visor de T&C con scroll obligatorio: el checkbox solo se habilita
// al llegar al final del documento (equivalente digital de la firma).

import { useRef, useState } from "react";

export function VisorTerminos({
  contenidoMd,
  onAceptar,
  cargando,
}: {
  contenidoMd: string;
  onAceptar?: () => void;
  cargando?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [llegoAlFinal, setLlegoAlFinal] = useState(false);
  const [acepta, setAcepta] = useState(false);

  const alDesplazar = () => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setLlegoAlFinal(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={ref}
        onScroll={alDesplazar}
        className="tarjeta max-h-[55dvh] overflow-y-auto p-5 text-[13.5px] leading-relaxed text-tinta"
      >
        <ContenidoMarkdown md={contenidoMd} />
      </div>

      {onAceptar && (
        <>
          {!llegoAlFinal && (
            <p className="text-center text-xs text-tinta-suave animate-pulse">
              ↓ Desplázate hasta el final del reglamento para poder aceptar
            </p>
          )}
          <label
            className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm transition ${
              llegoAlFinal
                ? "border-primario/40 bg-primario-suave/50 cursor-pointer"
                : "border-borde opacity-50"
            }`}
          >
            <input
              type="checkbox"
              disabled={!llegoAlFinal}
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#0e7490]"
            />
            <span>
              He leído y acepto los <b>Términos y Condiciones</b> y el{" "}
              <b>Reglamento Interno de VitalCowork</b>. Esta aceptación equivale
              a mi firma del reglamento físico.
            </span>
          </label>
          <button
            disabled={!acepta || cargando}
            onClick={onAceptar}
            className="btn-primario w-full py-3"
          >
            {cargando ? "Registrando aceptación…" : "Aceptar y continuar"}
          </button>
        </>
      )}
    </div>
  );
}

/** Render mínimo de Markdown (títulos, negritas, listas, separadores) */
export function ContenidoMarkdown({ md }: { md: string }) {
  const lineas = md.split("\n");
  return (
    <div className="space-y-2">
      {lineas.map((linea, i) => {
        const l = linea.trim();
        if (!l) return null;
        if (l === "---") return <hr key={i} className="my-4 border-borde" />;
        if (l.startsWith("# "))
          return <h1 key={i} className="pt-2 text-lg font-extrabold text-primario-oscuro">{enriquecer(l.slice(2))}</h1>;
        if (l.startsWith("## "))
          return <h2 key={i} className="pt-2 text-[15px] font-bold text-primario-oscuro">{enriquecer(l.slice(3))}</h2>;
        if (l.startsWith("*") && l.endsWith("*") && !l.startsWith("**"))
          return <p key={i} className="text-xs italic text-tinta-suave">{l.replaceAll("*", "")}</p>;
        if (/^\d+\.\s/.test(l))
          return <p key={i} className="pl-4">{enriquecer(l)}</p>;
        return <p key={i}>{enriquecer(l)}</p>;
      })}
    </div>
  );
}

function enriquecer(texto: string): React.ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p
  );
}
