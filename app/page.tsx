import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CarruselFotos } from "@/components/CarruselFotos";
import { LogoVital } from "@/components/ui";

export default async function Bienvenida() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/inicio");

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-between overflow-hidden bg-primario-oscuro px-6 py-10 text-white">
      <CarruselFotos />

      <header className="mt-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M3 12h3l2.5-6L13 18l2.5-6H21"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-cyan-200"
            />
          </svg>
        </div>
        <LogoVital claro tam="text-4xl" />
        <p className="text-[13px] uppercase tracking-[0.25em] text-cyan-100/80">
          Coworking médico · Guayaquil
        </p>
      </header>

      <section className="max-w-md text-center">
        <h1 className="text-[28px] font-extrabold leading-snug drop-shadow-sm">
          “Tu prestigio y experiencia médica, ahora respaldados por el espacio perfecto”
        </h1>
        <p className="mt-4 text-sm text-cyan-50/85 leading-relaxed">
          Reserva por horas un consultorio equipado dentro de un centro
          cardiológico. Agenda en segundos, paga en línea y atiende con la
          tranquilidad de un espacio profesional.
        </p>
      </section>

      <footer className="w-full max-w-md space-y-3">
        <Link href="/registro" className="btn-primario w-full !bg-white !text-primario-oscuro hover:!bg-cyan-50 text-base py-3.5">
          Crear mi cuenta de co-med
        </Link>
        <Link
          href="/login"
          className="btn w-full border border-white/40 text-white hover:bg-white/10 text-base py-3.5"
        >
          Ya tengo cuenta — Ingresar
        </Link>
        <p className="pt-2 text-center text-[11px] text-cyan-100/60">
          Al continuar aceptas nuestros{" "}
          <Link href="/terminos" className="underline">
            Términos y Reglamento Interno
          </Link>
        </p>
      </footer>
    </main>
  );
}
