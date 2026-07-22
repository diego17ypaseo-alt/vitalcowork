import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prepararPagoPayphone } from "@/lib/payphone";

const TNC_CORRECTO = `
# Términos y Condiciones de Uso — VitalCowork

Al registrarte en VitalCowork declaras y aceptas:

1. **Acreditación profesional.** Eres un profesional de la salud legalmente habilitado en Ecuador (registro Senescyt/ACESS o equivalente) y la documentación que cargas es auténtica. Tu cuenta se activa solo tras la verificación del administrador.
2. **Alcance del servicio.** VitalCowork alquila espacios para **consulta médica ambulatoria**. Están excluidos los procedimientos quirúrgicos mayores o complejos; solo se permiten procedimientos menores (p. ej., extracción de puntos, limpieza quirúrgica menor).
3. **Responsabilidad profesional.** Cada co-med es el único y exclusivo responsable de la atención, diagnóstico y tratamiento de sus pacientes. VitalCowork provee la infraestructura física y no participa en la relación médico–paciente.
4. **Protección de datos.** Tus datos personales se tratan conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP) del Ecuador, con fines de gestión de reservas, pagos y seguridad. En el registro se solicita nombre y número de cédula para fines de seguridad y confidencialidad. Tus datos personales nunca se muestran a otros co-meds: en el calendario solo aparece tu alias y tu especialidad.

---

# REGLAMENTO INTERNO DEL COWORKING MÉDICO — VITALCOWORK
*Fecha de emisión: 16 de julio de 2026*

## CAPÍTULO I: DISPOSICIONES GENERALES

**Art. 1. Objeto**: establecer las normas y procedimientos que rigen el funcionamiento de VitalCowork, promoviendo un ambiente profesional, ético y colaborativo para todos los profesionales de la salud que integran la comunidad.

**Art. 2. Ámbito de aplicación**: cumplimiento obligatorio para todos los médicos, profesionales de la salud, personal administrativo y visitantes que utilicen las instalaciones.

## CAPÍTULO II: USO DE LAS INSTALACIONES

**Art. 3. Horarios de atención**: instalaciones disponibles de lunes a viernes, de 09:00 a 12:00 y de 13:00 a 18:00, salvo excepciones autorizadas.

**Art. 4. Reservaciones**: las áreas y consultorios se reservan mediante el sistema establecido. Cancelaciones con al menos 24 horas de anticipación no tienen costo; cancelar dentro de las 24 horas se penaliza con el 50% del valor de esa hora; no notificar cancelación se penaliza con el total de la hora reservada.

**Art. 5. Mantenimiento y limpieza**: el consultorio se entrega limpio y con lencería limpia (batas o mediasábanas). Cada co-med es responsable de mantener en orden su espacio y cumplir las disposiciones de higiene y bioseguridad vigentes, desechando la basura según sea material común o infeccioso.

## CAPÍTULO III: CONDUCTA Y ÉTICA

**Art. 6. Comportamiento profesional**: conducta respetuosa, ética y profesional con colegas, pacientes y visitantes.

**Art. 7. Confidencialidad**: obligación de garantizar la confidencialidad de la información de los pacientes y cumplir las normativas de protección de datos; prohibido tomar fotos o videos del lugar o de pacientes sin consentimiento.

**Art. 8. Uso de equipos y materiales**: uso responsable y conforme a las instrucciones de uso y seguridad; los daños acarrean sanciones o correcciones.

## CAPÍTULO IV: RESPONSABILIDADES Y SANCIONES

**Art. 9. Tiempo reservado**: el co-med debe respetar el horario reservado; al excederlo dispone de 8 minutos de gracia, tras lo cual se cobra una hora adicional (abonada o descontada de su paquete), siempre que la siguiente franja no esté reservada por otro médico. El incumplimiento puede acarrear la suspensión automática de una próxima reserva.

**Art. 10. Responsabilidades del usuario**: cada co-med responde por el cumplimiento de este reglamento y el correcto uso de instalaciones y recursos.

**Art. 11. Sanciones**: el incumplimiento podrá resultar en sanciones desde advertencias hasta suspensión o cancelación del acceso, según la gravedad.

## CAPÍTULO V: DISPOSICIONES FINALES

**Art. 12. Modificación**: el reglamento puede ser modificado por la dirección de VitalCowork, comunicándose oportunamente a los usuarios. La app notificará y pedirá re-aceptación cuando cambie la versión.

**Art. 13. Aceptación**: el ingreso y permanencia en las instalaciones implica la aceptación total de estas disposiciones.
`;

