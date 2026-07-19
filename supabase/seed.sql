-- ============================================================
-- VitalCowork — Datos semilla
-- Cuentas demo (solo entorno local/desarrollo):
--   Co-manager: admin@vitalcowork.ec   / demo123456
--   Co-meds:    dra.paredes@demo.ec, dr.molina@demo.ec, lic.andrade@demo.ec / demo123456
-- ============================================================

-- ---------- Especialidades permitidas (sin cirugía mayor) ----------
insert into specialties (nombre) values
  ('Medicina General'), ('Medicina Interna'), ('Cardiología'),
  ('Psicología'), ('Nutrición'), ('Endocrinología'), ('Geriatría'),
  ('Dermatología clínica'), ('Pediatría'), ('Ginecología (consulta)'),
  ('Neumología'), ('Reumatología'), ('Psiquiatría'), ('Fisioterapia');

-- ---------- Espacios ----------
insert into spaces (id, nombre, descripcion, es_principal, reservable_publico) values
  ('11111111-1111-1111-1111-111111111111', 'Consultorio principal',
   'Consultorio grande, completamente amoblado para consulta ambulatoria.', true, true),
  ('22222222-2222-2222-2222-222222222222', 'Consultorio satélite',
   'Consultorio pequeño de apoyo (ECG y ecocardiogramas). Se habilita en alta demanda.', false, false);

-- ---------- Planes (valores iniciales, editables por el co-manager) ----------
insert into plans (id, nivel, nombre, precio_hora, min_horas_semana, min_horas_mes,
  reagendamientos_por_reserva, color, badge, copy_comercial, orden) values
  ('triaje', 'Básico', 'Plan Triaje', 15.00, null, null, 1, '#0e7490', null,
   'El dinamismo del primer contacto: acceso rápido, eficiente y de evaluación. Reserva tu hora para hoy, esta semana o el mes en curso.', 1),
  ('estancia', 'Silver', 'Plan Estancia Plus', 12.00, 5, 15, null, '#64748b', 'Más popular',
   'Comodidad y permanencia: un espacio bien equipado y confortable, perfecto para jornadas medianas o de mediano plazo. Incluye reagendamientos ilimitados.', 2),
  ('vip', 'Gold', 'Plan Ronda Médica VIP', 10.00, 10, 30, null, '#b45309', 'Máximo ahorro',
   'Máxima jerarquía, autoridad y exclusividad: prioridad, acceso total a las mejores instalaciones y mayores beneficios — como el especialista líder durante su pase de visita. Reagendamientos ilimitados.', 3);

