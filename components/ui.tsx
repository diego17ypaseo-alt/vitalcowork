"use client";

// Primitivas del design system VitalCowork

import { useEffect, type ReactNode } from "react";

export function Tarjeta({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`tarjeta ${className}`}>{children}</div>;
}

export function Insignia({
  children,
  tono = "primario",
  className = "",
}: {
  children: ReactNode;
  tono?: "primario" | "exito" | "alerta" | "peligro" | "oro" | "plata" | "neutro";
  className?: string;
}) {
  const tonos: Record<string, string> = {
    primario: "bg-primario-suave text-primario-oscuro",
    exito: "bg-exito-suave text-exito",
    alerta: "bg-alerta-suave text-alerta",
    peligro: "bg-peligro-suave text-peligro",
    oro: "bg-oro-suave text-oro",
    plata: "bg-plata-suave text-plata",
    neutro: "bg-fondo text-tinta-suave",
  };
  return <span className={`insignia ${tonos[tono]} ${className}`}>{children}</span>;
}

const TONO_ESTADO: Record<string, { texto: string; tono: Parameters<typeof Insignia>[0]["tono"] }> = {
  pendiente_pago: { texto: "Pendiente de pago", tono: "alerta" },
  confirmada: { texto: "Confirmada", tono: "exito" },
  en_curso: { texto: "En curso", tono: "alerta" },
  completada: { texto: "Completada", tono: "neutro" },
  cancelada: { texto: "Cancelada", tono: "peligro" },
  no_show: { texto: "No asistió", tono: "peligro" },
  pendiente: { texto: "Pendiente", tono: "alerta" },
  aprobado: { texto: "Aprobado", tono: "exito" },
  aprobada: { texto: "Aprobada", tono: "exito" },
  suspendido: { texto: "Suspendido", tono: "peligro" },
  rechazada: { texto: "Rechazada", tono: "peligro" },
  confirmado: { texto: "Confirmado", tono: "exito" },
  rechazado: { texto: "Rechazado", tono: "peligro" },
  activo: { texto: "Activo", tono: "exito" },
  agotado: { texto: "Agotado", tono: "neutro" },
  expirado: { texto: "Expirado", tono: "peligro" },
  solicitada: { texto: "En revisión", tono: "alerta" },
  acreditada: { texto: "Acreditada", tono: "exito" },
};

export function InsigniaEstado({ estado }: { estado: string }) {
  const cfg = TONO_ESTADO[estado] ?? { texto: estado, tono: "neutro" as const };
  return <Insignia tono={cfg.tono}>{cfg.texto}</Insignia>;
}

export function Modal({
  abierto,
  onCerrar,
  titulo,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-tinta/40 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="tarjeta w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-b-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          {titulo && <h3 className="text-base font-bold">{titulo}</h3>}
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="ml-auto rounded-full p-1.5 text-tinta-suave hover:bg-fondo cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-tinta-suave text-sm">
      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {texto}
    </div>
  );
}

export function Vacio({ icono = "📅", texto }: { icono?: string; texto: string }) {
  return (
    <div className="py-12 text-center text-tinta-suave">
      <div className="text-4xl mb-2">{icono}</div>
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function Alerta({
  tono = "alerta",
  children,
}: {
  tono?: "alerta" | "peligro" | "exito" | "primario";
  children: ReactNode;
}) {
  const tonos = {
    alerta: "bg-alerta-suave text-alerta border-alerta/20",
    peligro: "bg-peligro-suave text-peligro border-peligro/20",
    exito: "bg-exito-suave text-exito border-exito/20",
    primario: "bg-primario-suave text-primario-oscuro border-primario/20",
  };
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${tonos[tono]}`}>
      {children}
    </div>
  );
}

export function Estrellas({
  valor,
  onCambiar,
  tam = 22,
}: {
  valor: number;
  onCambiar?: (v: number) => void;
  tam?: number;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onCambiar}
          onClick={() => onCambiar?.(n)}
          className={onCambiar ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} estrellas`}
        >
          <svg width={tam} height={tam} viewBox="0 0 24 24" fill={n <= valor ? "#f59e0b" : "#e2e8f0"}>
            <path d="M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.3l7.1-.7z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function LogoVital({ claro = false, tam = "text-2xl" }: { claro?: boolean; tam?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${tam} ${claro ? "text-white" : "text-primario-oscuro"}`}>
      Vital
      <span className={claro ? "text-cyan-200" : "text-acento"}>Cowork</span>
    </span>
  );
}
