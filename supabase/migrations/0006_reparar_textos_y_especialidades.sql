-- ============================================================
-- Reparación de textos (tildes dañadas por codificación) y
-- ampliación del catálogo de especialidades.
-- Seguro de ejecutar varias veces (idempotente).
-- ============================================================

-- ---------- Planes ----------
update plans set
  nivel = 'Básico',
  nombre = 'Plan Triaje',
  copy_comercial = 'El dinamismo del primer contacto: acceso rápido, eficiente y de evaluación. Reserva tu hora para hoy, esta semana o el mes en curso.'
where id = 'triaje';

update plans set
  nivel = 'Silver',
  nombre = 'Plan Estancia Plus',
  badge = 'Más popular',
  copy_comercial = 'Comodidad y permanencia: un espacio bien equipado y confortable, perfecto para jornadas medianas o de mediano plazo. Incluye reagendamientos ilimitados.'
where id = 'estancia';

update plans set
  nivel = 'Gold',
  nombre = 'Plan Ronda Médica VIP',
  badge = 'Máximo ahorro',
  copy_comercial = 'Máxima jerarquía, autoridad y exclusividad: prioridad, acceso total a las mejores instalaciones y mayores beneficios — como el especialista líder durante su pase de visita. Incluye reagendamientos ilimitados y asistente para agendamiento, reagendamiento y confirmación de citas de tus pacientes.'
where id = 'vip';

-- ---------- Especialidades: corrige las existentes (por id del seed) ----------
update specialties set nombre = 'Medicina General' where id = 1;
update specialties set nombre = 'Medicina Interna' where id = 2;
update specialties set nombre = 'Cardiología' where id = 3;
update specialties set nombre = 'Psicología' where id = 4;
update specialties set nombre = 'Nutrición' where id = 5;
update specialties set nombre = 'Endocrinología' where id = 6;
update specialties set nombre = 'Geriatría' where id = 7;
update specialties set nombre = 'Dermatología clínica' where id = 8;
update specialties set nombre = 'Pediatría' where id = 9;
update specialties set nombre = 'Ginecología (consulta)' where id = 10;
update specialties set nombre = 'Neumología' where id = 11;
update specialties set nombre = 'Reumatología' where id = 12;
update specialties set nombre = 'Psiquiatría' where id = 13;
update specialties set nombre = 'Fisioterapia' where id = 14;

-- ---------- Especialidades nuevas (clínicas y quirúrgicas de consulta) ----------
insert into specialties (nombre) values
  ('Urología'),
  ('Neurología'),
  ('Traumatología'),
  ('Nefrología'),
  ('Hematología'),
  ('Gastroenterología'),
  ('Medicina Familiar'),
  ('Oftalmología'),
  ('Otras')
on conflict (nombre) do nothing;

-- ---------- Espacios ----------
update spaces set
  nombre = 'Consultorio principal',
  descripcion = 'Consultorio grande, completamente amoblado para consulta ambulatoria.'
where es_principal;
update spaces set
  nombre = 'Consultorio satélite',
  descripcion = 'Consultorio pequeño de apoyo (ECG y ecocardiogramas). Se habilita en alta demanda.'
where not es_principal;

-- ---------- Recompensas ----------
update reward_catalog set estudio = 'MAPA (presión arterial 24h)' where estudio like 'MAPA%';
update reward_catalog set estudio = 'Electrocardiograma' where estudio like 'Electro%';
update reward_catalog set estudio = 'Ecocardiograma' where estudio like 'Ecocardio%';
update reward_catalog set estudio = 'Prueba de esfuerzo' where estudio like 'Prueba%';
update reward_catalog set estudio = 'Holter de ritmo' where estudio like 'Holter%';
update reward_catalog set estudio = 'Asesoramiento nutricional con especialista' where estudio like 'Asesoramiento%';

-- ---------- Feriados ----------
update holidays_blocks set motivo = 'Año Nuevo' where fecha in ('2026-01-01','2027-01-01') and tipo = 'feriado';
update holidays_blocks set motivo = 'Carnaval' where fecha in ('2026-02-16','2026-02-17','2027-02-08','2027-02-09') and tipo = 'feriado';
update holidays_blocks set motivo = 'Viernes Santo' where fecha in ('2026-04-03','2027-03-26') and tipo = 'feriado';
update holidays_blocks set motivo = 'Día del Trabajo' where fecha = '2026-05-01' and tipo = 'feriado';
update holidays_blocks set motivo = 'Día del Trabajo (trasladado del sáb. 1 de mayo)' where fecha = '2027-04-30' and tipo = 'feriado';
update holidays_blocks set motivo = 'Batalla de Pichincha (trasladado del dom. 24)' where fecha = '2026-05-25' and tipo = 'feriado';
update holidays_blocks set motivo = 'Batalla de Pichincha' where fecha = '2027-05-24' and tipo = 'feriado';
update holidays_blocks set motivo = 'Primer Grito de Independencia' where fecha = '2026-08-10' and tipo = 'feriado';
update holidays_blocks set motivo = 'Primer Grito de Independencia (trasladado del mar. 10)' where fecha = '2027-08-09' and tipo = 'feriado';
update holidays_blocks set motivo = 'Independencia de Guayaquil' where fecha = '2026-10-09' and tipo = 'feriado';
update holidays_blocks set motivo = 'Independencia de Guayaquil (trasladado del sáb. 9)' where fecha = '2027-10-08' and tipo = 'feriado';
update holidays_blocks set motivo = 'Día de los Difuntos' where fecha = '2026-11-02' and tipo = 'feriado';
update holidays_blocks set motivo = 'Día de los Difuntos (trasladado del mar. 2)' where fecha = '2027-11-01' and tipo = 'feriado';
update holidays_blocks set motivo = 'Independencia de Cuenca' where fecha = '2026-11-03' and tipo = 'feriado';
update holidays_blocks set motivo = 'Independencia de Cuenca (trasladado del mié. 3)' where fecha = '2027-11-05' and tipo = 'feriado';
update holidays_blocks set motivo = 'Navidad' where fecha = '2026-12-25' and tipo = 'feriado';

-- ---------- Perfil demo del co-manager ----------
update profiles set alias = 'Dirección' where rol = 'comanager' and alias like 'Direc%';

-- ---------- Reglamento (T&C) íntegro con texto correcto ----------
update tnc_versions set contenido_md = $tnc$
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
$tnc$
where version = '1.0';