-- ---------- Configuración (todo editable desde el panel) ----------
insert into settings (clave, valor, descripcion) values
  ('horario', '{"jornadas": [[9,12],[13,18]]}', 'Jornadas de atención (hora inicio/fin). El hueco entre jornadas es el receso de almuerzo.'),
  ('gracia_minutos', '8', 'Minutos de gracia al exceder la hora reservada (Art. 9)'),
  ('umbral_reincidencias', '3', 'Excedentes acumulados que activan la suspensión automática de la próxima reserva'),
  ('reagenda_anticipacion_horas', '4', 'Anticipación mínima (horas) para poder reagendar una reserva'),
  ('penalizacion_dentro_24h', '0.5', 'Fracción penalizada al cancelar dentro de las 24h (Art. 4)'),
  ('penalizacion_no_show', '1', 'Fracción penalizada por no presentarse sin aviso (Art. 4)'),
  ('vigencia_paquete_dias', '30', 'Días calendario de vigencia de los paquetes'),
  ('vigencia_recompensas_dias', '90', 'Días de vigencia de las horas de recompensa por derivación'),
  ('vigencia_credito_dias', '30', 'Días de vigencia de créditos por cancelación de hora individual'),
  ('retencion_payphone_minutos', '30', 'Minutos que se retiene un bloque con pago Payphone sin completar'),
  ('recordatorio_transferencia_horas', '12', 'Horas sin confirmar una transferencia antes de recordar al co-manager'),
  ('whatsapp_numero', '"593983936496"', 'Número de WhatsApp del establecimiento (formato internacional, sin +)'),
  ('bancos', '[
    {"banco": "Banco Guayaquil", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"},
    {"banco": "Banco Pichincha", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"},
    {"banco": "Produbanco", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"},
    {"banco": "Banco del Pacífico", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"}
  ]', 'Cuentas bancarias para transferencias (editar con datos reales)');

-- ---------- Catálogo de recompensas por derivación ----------
insert into reward_catalog (estudio, horas, orden) values
  ('Electrocardiograma', 1, 1),
  ('Ecocardiograma', 2, 2),
  ('Prueba de esfuerzo', 3, 3),
  ('Holter de ritmo', 2, 4),
  ('MAPA (presión arterial 24h)', 2, 5),
  ('Asesoramiento nutricional con especialista', 2, 6);

-- ---------- Feriados nacionales de Ecuador (con traslados según ley) ----------
insert into holidays_blocks (fecha, tipo, motivo) values
  -- 2026
  ('2026-01-01', 'feriado', 'Año Nuevo'),
  ('2026-02-16', 'feriado', 'Carnaval'),
  ('2026-02-17', 'feriado', 'Carnaval'),
  ('2026-04-03', 'feriado', 'Viernes Santo'),
  ('2026-05-01', 'feriado', 'Día del Trabajo'),
  ('2026-05-25', 'feriado', 'Batalla de Pichincha (trasladado del dom. 24)'),
  ('2026-08-10', 'feriado', 'Primer Grito de Independencia'),
  ('2026-10-09', 'feriado', 'Independencia de Guayaquil'),
  ('2026-11-02', 'feriado', 'Día de los Difuntos'),
  ('2026-11-03', 'feriado', 'Independencia de Cuenca'),
  ('2026-12-25', 'feriado', 'Navidad'),
  -- 2027
  ('2027-01-01', 'feriado', 'Año Nuevo'),
  ('2027-02-08', 'feriado', 'Carnaval'),
  ('2027-02-09', 'feriado', 'Carnaval'),
  ('2027-03-26', 'feriado', 'Viernes Santo'),
  ('2027-04-30', 'feriado', 'Día del Trabajo (trasladado del sáb. 1 de mayo)'),
  ('2027-05-24', 'feriado', 'Batalla de Pichincha'),
  ('2027-08-09', 'feriado', 'Primer Grito de Independencia (trasladado del mar. 10)'),
  ('2027-10-08', 'feriado', 'Independencia de Guayaquil (trasladado del sáb. 9)'),
  ('2027-11-01', 'feriado', 'Día de los Difuntos (trasladado del mar. 2)'),
  ('2027-11-05', 'feriado', 'Independencia de Cuenca (trasladado del mié. 3)');

-- ---------- Términos y condiciones v1.0 (Reglamento íntegro) ----------
insert into tnc_versions (version, contenido_md, publicado) values ('1.0', $tnc$
# Términos y Condiciones de Uso — VitalCowork

Al registrarte en VitalCowork declaras y aceptas:

1. **Acreditación profesional.** Eres un profesional de la salud legalmente habilitado en Ecuador (registro ACESS/Senescyt o equivalente) y la documentación que cargas es auténtica. Tu cuenta se activa solo tras la verificación del administrador.
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
$tnc$, true);

-- ============================================================
-- Cuentas demo (SOLO desarrollo local — no ejecutar en producción)
-- ============================================================
do $$
declare
  v_ids uuid[] := array[
    'a0000000-0000-0000-0000-000000000001', -- co-manager
    'a0000000-0000-0000-0000-000000000002', -- Dra. Paredes (Nutrición)
    'a0000000-0000-0000-0000-000000000003', -- Dr. Molina (Medicina Interna)
    'a0000000-0000-0000-0000-000000000004'  -- Lic. Andrade (Psicología)
  ]::uuid[];
  v_emails text[] := array['admin@vitalcowork.ec', 'dra.paredes@demo.ec', 'dr.molina@demo.ec', 'lic.andrade@demo.ec'];
  i int;
begin
  for i in 1..4 loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_ids[i], 'authenticated', 'authenticated',
      v_emails[i], crypt('demo123456', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_ids[i], v_ids[i]::text,
      jsonb_build_object('sub', v_ids[i]::text, 'email', v_emails[i]),
      'email', now(), now(), now())
    on conflict do nothing;
  end loop;
end $$;

insert into profiles (id, rol, estado, nombre_completo, cedula, alias, especialidad_id, telefono, email) values
  ('a0000000-0000-0000-0000-000000000001', 'comanager', 'aprobado', 'Dr. Propietario VitalCowork',
   '0900000001', 'Dirección', (select id from specialties where nombre = 'Cardiología'),
   '0983936496', 'admin@vitalcowork.ec'),
  ('a0000000-0000-0000-0000-000000000002', 'comed', 'aprobado', 'Dra. Josefina Paredes',
   '0900000002', 'J.P.', (select id from specialties where nombre = 'Nutrición'),
   '0990000002', 'dra.paredes@demo.ec'),
  ('a0000000-0000-0000-0000-000000000003', 'comed', 'aprobado', 'Dr. Marco Molina',
   '0900000003', 'M.M.', (select id from specialties where nombre = 'Medicina Interna'),
   '0990000003', 'dr.molina@demo.ec'),
  ('a0000000-0000-0000-0000-000000000004', 'comed', 'pendiente', 'Lic. Carla Andrade',
   '0900000004', 'C.A.', (select id from specialties where nombre = 'Psicología'),
   '0990000004', 'lic.andrade@demo.ec');

insert into accreditations (profile_id, tipo, numero, estado) values
  ('a0000000-0000-0000-0000-000000000002', 'ACESS', 'ACESS-1020-2021', 'aprobada'),
  ('a0000000-0000-0000-0000-000000000003', 'Senescyt', '1015-2018-2001234', 'aprobada'),
  ('a0000000-0000-0000-0000-000000000004', 'ACESS', 'ACESS-3344-2023', 'pendiente');

-- Aceptaciones de T&C de las cuentas activas
insert into tnc_acceptances (profile_id, version_id)
select p.id, (select id from tnc_versions where version = '1.0')
from profiles p where p.estado = 'aprobado';

-- ---------- Paquete activo de ejemplo (Dra. Paredes, Estancia Plus 15h) ----------
insert into packages (id, profile_id, plan_id, horas_total, precio_total, estado, inicio, fin) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'estancia', 15, 180.00, 'activo', current_date - 5, current_date + 25);

insert into payments (profile_id, package_id, monto, metodo, estado, confirmado_por, confirmado_en) values
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   180.00, 'transferencia', 'confirmado', 'a0000000-0000-0000-0000-000000000001', now() - interval '5 days');

insert into wallet_ledger (profile_id, package_id, delta_horas, origen, descripcion, vence_en) values
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   15, 'compra_paquete', 'Paquete Estancia Plus (15 horas)', current_date + 25);

-- Recompensa acreditada de ejemplo (Dr. Molina derivó un ecocardiograma)
insert into referrals (id, profile_id, reward_id, paciente_iniciales, estado, acreditada_por, acreditada_en) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
   (select id from reward_catalog where estudio = 'Ecocardiograma'), 'N.N.',
   'acreditada', 'a0000000-0000-0000-0000-000000000001', now() - interval '2 days');
