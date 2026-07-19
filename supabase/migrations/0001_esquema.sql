-- ============================================================
-- VitalCowork — Esquema principal
-- Zona horaria de negocio: America/Guayaquil
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type rol_usuario as enum ('comed', 'comanager');
create type estado_perfil as enum ('pendiente', 'aprobado', 'suspendido');
create type estado_acreditacion as enum ('pendiente', 'aprobada', 'rechazada');
create type estado_reserva as enum ('pendiente_pago', 'confirmada', 'en_curso', 'completada', 'cancelada', 'no_show');
create type origen_reserva as enum ('app', 'ventanilla', 'whatsapp', 'telefono');
create type metodo_pago as enum ('payphone', 'transferencia', 'efectivo');
create type estado_pago as enum ('pendiente', 'confirmado', 'rechazado');
create type estado_derivacion as enum ('solicitada', 'acreditada', 'rechazada');
create type origen_movimiento as enum (
  'compra_paquete', 'recompensa', 'consumo_reserva', 'hora_extra',
  'penalizacion', 'reembolso_cancelacion', 'ajuste_manual', 'expiracion'
);
create type tipo_bloqueo as enum ('feriado', 'manual');
create type estado_paquete as enum ('pendiente_pago', 'activo', 'agotado', 'expirado');

-- ---------- Catálogos ----------
create table specialties (
  id serial primary key,
  nombre text not null unique,
  activa boolean not null default true
);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  es_principal boolean not null default false,
  -- El satélite tiene reservable_publico = false: solo aparece cuando el
  -- co-manager lo habilita (space_availability) o agenda directamente en él.
  reservable_publico boolean not null default true,
  activo boolean not null default true
);

-- Habilitaciones puntuales del espacio satélite (modo emergente)
create table space_availability (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  nota text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create table plans (
  id text primary key, -- 'triaje' | 'estancia' | 'vip'
  nivel text not null, -- Básico | Silver | Gold
  nombre text not null, -- Plan Triaje | Plan Estancia Plus | Plan Ronda Médica VIP
  precio_hora numeric(6,2) not null,
  min_horas_semana int, -- null = sin paquete semanal
  min_horas_mes int,
  -- null = reagendamientos ilimitados (beneficio Silver/Gold)
  reagendamientos_por_reserva int,
  color text not null default '#0e7490',
  badge text,
  copy_comercial text,
  orden int not null default 0,
  activo boolean not null default true
);

-- ---------- Usuarios ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol rol_usuario not null default 'comed',
  estado estado_perfil not null default 'pendiente',
  nombre_completo text not null,
  cedula text,
  alias text not null, -- lo único visible para otros co-meds
  especialidad_id int references specialties(id),
  telefono text,
  email text not null,
  reincidencias_excedente int not null default 0,
  suspension_proxima_reserva boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table accreditations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tipo text not null default 'ACESS', -- ACESS | Senescyt | Otro
  numero text not null,
  documento_path text, -- ruta en Storage (bucket privado 'acreditaciones')
  estado estado_acreditacion not null default 'pendiente',
  comentario text,
  revisado_por uuid references profiles(id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now()
);

-- ---------- Paquetes y monedero ----------
create table packages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id text not null references plans(id),
  horas_total numeric(6,2) not null,
  precio_total numeric(8,2) not null,
  estado estado_paquete not null default 'pendiente_pago',
  inicio date, -- se fija al confirmar el pago
  fin date,    -- inicio + 30 días calendario
  creado_en timestamptz not null default now()
);

-- Monedero de horas: libro mayor inmutable (fuente de verdad del saldo)
create table wallet_ledger (
  id bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  package_id uuid references packages(id),
  delta_horas numeric(6,2) not null,
  origen origen_movimiento not null,
  reservation_id uuid,
  referral_id uuid,
  descripcion text,
  vence_en date, -- vigencia de las horas acreditadas (paquete o recompensa)
  creado_por uuid,
  creado_en timestamptz not null default now()
);
create index ix_wallet_profile on wallet_ledger(profile_id);
create index ix_wallet_package on wallet_ledger(package_id);

-- ---------- Reservas ----------
create table reservations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  space_id uuid not null references spaces(id),
  fecha date not null,
  hora smallint not null check (hora between 0 and 23), -- hora de inicio del bloque de 1h
  estado estado_reserva not null default 'pendiente_pago',
  origen origen_reserva not null default 'app',
  package_id uuid references packages(id),
  plan_id text references plans(id),
  precio numeric(6,2) not null default 0,
  pago_id uuid, -- FK a payments (se agrega luego por orden de creación)
  reagendamientos int not null default 0,
  es_hora_extra boolean not null default false, -- generada por excedente Art. 9
  notas text,
  creado_por uuid, -- distinto de profile_id cuando agenda el co-manager
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ⚠ Prevención de colisiones: un solo ocupante activo por bloque/espacio.
-- Postgres garantiza esto incluso bajo concurrencia (índice único parcial).
create unique index ux_reserva_bloque on reservations(space_id, fecha, hora)
  where estado in ('pendiente_pago', 'confirmada', 'en_curso');