const ESPECIALIDADES_BASE: Record<number, string> = {
  1: "Medicina General", 2: "Medicina Interna", 3: "Cardiología",
  4: "Psicología", 5: "Nutrición", 6: "Endocrinología", 7: "Geriatría",
  8: "Dermatología clínica", 9: "Pediatría", 10: "Ginecología (consulta)",
  11: "Neumología", 12: "Reumatología", 13: "Psiquiatría", 14: "Fisioterapia",
};

const ESPECIALIDADES_NUEVAS = [
  "Urología", "Neurología", "Traumatología", "Nefrología", "Hematología",
  "Gastroenterología", "Medicina Familiar", "Oftalmología", "Otras",
];

// Diagnóstico TEMPORAL de conexión (se elimina tras la puesta en marcha).
// No expone secretos: solo prefijos y mensajes de error.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("d") !== "vc-diag-2026") {
    return NextResponse.json({ error: "no" }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(FALTA)";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const resultado: Record<string, unknown> = {
    url,
    anon_prefijo: anon ? anon.slice(0, 15) + "… (largo " + anon.length + ")" : "(FALTA)",
    service_presente: service ? "sí (largo " + service.length + ")" : "(FALTA)",
    payphone_token: process.env.PAYPHONE_TOKEN
      ? "presente (largo " + process.env.PAYPHONE_TOKEN.length + ")"
      : "(FALTA)",
    payphone_store_id: process.env.PAYPHONE_STORE_ID
      ? "presente (largo " + process.env.PAYPHONE_STORE_ID.length + ")"
      : "(FALTA)",
  };

  try {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from("plans")
      .select("id, precio_hora")
      .limit(5);
    resultado.consulta_planes = error
      ? { error: error.message, code: error.code, details: error.details, hint: error.hint }
      : { ok: true, filas: data?.length, data };
    const { data: tnc, error: e2 } = await supabase
      .from("tnc_versions")
      .select("version, publicado")
      .limit(3);
    resultado.consulta_tnc = e2
      ? { error: e2.message, code: e2.code }
      : { ok: true, filas: tnc?.length, tnc };
  } catch (e) {
    resultado.excepcion = e instanceof Error ? e.message : String(e);
  }

  // Vista de servidor (service role): estados de perfiles y acreditaciones,
  // sin datos personales
  try {
    if (service) {
      const admin = createClient(url, service, { auth: { persistSession: false } });
      const { data: perfiles, error: ep } = await admin
        .from("profiles")
        .select("rol, estado, alias, creado_en")
        .order("creado_en", { ascending: false });
      resultado.perfiles = ep ? { error: ep.message } : perfiles;
      const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 20 });
      resultado.usuarios_auth = usuarios?.users?.map((u) => ({
        email_dominio: u.email?.split("@")[1],
        confirmado: Boolean(u.email_confirmed_at),
        creado: u.created_at,
      }));
      const { data: acred } = await admin
        .from("accreditations")
        .select("estado, creado_en");
      resultado.acreditaciones = acred;
    }
  } catch (e) {
    resultado.excepcion_admin = e instanceof Error ? e.message : String(e);
  }

  // Reparación de textos con tildes dañadas (?reparar=1): ejecuta con service
  // role las mismas correcciones de la migración 0006. Idempotente.
  if (new URL(request.url).searchParams.get("reparar") === "1" && service) {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const errores: string[] = [];
    const paso = async (nombre: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await fn();
      if (error) errores.push(`${nombre}: ${error.message}`);
    };

    await paso("plan triaje", () => admin.from("plans").update({
      nivel: "Básico", nombre: "Plan Triaje",
      copy_comercial: "El dinamismo del primer contacto: acceso rápido, eficiente y de evaluación. Reserva tu hora para hoy, esta semana o el mes en curso.",
    }).eq("id", "triaje"));
    await paso("plan estancia", () => admin.from("plans").update({
      nivel: "Silver", nombre: "Plan Estancia Plus", badge: "Más popular",
      copy_comercial: "Comodidad y permanencia: un espacio bien equipado y confortable, perfecto para jornadas medianas o de mediano plazo. Incluye reagendamientos ilimitados.",
    }).eq("id", "estancia"));
    await paso("plan vip", () => admin.from("plans").update({
      nivel: "Gold", nombre: "Plan Ronda Médica VIP", badge: "Máximo ahorro",
      copy_comercial: "Máxima jerarquía, autoridad y exclusividad: prioridad, acceso total a las mejores instalaciones y mayores beneficios — como el especialista líder durante su pase de visita. Incluye reagendamientos ilimitados y asistente para agendamiento, reagendamiento y confirmación de citas de tus pacientes.",
    }).eq("id", "vip"));

    for (const [id, nombre] of Object.entries(ESPECIALIDADES_BASE)) {
      await paso(`especialidad ${id}`, () =>
        admin.from("specialties").update({ nombre }).eq("id", Number(id)));
    }
    await paso("especialidades nuevas", () =>
      admin.from("specialties").upsert(
        ESPECIALIDADES_NUEVAS.map((nombre) => ({ nombre })),
        { onConflict: "nombre", ignoreDuplicates: true }
      ));

    await paso("espacio principal", () => admin.from("spaces").update({
      nombre: "Consultorio principal",
      descripcion: "Consultorio grande, completamente amoblado para consulta ambulatoria.",
    }).eq("es_principal", true));
    await paso("espacio satélite", () => admin.from("spaces").update({
      nombre: "Consultorio satélite",
      descripcion: "Consultorio pequeño de apoyo (ECG y ecocardiogramas). Se habilita en alta demanda.",
    }).eq("es_principal", false));

    await paso("recompensa MAPA", () => admin.from("reward_catalog")
      .update({ estudio: "MAPA (presión arterial 24h)" }).like("estudio", "MAPA%"));

    const feriados: [string[], string][] = [
      [["2026-01-01", "2027-01-01"], "Año Nuevo"],
      [["2026-02-16", "2026-02-17", "2027-02-08", "2027-02-09"], "Carnaval"],
      [["2026-04-03", "2027-03-26"], "Viernes Santo"],
      [["2026-05-01"], "Día del Trabajo"],
      [["2027-04-30"], "Día del Trabajo (trasladado del sáb. 1 de mayo)"],
      [["2026-05-25"], "Batalla de Pichincha (trasladado del dom. 24)"],
      [["2027-05-24"], "Batalla de Pichincha"],
      [["2026-08-10"], "Primer Grito de Independencia"],
      [["2027-08-09"], "Primer Grito de Independencia (trasladado del mar. 10)"],
      [["2026-10-09"], "Independencia de Guayaquil"],
      [["2027-10-08"], "Independencia de Guayaquil (trasladado del sáb. 9)"],
      [["2026-11-02"], "Día de los Difuntos"],
      [["2027-11-01"], "Día de los Difuntos (trasladado del mar. 2)"],
      [["2026-11-03"], "Independencia de Cuenca"],
      [["2027-11-05"], "Independencia de Cuenca (trasladado del mié. 3)"],
      [["2026-12-25"], "Navidad"],
    ];
    for (const [fechas, motivo] of feriados) {
      await paso(`feriado ${motivo}`, () => admin.from("holidays_blocks")
        .update({ motivo }).in("fecha", fechas).eq("tipo", "feriado"));
    }

    await paso("alias dirección", () => admin.from("profiles")
      .update({ alias: "Dirección" }).eq("rol", "comanager").like("alias", "Direc%"));

    await paso("reglamento", () => admin.from("tnc_versions")
      .update({ contenido_md: TNC_CORRECTO }).eq("version", "1.0"));

    resultado.reparacion = errores.length
      ? { ok: false, errores }
      : { ok: true, mensaje: "Textos reparados" };
  }

  // Prueba directa del Botón de Pagos Payphone (?payphone=1):
  // varias variantes del Prepare para acorralar la causa del error
  if (new URL(request.url).searchParams.get("payphone") === "1") {
    const origen = new URL(request.url).origin;
    const token = (process.env.PAYPHONE_TOKEN ?? "").trim();
    const storeId = (process.env.PAYPHONE_STORE_ID ?? "").trim();
    resultado.token_formato = {
      largo: token.length,
      con_espacios: token !== process.env.PAYPHONE_TOKEN,
      inicia: token.slice(0, 4),
      caracteres_validos: /^[A-Za-z0-9+/=._-]+$/.test(token),
      store_largo: storeId.length,
      store_valido: /^[A-Za-z0-9-]+$/.test(storeId),
    };

    const probar = async (nombre: string, body: Record<string, unknown>) => {
      try {
        const res = await fetch(
          "https://pay.payphonetodoesposible.com/api/button/Prepare",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          }
        );
        const texto = await res.text();
        return {
          variante: nombre,
          status: res.status,
          respuesta: texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 220),
        };
      } catch (e) {
        return { variante: nombre, excepcion: e instanceof Error ? e.message : String(e) };
      }
    };

    const base = {
      amount: 100,
      amountWithoutTax: 100,
      tax: 0,
      currency: "USD",
      reference: "Diagnostico VitalCowork",
      clientTransactionId: "dg" + (Date.now() % 10000000),
      responseUrl: `${origen}/pago/respuesta`,
    };
    resultado.payphone_variantes = [
      await probar("completa_con_storeId", { ...base, storeId }),
      await probar("sin_storeId", base),
      await probar("minima", {
        amount: 100,
        amountWithoutTax: 100,
        currency: "USD",
        clientTransactionId: "dg" + ((Date.now() + 1) % 10000000),
        responseUrl: `${origen}/pago/respuesta`,
      }),
    ];
  }

  // Reproduce la consulta de la pantalla Aprobaciones con la sesión del admin demo
  try {
    const cli = createClient(url, anon, { auth: { persistSession: false } });
    const { data: sesion, error: eLogin } = await cli.auth.signInWithPassword({
      email: "admin@vitalcowork.ec",
      password: "demo123456",
    });
    if (eLogin) {
      resultado.login_admin = { error: eLogin.message };
    } else {
      resultado.login_admin = { ok: true, uid: sesion.user?.id };
      const { data: pend, error: ePend } = await cli
        .from("profiles")
        .select(
          "id, nombre_completo, alias, specialties(nombre), accreditations!accreditations_profile_id_fkey(id, tipo, estado)"
        )
        .eq("estado", "pendiente")
        .eq("rol", "comed");
      resultado.consulta_aprobaciones = ePend
        ? { error: ePend.message, code: ePend.code, details: ePend.details, hint: ePend.hint }
        : { filas: pend?.length, alias: pend?.map((p) => p.alias) };
      const { data: esMgr, error: eFn } = await cli.rpc("es_comanager");
      resultado.fn_es_comanager = eFn ? { error: eFn.message } : esMgr;
    }
  } catch (e) {
    resultado.excepcion_aprobaciones = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(resultado);
}