insert into wallet_ledger (profile_id, delta_horas, origen, referral_id, descripcion, vence_en) values
  ('a0000000-0000-0000-0000-000000000003', 2, 'recompensa', 'c0000000-0000-0000-0000-000000000001',
   'Recompensa por derivación: Ecocardiograma', current_date + 90);

-- ---------- Reservas de ejemplo (próxima semana laboral) ----------
do $$
declare
  v_lunes date := (date_trunc('week', current_date))::date + 7; -- lunes próximo
  v_principal uuid := '11111111-1111-1111-1111-111111111111';
  v_paredes uuid := 'a0000000-0000-0000-0000-000000000002';
  v_molina uuid := 'a0000000-0000-0000-0000-000000000003';
  v_pkg uuid := 'b0000000-0000-0000-0000-000000000001';
  v_id uuid;
begin
  -- Dra. Paredes: lunes 9:00 y 10:00 con su paquete
  insert into reservations (profile_id, space_id, fecha, hora, estado, origen, package_id, plan_id, precio)
  values (v_paredes, v_principal, v_lunes, 9, 'confirmada', 'app', v_pkg, 'estancia', 12.00)
  returning id into v_id;
  insert into wallet_ledger (profile_id, package_id, delta_horas, origen, reservation_id, descripcion)
  values (v_paredes, v_pkg, -1, 'consumo_reserva', v_id, 'Reserva lunes 9:00');

  insert into reservations (profile_id, space_id, fecha, hora, estado, origen, package_id, plan_id, precio)
  values (v_paredes, v_principal, v_lunes, 10, 'confirmada', 'app', v_pkg, 'estancia', 12.00)
  returning id into v_id;
  insert into wallet_ledger (profile_id, package_id, delta_horas, origen, reservation_id, descripcion)
  values (v_paredes, v_pkg, -1, 'consumo_reserva', v_id, 'Reserva lunes 10:00');

  -- Dr. Molina: martes 15:00, hora individual pagada por ventanilla
  insert into reservations (profile_id, space_id, fecha, hora, estado, origen, plan_id, precio, creado_por)
  values (v_molina, v_principal, v_lunes + 1, 15, 'confirmada', 'ventanilla', 'triaje', 15.00,
    'a0000000-0000-0000-0000-000000000001');
end $$;