create index ix_reservas_perfil on reservations(profile_id, fecha);
create index ix_reservas_fecha on reservations(fecha) where estado <> 'cancelada';

-- Historial auditable de todo lo que pasa con una reserva
create table reservation_events (
  id bigserial primary key,
  reservation_id uuid not null references reservations(id) on delete cascade,
  tipo text not null, -- creada | reagendada | cancelada | no_show | penalizacion |
                      -- cambio_espacio | check_in | check_out | hora_extra | suspension
  datos jsonb not null default '{}',
  actor uuid,
  creado_en timestamptz not null default now()
);
create index ix_eventos_reserva on reservation_events(reservation_id);

-- ---------- Sesiones (check-in / check-out) ----------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references reservations(id) on delete cascade,
  checkin_at timestamptz not null default now(),
  checkin_por uuid not null,
  checkin_dispositivo text not null default 'app',
  checkout_at timestamptz,
  checkout_por uuid,
  checkout_dispositivo text,
  minutos_excedente int not null default 0,
  horas_extra_cobradas numeric(4,2) not null default 0,
  alerta_franja_ocupada boolean not null default false
);

-- ---------- Pagos ----------
create table payments (
  id uuid primary key default gen_random_uuid(),
  numero_recibo serial,
  profile_id uuid not null references profiles(id) on delete cascade,
  package_id uuid references packages(id),
  monto numeric(8,2) not null,
  metodo metodo_pago not null,
  estado estado_pago not null default 'pendiente',
  comprobante_path text, -- Storage privado 'comprobantes' (transferencias)
  payphone_tx jsonb,     -- respuesta de la pasarela Payphone
  confirmado_por uuid references profiles(id),
  confirmado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table reservations
  add constraint fk_reserva_pago foreign key (pago_id) references payments(id);

-- ---------- Recompensas por derivación ----------
create table reward_catalog (
  id serial primary key,
  estudio text not null,
  horas numeric(4,1) not null,
  activo boolean not null default true,
  orden int not null default 0
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  reward_id int not null references reward_catalog(id),
  paciente_iniciales text not null check (char_length(paciente_iniciales) <= 6),
  estado estado_derivacion not null default 'solicitada',
  nota text,
  acreditada_por uuid references profiles(id),
  acreditada_en timestamptz,
  creado_en timestamptz not null default now()
);

-- ---------- Calificaciones internas (solo co-manager) ----------
create table ratings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  estrellas int not null check (estrellas between 1 and 5),
  notas text,
  creado_por uuid not null references profiles(id),
  actualizado_en timestamptz not null default now()
);

-- ---------- Feriados y bloqueos ----------
create table holidays_blocks (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo tipo_bloqueo not null,
  motivo text not null,
  space_id uuid references spaces(id), -- null = todo el establecimiento
  hora_inicio smallint, -- null = todo el día
  hora_fin smallint,
  creado_por uuid,
  creado_en timestamptz not null default now()
);
create index ix_bloqueos_fecha on holidays_blocks(fecha);

-- ---------- Configuración editable ----------
create table settings (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);

-- ---------- Términos y condiciones ----------
create table tnc_versions (
  id serial primary key,
  version text not null unique,
  contenido_md text not null,
  publicado boolean not null default false,
  creado_por uuid,
  creado_en timestamptz not null default now()
);

create table tnc_acceptances (
  id bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  version_id int not null references tnc_versions(id),
  aceptado_en timestamptz not null default now(),
  ip text,
  user_agent text,
  unique (profile_id, version_id)
);

-- ---------- Notificaciones ----------
create table notifications (
  id bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  canal text not null default 'app', -- app | push | email
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  datos jsonb not null default '{}',
  enviado_en timestamptz,
  leido_en timestamptz,
  creado_en timestamptz not null default now()
);
create index ix_notif_perfil on notifications(profile_id, creado_en desc);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);

-- ---------- Trigger de actualizado_en ----------
create or replace function fn_touch() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;
create trigger tg_touch_profiles before update on profiles
  for each row execute function fn_touch();
create trigger tg_touch_reservas before update on reservations
  for each row execute function fn_touch();

-- ---------- Realtime ----------
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table holidays_blocks;
alter publication supabase_realtime add table space_availability;
