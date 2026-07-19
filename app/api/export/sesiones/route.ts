import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Exporta el historial de sesiones (check-in/out) en CSV.
 * RLS: un co-med solo obtiene sus sesiones; el co-manager, todas.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const desde = url.searchParams.get("desde") ?? "2026-01-01";
  const hasta = url.searchParams.get("hasta") ?? "2100-01-01";

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data } = await supabase
    .from("sessions")
    .select(
      "checkin_at, checkout_at, checkin_por, checkin_dispositivo, checkout_dispositivo, minutos_excedente, horas_extra_cobradas, alerta_franja_ocupada, reservations(fecha, hora, estado, precio, profiles(nombre_completo, cedula))"
    )
    .order("checkin_at", { ascending: false });

  const filas = (data ?? [])
    .filter((s) => {
      const r = s.reservations as unknown as { fecha: string } | null;
      return r && r.fecha >= desde && r.fecha <= hasta;
    })
    .map((s) => {
      const r = s.reservations as unknown as {
        fecha: string; hora: number; estado: string; precio: number;
        profiles: { nombre_completo: string; cedula: string | null } | null;
      };
      return [
        r.fecha,
        `${r.hora}:00`,
        r.profiles?.nombre_completo ?? "",
        r.profiles?.cedula ?? "",
        fmt(s.checkin_at),
        fmt(s.checkout_at),
        s.checkin_dispositivo,
        s.checkout_dispositivo ?? "",
        s.minutos_excedente,
        s.horas_extra_cobradas,
        s.alerta_franja_ocupada ? "SI" : "NO",
        r.estado,
      ]
        .map(csv)
        .join(";");
    });

  const cabecera = [
    "fecha", "bloque", "profesional", "cedula", "check_in", "check_out",
    "dispositivo_inicio", "dispositivo_fin", "min_excedente", "horas_extra",
    "alerta_franja_ocupada", "estado_reserva",
  ].join(";");

  return new NextResponse("﻿" + [cabecera, ...filas].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sesiones_${desde}_${hasta}.csv"`,
    },
  });
}

function fmt(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function csv(v: unknown): string {
  const s = String(v ?? "");
  return s.includes(";") || s.includes('"') ? `"${s.replaceAll('"', '""')}"` : s;
}
