-- ############ migrations\0001_esquema.sql ############

-- ============================================================
-- VitalCowork â€” Esquema principal
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

-- ---------- CatÃ¡logos ----------
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
  -- El satÃ©lite tiene reservable_publico = false: solo aparece cuando el
  -- co-manager lo habilita (space_availability) o agenda directamente en Ã©l.
  reservable_publico boolean not null default true,
  activo boolean not null default true
);

-- Habilitaciones puntuales del espacio satÃ©lite (modo emergente)
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
  nivel text not null, -- BÃ¡sico | Silver | Gold
  nombre text not null, -- Plan Triaje | Plan Estancia Plus | Plan Ronda MÃ©dica VIP
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
  alias text not null, -- lo Ãºnico visible para otros co-meds
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
  fin date,    -- inicio + 30 dÃ­as calendario
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
  pago_id uuid, -- FK a payments (se agrega luego por orden de creaciÃ³n)
  reagendamientos int not null default 0,
  es_hora_extra boolean not null default false, -- generada por excedente Art. 9
  notas text,
  creado_por uuid, -- distinto de profile_id cuando agenda el co-manager
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- âš  PrevenciÃ³n de colisiones: un solo ocupante activo por bloque/espacio.
-- Postgres garantiza esto incluso bajo concurrencia (Ã­ndice Ãºnico parcial).
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

-- ---------- Recompensas por derivaciÃ³n ----------
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
  hora_inicio smallint, -- null = todo el dÃ­a
  hora_fin smallint,
  creado_por uuid,
  creado_en timestamptz not null default now()
);
create index ix_bloqueos_fecha on holidays_blocks(fecha);

-- ---------- ConfiguraciÃ³n editable ----------
create table settings (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);

-- ---------- TÃ©rminos y condiciones ----------
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


-- ############ migrations\0002_rls.sql ############

-- ============================================================
-- VitalCowork â€” Row Level Security
-- Control de acceso por rol EN EL BACKEND (no solo UI):
--  Â· co-med: solo ve/edita lo suyo; las reservas ajenas solo vÃ­a la
--    vista anonimizada calendario_publico (alias + especialidad).
--  Â· co-manager: acceso completo.
-- ============================================================

-- Helper: Â¿el usuario autenticado es co-manager?
-- SECURITY DEFINER para evitar recursiÃ³n de RLS sobre profiles.
create or replace function public.es_comanager() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and rol = 'comanager'); $$;

create or replace function public.mi_perfil_aprobado() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and estado = 'aprobado'); $$;

-- ---------- Activar RLS en todas las tablas ----------
alter table specialties enable row level security;
alter table spaces enable row level security;
alter table space_availability enable row level security;
alter table plans enable row level security;
alter table profiles enable row level security;
alter table accreditations enable row level security;
alter table packages enable row level security;
alter table wallet_ledger enable row level security;
alter table reservations enable row level security;
alter table reservation_events enable row level security;
alter table sessions enable row level security;
alter table payments enable row level security;
alter table reward_catalog enable row level security;
alter table referrals enable row level security;
alter table ratings enable row level security;
alter table holidays_blocks enable row level security;
alter table settings enable row level security;
alter table tnc_versions enable row level security;
alter table tnc_acceptances enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

-- ---------- CatÃ¡logos: lectura pÃºblica autenticada, escritura co-manager ----------
create policy sel_specialties on specialties for select to authenticated using (true);
create policy adm_specialties on specialties for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_spaces on spaces for select to authenticated using (true);
create policy adm_spaces on spaces for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_space_avail on space_availability for select to authenticated using (true);
create policy adm_space_avail on space_availability for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_plans on plans for select to authenticated using (true);
create policy adm_plans on plans for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_rewards on reward_catalog for select to authenticated using (true);
create policy adm_rewards on reward_catalog for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_holidays on holidays_blocks for select to authenticated using (true);
create policy adm_holidays on holidays_blocks for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_settings on settings for select to authenticated using (true);
create policy adm_settings on settings for all to authenticated
  using (es_comanager()) with check (es_comanager());

-- ---------- Perfiles ----------
create policy sel_perfil_propio on profiles for select to authenticated
  using (id = auth.uid() or es_comanager());
create policy ins_perfil_propio on profiles for insert to authenticated
  with check (id = auth.uid() and rol = 'comed'); -- nadie se auto-nombra co-manager
create policy upd_perfil_propio on profiles for update to authenticated
  using (id = auth.uid() or es_comanager())
  with check (
    es_comanager() or (
      id = auth.uid()
      -- un co-med no puede cambiarse rol/estado/contadores (se valida en trigger)
    )
  );

-- Trigger de defensa: un co-med no puede escalar rol ni auto-aprobarse
create or replace function fn_proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not es_comanager() and auth.uid() is not null then
    new.rol := old.rol;
    new.estado := old.estado;
    new.reincidencias_excedente := old.reincidencias_excedente;
    new.suspension_proxima_reserva := old.suspension_proxima_reserva;
  end if;
  return new;
end $$;
create trigger tg_proteger_perfil before update on profiles
  for each row execute function fn_proteger_perfil();

-- ---------- Acreditaciones: el dueÃ±o sube y ve; solo co-manager revisa ----------
create policy sel_acred on accreditations for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy ins_acred on accreditations for insert to authenticated
  with check (profile_id = auth.uid() or es_comanager());
create policy upd_acred on accreditations for update to authenticated
  using (es_comanager()) with check (es_comanager());

-- ---------- Paquetes y monedero: lectura propia; escritura solo vÃ­a funciones ----------
create policy sel_paquetes on packages for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy sel_wallet on wallet_ledger for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy adm_wallet on wallet_ledger for insert to authenticated
  with check (es_comanager()); -- ajustes manuales; el resto lo hacen funciones SECURITY DEFINER

-- ---------- Reservas: el co-med solo ve las suyas (las ajenas van por la vista) ----------
create policy sel_reservas on reservations for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
-- inserciones/updates SOLO vÃ­a funciones transaccionales (security definer)
create policy adm_reservas on reservations for all to authenticated
  using (es_comanager()) with check (es_comanager());

create policy sel_eventos on reservation_events for select to authenticated
  using (es_comanager() or exists (
    select 1 from reservations r where r.id = reservation_id and r.profile_id = auth.uid()
  ));

create policy sel_sesiones on sessions for select to authenticated
  using (es_comanager() or exists (
    select 1 from reservations r where r.id = reservation_id and r.profile_id = auth.uid()
  ));

-- ---------- Pagos ----------
create policy sel_pagos on payments for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy upd_pagos on payments for update to authenticated
  using (es_comanager()) with check (es_comanager());
-- el co-med adjunta su comprobante de transferencia sobre SU pago pendiente
create policy upd_comprobante on payments for update to authenticated
  using (profile_id = auth.uid() and estado = 'pendiente')
  with check (profile_id = auth.uid());

-- ---------- Derivaciones ----------
create policy sel_deriv on referrals for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy ins_deriv on referrals for insert to authenticated
  with check (profile_id = auth.uid() and estado = 'solicitada' and mi_perfil_aprobado());
create policy upd_deriv on referrals for update to authenticated
  using (es_comanager()) with check (es_comanager());

-- ---------- Calificaciones: SOLO co-manager (ni siquiera el calificado las ve) ----------
create policy adm_ratings on ratings for all to authenticated
  using (es_comanager()) with check (es_comanager());

-- ---------- T&C ----------
create policy sel_tnc on tnc_versions for select to authenticated using (true);
create policy sel_tnc_anon on tnc_versions for select to anon using (publicado);
create policy adm_tnc on tnc_versions for all to authenticated
  using (es_comanager()) with check (es_comanager());
create policy sel_acept on tnc_acceptances for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy ins_acept on tnc_acceptances for insert to authenticated
  with check (profile_id = auth.uid());

-- ---------- Notificaciones ----------
create policy sel_notif on notifications for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy upd_notif on notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy all_push on push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ============================================================
-- Vista anonimizada del calendario (privacidad entre co-meds):
-- expone SOLO alias + especialidad de reservas ajenas. Corre como owner
-- (security_invoker = off) para poder leer reservations/profiles, pero
-- limita las columnas expuestas.
-- ============================================================
create or replace view calendario_publico
with (security_invoker = off) as
select
  r.id,
  r.space_id,
  r.fecha,
  r.hora,
  r.estado,
  r.es_hora_extra,
  (r.profile_id = auth.uid()) as es_mia,
  case when r.profile_id = auth.uid() or es_comanager()
    then p.alias else p.alias end as alias, -- alias siempre (es el dato pÃºblico)
  s.nombre as especialidad,
  case when es_comanager() then r.profile_id else null end as profile_id
from reservations r
join profiles p on p.id = r.profile_id
left join specialties s on s.id = p.especialidad_id
where r.estado in ('pendiente_pago', 'confirmada', 'en_curso', 'completada');

grant select on calendario_publico to authenticated;

-- ---------- Storage: buckets privados ----------
insert into storage.buckets (id, name, public) values
  ('acreditaciones', 'acreditaciones', false),
  ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- Cada usuario sube a su carpeta (primer segmento = su uid); solo el
-- dueÃ±o y el co-manager pueden leer.
create policy up_acred on storage.objects for insert to authenticated
  with check (bucket_id = 'acreditaciones' and (storage.foldername(name))[1] = auth.uid()::text);
create policy rd_acred on storage.objects for select to authenticated
  using (bucket_id = 'acreditaciones' and ((storage.foldername(name))[1] = auth.uid()::text or es_comanager()));
create policy up_comp on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy rd_comp on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or es_comanager()));


-- ############ migrations\0003_funciones.sql ############

-- ============================================================
-- VitalCowork â€” Funciones transaccionales de negocio
-- Toda la lÃ³gica crÃ­tica vive en el backend (SECURITY DEFINER):
-- la UI solo llama RPCs; las reglas no se pueden burlar desde el cliente.
-- ============================================================

-- ---------- Helpers ----------
create or replace function fn_config(p_clave text) returns jsonb
language sql stable security definer set search_path = public as
$$ select valor from settings where clave = p_clave; $$;

-- timestamptz del inicio de un bloque (hora local America/Guayaquil)
create or replace function fn_bloque_ts(p_fecha date, p_hora smallint) returns timestamptz
language sql immutable as
$$ select (p_fecha::timestamp + make_interval(hours => p_hora)) at time zone 'America/Guayaquil'; $$;

create or replace function fn_hoy_gye() returns date
language sql stable as
$$ select (now() at time zone 'America/Guayaquil')::date; $$;

-- Horas de inicio reservables segÃºn la configuraciÃ³n de jornadas
create or replace function fn_horas_reservables() returns smallint[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_jornadas jsonb := coalesce(fn_config('horario') -> 'jornadas', '[[9,12],[13,18]]'::jsonb);
  v_horas smallint[] := '{}';
  v_j jsonb; v_h int;
begin
  for v_j in select * from jsonb_array_elements(v_jornadas) loop
    for v_h in (v_j ->> 0)::int .. (v_j ->> 1)::int - 1 loop
      v_horas := v_horas || v_h::smallint;
    end loop;
  end loop;
  return v_horas;
end $$;

-- Â¿El bloque es vÃ¡lido para reservar? (dÃ­a hÃ¡bil, jornada, sin feriado/bloqueo,
-- espacio activo y habilitado)
create or replace function fn_bloque_valido(
  p_fecha date, p_hora smallint, p_space uuid, p_es_manager boolean
) returns text -- null = vÃ¡lido; texto = motivo de rechazo
language plpgsql stable security definer set search_path = public as $$
declare
  v_space spaces;
begin
  if extract(isodow from p_fecha) > 5 then
    return 'Solo se reserva de lunes a viernes';
  end if;
  if not (p_hora = any (fn_horas_reservables())) then
    return 'Hora fuera del horario de atenciÃ³n';
  end if;
  select * into v_space from spaces where id = p_space;
  if v_space is null or not v_space.activo then
    return 'Espacio no disponible';
  end if;
  if not v_space.reservable_publico and not p_es_manager
     and not exists (
       select 1 from space_availability sa
       where sa.space_id = p_space and p_fecha between sa.fecha_inicio and sa.fecha_fin
     ) then
    return 'Este espacio solo estÃ¡ habilitado por el administrador';
  end if;
  if exists (
    select 1 from holidays_blocks hb
    where hb.fecha = p_fecha
      and (hb.space_id is null or hb.space_id = p_space)
      and (hb.hora_inicio is null or p_hora between hb.hora_inicio and hb.hora_fin - 1)
  ) then
    return 'Fecha bloqueada (feriado o bloqueo del establecimiento)';
  end if;
  return null;
end $$;

-- Saldo del monedero (general o de un paquete)
create or replace function fn_saldo_monedero(p_profile uuid, p_package uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta_horas), 0) from wallet_ledger
  where profile_id = p_profile
    and (p_package is null or package_id = p_package);
$$;

create or replace function fn_notificar(
  p_profile uuid, p_tipo text, p_titulo text, p_cuerpo text, p_datos jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into notifications (profile_id, tipo, titulo, cuerpo, datos)
  values (p_profile, p_tipo, p_titulo, p_cuerpo, p_datos);
$$;

create or replace function fn_comanager_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from profiles where rol = 'comanager' limit 1; $$;

-- ============================================================
-- Tabla espejo pÃºblica del calendario (sin datos personales) para
-- Realtime: todos los co-meds la pueden leer; solo muestra alias + especialidad.
-- ============================================================
create table calendar_slots (
  reservation_id uuid primary key,
  space_id uuid not null,
  fecha date not null,
  hora smallint not null,
  estado estado_reserva not null,
  alias text not null,
  especialidad text,
  es_hora_extra boolean not null default false
);
alter table calendar_slots enable row level security;
create policy sel_slots on calendar_slots for select to authenticated using (true);
alter publication supabase_realtime add table calendar_slots;

create or replace function fn_sync_slot() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text; v_esp text;
begin
  if tg_op = 'DELETE' then
    delete from calendar_slots where reservation_id = old.id;
    return old;
  end if;
  if new.estado in ('cancelada', 'no_show') then
    delete from calendar_slots where reservation_id = new.id;
    return new;
  end if;
  select p.alias, s.nombre into v_alias, v_esp
  from profiles p left join specialties s on s.id = p.especialidad_id
  where p.id = new.profile_id;
  insert into calendar_slots (reservation_id, space_id, fecha, hora, estado, alias, especialidad, es_hora_extra)
  values (new.id, new.space_id, new.fecha, new.hora, new.estado, coalesce(v_alias, 'â€”'), v_esp, new.es_hora_extra)
  on conflict (reservation_id) do update set
    space_id = excluded.space_id, fecha = excluded.fecha, hora = excluded.hora,
    estado = excluded.estado, alias = excluded.alias,
    especialidad = excluded.especialidad, es_hora_extra = excluded.es_hora_extra;
  return new;
end $$;
create trigger tg_sync_slot after insert or update or delete on reservations
  for each row execute function fn_sync_slot();

-- ============================================================
-- RESERVAR BLOQUES (multi-selecciÃ³n, transaccional, anti-colisiÃ³n)
-- p_bloques: [{"fecha":"2026-07-20","hora":9}, ...]
-- ============================================================
create or replace function fn_reservar_bloques(
  p_bloques jsonb,
  p_space uuid,
  p_usar_paquete boolean default true,
  p_origen origen_reserva default 'app',
  p_para uuid default null,
  p_notas text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_profile uuid := coalesce(p_para, v_actor);
  v_perfil profiles;
  v_pkg packages;
  v_plan plans;
  v_precio numeric;
  v_b jsonb; v_fecha date; v_hora smallint; v_err text;
  v_id uuid; v_ids uuid[] := '{}';
  v_total numeric := 0;
  v_n int := jsonb_array_length(p_bloques);
  v_estado estado_reserva;
  v_fin_mes date;
begin
  if v_actor is null then raise exception 'NO_AUTENTICADO'; end if;
  if v_profile <> v_actor and not v_manager then
    raise exception 'SOLO_COMANAGER: no puedes reservar a nombre de otro profesional';
  end if;
  select * into v_perfil from profiles where id = v_profile;
  if v_perfil is null or v_perfil.estado <> 'aprobado' then
    raise exception 'PERFIL_NO_APROBADO: la cuenta debe estar aprobada por el administrador';
  end if;

  -- Art. 9: suspensiÃ³n automÃ¡tica de la prÃ³xima reserva por reincidencia
  if v_perfil.suspension_proxima_reserva and not v_manager then
    update profiles set suspension_proxima_reserva = false, reincidencias_excedente = 0
      where id = v_profile;
    perform fn_notificar(v_profile, 'suspension',
      'Reserva suspendida (Art. 9)',
      'Por exceder repetidamente tu tiempo reservado, esta reserva fue suspendida automÃ¡ticamente segÃºn el Art. 9 del reglamento. Ya puedes volver a reservar.');
    perform fn_notificar(fn_comanager_id(), 'suspension',
      'SuspensiÃ³n aplicada', format('Se aplicÃ³ la suspensiÃ³n automÃ¡tica de reserva a %s.', v_perfil.nombre_completo));
    raise exception 'SUSPENSION_ART9: por reincidencia en excedentes, esta reserva queda suspendida (Art. 9 del reglamento). Tu prÃ³xima reserva ya estarÃ¡ habilitada.';
  end if;

  -- Paquete activo con saldo suficiente (si se pide usar paquete)
  if p_usar_paquete then
    select pk.* into v_pkg from packages pk
    where pk.profile_id = v_profile and pk.estado = 'activo'
      and pk.fin >= fn_hoy_gye()
      and fn_saldo_monedero(v_profile, pk.id) >= v_n
    order by pk.fin asc limit 1;
  end if;

  if v_pkg.id is not null then
    select * into v_plan from plans where id = v_pkg.plan_id;
    v_precio := v_plan.precio_hora;
    v_estado := 'confirmada'; -- ya pagada con el paquete
  else
    select * into v_plan from plans where id = 'triaje';
    v_precio := v_plan.precio_hora;
    v_estado := 'pendiente_pago';
  end if;

  v_fin_mes := (date_trunc('month', fn_hoy_gye()) + interval '1 month - 1 day')::date;

  for v_b in select * from jsonb_array_elements(p_bloques) loop
    v_fecha := (v_b ->> 'fecha')::date;
    v_hora := (v_b ->> 'hora')::smallint;

    if fn_bloque_ts(v_fecha, v_hora) <= now() then
      raise exception 'BLOQUE_PASADO: % %:00 ya pasÃ³', v_fecha, v_hora;
    end if;
    v_err := fn_bloque_valido(v_fecha, v_hora, p_space, v_manager);
    if v_err is not null then
      raise exception 'BLOQUE_INVALIDO: % (% %:00)', v_err, v_fecha, v_hora;
    end if;
    -- Plan Triaje: reservable solo dentro del mes en curso
    if v_pkg.id is null and v_fecha > v_fin_mes then
      raise exception 'FUERA_DE_MES: con hora individual (Plan Triaje) solo puedes reservar dentro del mes en curso';
    end if;
    -- Paquete: solo dentro de su vigencia de 30 dÃ­as
    if v_pkg.id is not null and v_fecha > v_pkg.fin then
      raise exception 'FUERA_DE_VIGENCIA: tu paquete vence el %', v_pkg.fin;
    end if;

    begin
      insert into reservations (profile_id, space_id, fecha, hora, estado, origen,
        package_id, plan_id, precio, notas, creado_por)
      values (v_profile, p_space, v_fecha, v_hora, v_estado, p_origen,
        v_pkg.id, v_plan.id, v_precio, p_notas, v_actor)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'BLOQUE_OCUPADO: el bloque % %:00 acaba de ser reservado por otro profesional', v_fecha, v_hora;
    end;

    v_ids := v_ids || v_id;
    v_total := v_total + v_precio;
    insert into reservation_events (reservation_id, tipo, actor, datos)
      values (v_id, 'creada', v_actor, jsonb_build_object('origen', p_origen, 'paquete', v_pkg.id is not null));

    if v_pkg.id is not null then
      insert into wallet_ledger (profile_id, package_id, delta_horas, origen, reservation_id, descripcion, creado_por)
      values (v_profile, v_pkg.id, -1, 'consumo_reserva', v_id,
        format('Reserva %s %s:00', v_fecha, v_hora), v_actor);
    end if;
  end loop;

  if v_pkg.id is not null and fn_saldo_monedero(v_profile, v_pkg.id) <= 0 then
    update packages set estado = 'agotado' where id = v_pkg.id;
  end if;

  perform fn_notificar(v_profile, 'reserva_creada', 'Reserva registrada',
    format('%s bloque(s) reservado(s). %s', v_n,
      case when v_estado = 'confirmada' then 'Confirmada con tu paquete.' else 'Pendiente de pago.' end),
    jsonb_build_object('reservas', to_jsonb(v_ids)));

  return jsonb_build_object(
    'reservas', to_jsonb(v_ids),
    'estado', v_estado,
    'total', case when v_pkg.id is not null then 0 else v_total end,
    'paquete', v_pkg.id,
    'precio_hora', v_precio
  );
end $$;

-- ============================================================
-- REAGENDAR (polÃ­tica flexible por plan; Art. dedicado del brief)
-- ============================================================
create or replace function fn_reagendar(
  p_reserva uuid, p_fecha date, p_hora smallint, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_r reservations;
  v_plan plans;
  v_pkg packages;
  v_ant_horas numeric := coalesce((fn_config('reagenda_anticipacion_horas'))::text::numeric, 4);
  v_err text;
  v_old jsonb;
begin
  select * into v_r from reservations where id = p_reserva for update;
  if v_r.id is null then raise exception 'RESERVA_NO_EXISTE'; end if;
  if v_r.profile_id <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  if v_r.estado not in ('confirmada', 'pendiente_pago') then
    raise exception 'NO_REAGENDABLE: la reserva estÃ¡ en estado %', v_r.estado;
  end if;

  select * into v_plan from plans where id = v_r.plan_id;
  if v_r.package_id is not null then
    select * into v_pkg from packages where id = v_r.package_id;
  end if;

  if not v_manager then
    -- AnticipaciÃ³n mÃ­nima (configurable, inicial 4h)
    if fn_bloque_ts(v_r.fecha, v_r.hora) - now() < make_interval(hours => v_ant_horas::int) then
      raise exception 'FUERA_DE_TIEMPO: solo puedes reagendar con al menos % horas de anticipaciÃ³n', v_ant_horas;
    end if;
    -- LÃ­mite por plan (null = ilimitado, beneficio Estancia Plus / Ronda MÃ©dica VIP)
    if v_plan.reagendamientos_por_reserva is not null
       and v_r.reagendamientos >= v_plan.reagendamientos_por_reserva then
      raise exception 'LIMITE_REAGENDA: tu plan permite % reagendamiento(s) por reserva. Mejora a Estancia Plus o Ronda MÃ©dica VIP para reagendar sin lÃ­mite.', v_plan.reagendamientos_por_reserva;
    end if;
    -- Ventana de destino
    if v_r.package_id is null then
      if date_trunc('week', p_fecha::timestamp) <> date_trunc('week', v_r.fecha::timestamp) then
        raise exception 'FUERA_DE_SEMANA: con hora individual el nuevo bloque debe caer en la misma semana laboral de la reserva original';
      end if;
    else
      if p_fecha < v_pkg.inicio or p_fecha > v_pkg.fin then
        raise exception 'FUERA_DE_VIGENCIA: el nuevo bloque debe estar dentro de la vigencia de tu paquete (hasta %)', v_pkg.fin;
      end if;
    end if;
  end if;

  if fn_bloque_ts(p_fecha, p_hora) <= now() then
    raise exception 'BLOQUE_PASADO: ese bloque ya pasÃ³';
  end if;
  v_err := fn_bloque_valido(p_fecha, p_hora, v_r.space_id, v_manager);
  if v_err is not null then raise exception 'BLOQUE_INVALIDO: %', v_err; end if;

  v_old := jsonb_build_object('fecha', v_r.fecha, 'hora', v_r.hora);
  begin
    update reservations set fecha = p_fecha, hora = p_hora,
      reagendamientos = reagendamientos + case when v_actor = v_r.profile_id then 1 else 0 end
    where id = p_reserva;
  exception when unique_violation then
    -- El sistema jamÃ¡s pisa turnos de otros co-meds: solo bloques libres
    raise exception 'BLOQUE_OCUPADO: ese bloque ya estÃ¡ reservado, elige otro';
  end;

  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'reagendada', v_actor,
    v_old || jsonb_build_object('nueva_fecha', p_fecha, 'nueva_hora', p_hora, 'motivo', p_motivo));

  if v_actor = v_r.profile_id then
    perform fn_notificar(fn_comanager_id(), 'reagendada', 'Reserva reagendada',
      format('Una reserva del %s %s:00 se moviÃ³ al %s %s:00.', v_r.fecha, v_r.hora, p_fecha, p_hora),
      jsonb_build_object('reserva', p_reserva));
  else
    perform fn_notificar(v_r.profile_id, 'reagendada', 'Tu reserva fue reagendada',
      format('El administrador moviÃ³ tu reserva del %s %s:00 al %s %s:00.%s',
        v_r.fecha, v_r.hora, p_fecha, p_hora,
        coalesce(' Motivo: ' || p_motivo, '')),
      jsonb_build_object('reserva', p_reserva));
  end if;

  return jsonb_build_object('ok', true, 'fecha', p_fecha, 'hora', p_hora);
end $$;

-- ============================================================
-- CANCELAR (Art. 4: â‰¥24h sin costo; <24h 50%; no-show 100%)
-- ============================================================
create or replace function fn_cancelar(
  p_reserva uuid, p_motivo text default null, p_penalizar boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_r reservations;
  v_pkg packages;
  v_pct numeric := 0; -- porcentaje penalizado
  v_devolucion numeric := 0;
  v_pagada boolean;
  v_vence date;
begin
  select * into v_r from reservations where id = p_reserva for update;
  if v_r.id is null then raise exception 'RESERVA_NO_EXISTE'; end if;
  if v_r.profile_id <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  if v_r.estado not in ('confirmada', 'pendiente_pago') then
    raise exception 'NO_CANCELABLE: la reserva estÃ¡ en estado %', v_r.estado;
  end if;

  v_pagada := v_r.estado = 'confirmada';

  if v_manager and v_r.profile_id <> v_actor then
    -- CancelaciÃ³n del establecimiento: por defecto sin penalizaciÃ³n (reembolso total)
    v_pct := case when p_penalizar then coalesce((fn_config('penalizacion_dentro_24h'))::text::numeric, 0.5) else 0 end;
  elsif fn_bloque_ts(v_r.fecha, v_r.hora) - now() >= interval '24 hours' then
    v_pct := 0;
  else
    v_pct := coalesce((fn_config('penalizacion_dentro_24h'))::text::numeric, 0.5);
  end if;

  update reservations set estado = 'cancelada' where id = p_reserva;

  if v_pagada then
    v_devolucion := 1 - v_pct; -- en horas
    if v_r.package_id is not null then
      select * into v_pkg from packages where id = v_r.package_id;
      v_vence := v_pkg.fin;
    else
      v_vence := fn_hoy_gye() + coalesce((fn_config('vigencia_credito_dias'))::text::int, 30);
    end if;
    if v_devolucion > 0 then
      insert into wallet_ledger (profile_id, package_id, delta_horas, origen, reservation_id, descripcion, vence_en, creado_por)
      values (v_r.profile_id, v_r.package_id, v_devolucion, 'reembolso_cancelacion', p_reserva,
        format('DevoluciÃ³n por cancelaciÃ³n (%s%% penalizaciÃ³n)', (v_pct * 100)::int), v_vence, v_actor);
      if v_r.package_id is not null then
        update packages set estado = 'activo' where id = v_r.package_id and estado = 'agotado' and fin >= fn_hoy_gye();
      end if;
    end if;
    if v_pct > 0 then
      insert into reservation_events (reservation_id, tipo, actor, datos)
      values (p_reserva, 'penalizacion', v_actor,
        jsonb_build_object('porcentaje', v_pct, 'motivo', 'cancelacion_dentro_24h'));
    end if;
  end if;

  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'cancelada', v_actor,
    jsonb_build_object('motivo', p_motivo, 'penalizacion_pct', v_pct, 'devolucion_horas', v_devolucion));

  perform fn_notificar(v_r.profile_id, 'cancelada',
    'Reserva cancelada',
    format('Tu reserva del %s a las %s:00 fue cancelada.%s', v_r.fecha, v_r.hora,
      case when v_pct > 0 then format(' Se aplicÃ³ una penalizaciÃ³n del %s%% (Art. 4 del reglamento).', (v_pct*100)::int)
           when v_pagada then ' Se devolviÃ³ el 100%% a tu monedero de horas.' else '' end),
    jsonb_build_object('reserva', p_reserva));
  if v_actor = v_r.profile_id then
    perform fn_notificar(fn_comanager_id(), 'cancelada', 'CancelaciÃ³n de reserva',
      format('Se cancelÃ³ una reserva del %s %s:00.', v_r.fecha, v_r.hora));
  end if;

  return jsonb_build_object('ok', true, 'penalizacion_pct', v_pct, 'devolucion_horas', v_devolucion);
end $$;

-- ============================================================
-- NO-SHOW (Art. 4: penalizaciÃ³n del 100%)
-- ============================================================
create or replace function fn_marcar_no_show(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_r reservations;
begin
  if not es_comanager() and auth.uid() is not null then raise exception 'SOLO_COMANAGER'; end if;
  select * into v_r from reservations where id = p_reserva for update;
  if v_r.estado <> 'confirmada' then raise exception 'ESTADO_INVALIDO'; end if;
  update reservations set estado = 'no_show' where id = p_reserva;
  -- 100% de penalizaciÃ³n: no se devuelve nada (la hora ya se descontÃ³/pagÃ³)
  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'no_show', auth.uid(), jsonb_build_object('penalizacion_pct', 1));
  perform fn_notificar(v_r.profile_id, 'no_show', 'Inasistencia registrada',
    format('No se registrÃ³ tu asistencia a la reserva del %s a las %s:00. SegÃºn el Art. 4 del reglamento se penaliza con el 100%% del valor de la hora.', v_r.fecha, v_r.hora));
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- CHECK-IN / CHECK-OUT (Art. 9: 8 min de gracia, hora extra, reincidencia)
-- ============================================================
create or replace function fn_checkin(p_reserva uuid, p_dispositivo text default 'app')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_r reservations;
begin
  select * into v_r from reservations where id = p_reserva for update;
  if v_r.id is null then raise exception 'RESERVA_NO_EXISTE'; end if;
  if v_r.profile_id <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  if v_r.estado <> 'confirmada' then raise exception 'NO_CONFIRMADA: estado %', v_r.estado; end if;
  if now() < fn_bloque_ts(v_r.fecha, v_r.hora) - interval '15 minutes' then
    raise exception 'MUY_TEMPRANO: el check-in se habilita 15 minutos antes de tu hora';
  end if;
  if now() > fn_bloque_ts(v_r.fecha, v_r.hora) + interval '1 hour' then
    raise exception 'MUY_TARDE: el bloque ya terminÃ³';
  end if;
  insert into sessions (reservation_id, checkin_por, checkin_dispositivo)
  values (p_reserva, v_actor, p_dispositivo);
  update reservations set estado = 'en_curso' where id = p_reserva;
  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'check_in', v_actor, jsonb_build_object('dispositivo', p_dispositivo));
  return jsonb_build_object('ok', true, 'checkin', now());
end $$;

create or replace function fn_checkout(p_reserva uuid, p_dispositivo text default 'app')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_r reservations;
  v_s sessions;
  v_fin timestamptz;
  v_gracia int := coalesce((fn_config('gracia_minutos'))::text::int, 8);
  v_umbral int := coalesce((fn_config('umbral_reincidencias'))::text::int, 3);
  v_exceso_min int := 0;
  v_sig_ocupada boolean := false;
  v_extra_id uuid;
  v_precio numeric;
  v_reinc int;
  v_cobro text := null;
  v_otro uuid;
begin
  select * into v_r from reservations where id = p_reserva for update;
  if v_r.id is null then raise exception 'RESERVA_NO_EXISTE'; end if;
  if v_r.profile_id <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  select * into v_s from sessions where reservation_id = p_reserva for update;
  if v_s.id is null then raise exception 'SIN_CHECKIN'; end if;
  if v_s.checkout_at is not null then raise exception 'YA_CERRADA'; end if;

  v_fin := fn_bloque_ts(v_r.fecha, v_r.hora) + interval '1 hour';
  if now() > v_fin then
    v_exceso_min := ceil(extract(epoch from now() - v_fin) / 60);
  end if;

  -- Art. 9: superados los minutos de gracia se cobra una hora adicional,
  -- Ãºnicamente si la siguiente franja estÃ¡ libre.
  if v_exceso_min > v_gracia then
    select profile_id into v_otro from reservations
    where space_id = v_r.space_id and fecha = v_r.fecha and hora = v_r.hora + 1
      and estado in ('pendiente_pago', 'confirmada', 'en_curso')
      and profile_id <> v_r.profile_id
    limit 1;
    v_sig_ocupada := v_otro is not null;

    if v_sig_ocupada then
      -- Alerta urgente a ambos co-meds y al co-manager
      perform fn_notificar(v_r.profile_id, 'alerta_excedente',
        'âš  Excediste tu hora y la siguiente franja estÃ¡ reservada',
        'Debes desocupar el consultorio de inmediato: otro profesional tiene reservada la siguiente hora.');
      perform fn_notificar(v_otro, 'alerta_excedente',
        'âš  Posible demora en tu consultorio',
        'El profesional anterior excediÃ³ su hora. El administrador ya fue alertado.');
      perform fn_notificar(fn_comanager_id(), 'alerta_excedente',
        'âš  Conflicto de excedente',
        format('Un co-med excediÃ³ su bloque de %s:00 y la franja siguiente estÃ¡ reservada. Considera habilitar el consultorio satÃ©lite.', v_r.hora));
    else
      -- Cobro automÃ¡tico de una hora adicional
      select precio_hora into v_precio from plans where id = coalesce(v_r.plan_id, 'triaje');
      insert into reservations (profile_id, space_id, fecha, hora, estado, origen,
        package_id, plan_id, precio, es_hora_extra, creado_por)
      values (v_r.profile_id, v_r.space_id, v_r.fecha, v_r.hora + 1, 'completada', v_r.origen,
        v_r.package_id, v_r.plan_id, v_precio, true, v_actor)
      returning id into v_extra_id;

      if fn_saldo_monedero(v_r.profile_id) >= 1 then
        insert into wallet_ledger (profile_id, package_id, delta_horas, origen, reservation_id, descripcion, creado_por)
        values (v_r.profile_id,
          case when v_r.package_id is not null and fn_saldo_monedero(v_r.profile_id, v_r.package_id) >= 1
               then v_r.package_id else null end,
          -1, 'hora_extra', v_extra_id, 'Hora adicional por excedente (Art. 9)', v_actor);
        v_cobro := 'descontado_del_monedero';
      else
        insert into payments (profile_id, monto, metodo, estado)
        values (v_r.profile_id, v_precio, 'efectivo', 'pendiente');
        v_cobro := 'pago_pendiente';
      end if;

      insert into reservation_events (reservation_id, tipo, actor, datos)
      values (p_reserva, 'hora_extra', v_actor,
        jsonb_build_object('exceso_min', v_exceso_min, 'cobro', v_cobro, 'reserva_extra', v_extra_id));
      perform fn_notificar(v_r.profile_id, 'hora_extra',
        'Hora adicional cobrada (Art. 9)',
        format('Excediste tu hora reservada por %s minutos (mÃ¡s de %s de gracia). Se cobrÃ³ una hora adicional (%s).',
          v_exceso_min, v_gracia,
          case v_cobro when 'descontado_del_monedero' then 'descontada de tu paquete/monedero' else 'pago pendiente en ventanilla' end));
    end if;

    -- Reincidencia â†’ suspensiÃ³n automÃ¡tica de la prÃ³xima reserva
    update profiles set reincidencias_excedente = reincidencias_excedente + 1
      where id = v_r.profile_id
      returning reincidencias_excedente into v_reinc;
    if v_reinc >= v_umbral then
      update profiles set suspension_proxima_reserva = true where id = v_r.profile_id;
      insert into reservation_events (reservation_id, tipo, actor, datos)
      values (p_reserva, 'suspension', v_actor, jsonb_build_object('reincidencias', v_reinc));
      perform fn_notificar(v_r.profile_id, 'suspension',
        'Aviso de suspensiÃ³n (Art. 9)',
        'Por reincidencia en excedentes de tiempo, tu prÃ³xima reserva serÃ¡ suspendida automÃ¡ticamente segÃºn el Art. 9 del reglamento.');
    end if;
  end if;

  update sessions set checkout_at = now(), checkout_por = v_actor,
    checkout_dispositivo = p_dispositivo,
    minutos_excedente = greatest(v_exceso_min, 0),
    horas_extra_cobradas = case when v_extra_id is not null then 1 else 0 end,
    alerta_franja_ocupada = v_sig_ocupada
  where reservation_id = p_reserva;
  update reservations set estado = 'completada' where id = p_reserva;
  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'check_out', v_actor,
    jsonb_build_object('dispositivo', p_dispositivo, 'exceso_min', v_exceso_min));

  return jsonb_build_object('ok', true, 'exceso_min', v_exceso_min,
    'hora_extra', v_extra_id is not null, 'siguiente_ocupada', v_sig_ocupada, 'cobro', v_cobro);
end $$;

-- ============================================================
-- PAGOS
-- ============================================================
-- Crea el pago de una o varias reservas pendientes (monto calculado en servidor)
create or replace function fn_crear_pago(
  p_reservas uuid[], p_metodo metodo_pago
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_total numeric;
  v_profile uuid;
  v_pago uuid;
begin
  select sum(precio), min(profile_id) into v_total, v_profile
  from reservations where id = any(p_reservas) and estado = 'pendiente_pago' and pago_id is null;
  if v_total is null then raise exception 'SIN_RESERVAS_PENDIENTES'; end if;
  if v_profile <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  if p_metodo = 'efectivo' and not v_manager then
    raise exception 'EFECTIVO_SOLO_VENTANILLA: el pago en efectivo lo registra recepciÃ³n';
  end if;

  insert into payments (profile_id, monto, metodo, estado)
  values (v_profile, v_total, p_metodo, 'pendiente') returning id into v_pago;
  update reservations set pago_id = v_pago where id = any(p_reservas);

  return jsonb_build_object('pago', v_pago, 'monto', v_total);
end $$;

-- Compra de paquete (Estancia Plus / Ronda MÃ©dica VIP)
create or replace function fn_comprar_paquete(
  p_plan text, p_horas numeric, p_metodo metodo_pago, p_para uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_profile uuid := coalesce(p_para, v_actor);
  v_plan plans;
  v_pkg uuid; v_pago uuid;
  v_total numeric;
begin
  if v_profile <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  if not exists (select 1 from profiles where id = v_profile and estado = 'aprobado') then
    raise exception 'PERFIL_NO_APROBADO';
  end if;
  select * into v_plan from plans where id = p_plan and activo;
  if v_plan.id is null or v_plan.min_horas_semana is null then
    raise exception 'PLAN_INVALIDO: este plan no ofrece paquetes';
  end if;
  if p_horas < v_plan.min_horas_semana then
    raise exception 'HORAS_INSUFICIENTES: % requiere mÃ­nimo % horas', v_plan.nombre, v_plan.min_horas_semana;
  end if;
  if p_metodo = 'efectivo' and not v_manager then
    raise exception 'EFECTIVO_SOLO_VENTANILLA';
  end if;

  v_total := p_horas * v_plan.precio_hora;
  insert into packages (profile_id, plan_id, horas_total, precio_total)
  values (v_profile, p_plan, p_horas, v_total) returning id into v_pkg;
  insert into payments (profile_id, package_id, monto, metodo, estado)
  values (v_profile, v_pkg, v_total, p_metodo, 'pendiente') returning id into v_pago;

  return jsonb_build_object('paquete', v_pkg, 'pago', v_pago, 'monto', v_total);
end $$;

-- Confirmar / rechazar un pago (co-manager, o servidor para Payphone)
create or replace function fn_confirmar_pago(
  p_pago uuid, p_aprobar boolean, p_payphone_tx jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p payments;
  v_vigencia int := coalesce((fn_config('vigencia_paquete_dias'))::text::int, 30);
begin
  -- auth.uid() null = llamada de servidor (service role / webhook Payphone)
  if auth.uid() is not null and not es_comanager() then raise exception 'SOLO_COMANAGER'; end if;
  select * into v_p from payments where id = p_pago for update;
  if v_p.id is null then raise exception 'PAGO_NO_EXISTE'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'PAGO_YA_PROCESADO'; end if;

  if p_aprobar then
    update payments set estado = 'confirmado', confirmado_por = auth.uid(),
      confirmado_en = now(), payphone_tx = coalesce(p_payphone_tx, payphone_tx)
    where id = p_pago;

    if v_p.package_id is not null then
      update packages set estado = 'activo', inicio = fn_hoy_gye(),
        fin = fn_hoy_gye() + v_vigencia
      where id = v_p.package_id;
      insert into wallet_ledger (profile_id, package_id, delta_horas, origen, descripcion, vence_en, creado_por)
      select profile_id, id, horas_total, 'compra_paquete',
        format('Paquete %s (%s horas)', plan_id, horas_total), fin, auth.uid()
      from packages where id = v_p.package_id;
      perform fn_notificar(v_p.profile_id, 'paquete_activo', 'Â¡Paquete activado!',
        format('Tu paquete ya estÃ¡ activo. Tienes %s dÃ­as para usar tus horas (no acumulables).', v_vigencia));
    end if;

    update reservations set estado = 'confirmada' where pago_id = p_pago and estado = 'pendiente_pago';
    perform fn_notificar(v_p.profile_id, 'pago_confirmado', 'Pago confirmado',
      format('Tu pago de $%s fue confirmado. Recibo NÂ° %s disponible en la app.', v_p.monto, v_p.numero_recibo));
  else
    update payments set estado = 'rechazado', confirmado_por = auth.uid(), confirmado_en = now()
    where id = p_pago;
    update reservations set estado = 'cancelada' where pago_id = p_pago and estado = 'pendiente_pago';
    update packages set estado = 'expirado' where id = v_p.package_id and estado = 'pendiente_pago';
    perform fn_notificar(v_p.profile_id, 'pago_rechazado', 'Pago no confirmado',
      'Tu pago no pudo ser confirmado. Contacta al establecimiento por WhatsApp.');
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- RECOMPENSAS POR DERIVACIÃ“N (doble confirmaciÃ³n)
-- ============================================================
create or replace function fn_acreditar_recompensa(
  p_referral uuid, p_aprobar boolean, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ref referrals;
  v_horas numeric;
  v_estudio text;
  v_dias int := coalesce((fn_config('vigencia_recompensas_dias'))::text::int, 90);
begin
  if not es_comanager() then raise exception 'SOLO_COMANAGER'; end if;
  select * into v_ref from referrals where id = p_referral for update;
  if v_ref.id is null then raise exception 'DERIVACION_NO_EXISTE'; end if;
  if v_ref.estado <> 'solicitada' then raise exception 'YA_PROCESADA'; end if;
  select horas, estudio into v_horas, v_estudio from reward_catalog where id = v_ref.reward_id;

  if p_aprobar then
    update referrals set estado = 'acreditada', acreditada_por = auth.uid(),
      acreditada_en = now(), nota = coalesce(p_nota, nota)
    where id = p_referral;
    insert into wallet_ledger (profile_id, delta_horas, origen, referral_id, descripcion, vence_en, creado_por)
    values (v_ref.profile_id, v_horas, 'recompensa', p_referral,
      format('Recompensa por derivaciÃ³n: %s', v_estudio), fn_hoy_gye() + v_dias, auth.uid());
    perform fn_notificar(v_ref.profile_id, 'recompensa', 'ðŸŽ‰ Horas acreditadas',
      format('Se acreditaron %s hora(s) gratis a tu monedero por tu derivaciÃ³n de %s. Vigencia: %s dÃ­as.', v_horas, v_estudio, v_dias));
  else
    update referrals set estado = 'rechazada', acreditada_por = auth.uid(),
      acreditada_en = now(), nota = coalesce(p_nota, nota)
    where id = p_referral;
    perform fn_notificar(v_ref.profile_id, 'recompensa', 'DerivaciÃ³n no acreditada',
      coalesce(p_nota, 'Tu derivaciÃ³n no pudo ser confirmada. Consulta en recepciÃ³n.'));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- APROBACIÃ“N DE CO-MEDS
-- ============================================================
create or replace function fn_aprobar_comed(
  p_profile uuid, p_aprobar boolean, p_comentario text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not es_comanager() then raise exception 'SOLO_COMANAGER'; end if;
  update profiles set estado = case when p_aprobar then 'aprobado'::estado_perfil else 'pendiente'::estado_perfil end
  where id = p_profile;
  update accreditations set
    estado = case when p_aprobar then 'aprobada'::estado_acreditacion else 'rechazada'::estado_acreditacion end,
    revisado_por = auth.uid(), revisado_en = now(), comentario = coalesce(p_comentario, comentario)
  where profile_id = p_profile and estado = 'pendiente';
  if p_aprobar then
    perform fn_notificar(p_profile, 'aprobacion', 'âœ… Cuenta aprobada',
      'Tu acreditaciÃ³n fue verificada. Ya puedes reservar tu espacio en VitalCowork.');
  else
    perform fn_notificar(p_profile, 'aprobacion', 'AcreditaciÃ³n observada',
      coalesce(p_comentario, 'Tu acreditaciÃ³n necesita correcciones. Revisa tu perfil.'));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- EXPIRACIONES (la llama el cron diario con service role)
-- ============================================================
create or replace function fn_expirar_vigencias() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pkg record;
  v_saldo numeric;
  v_n int := 0;
  v_perfil record;
  v_expirable numeric;
begin
  if auth.uid() is not null and not es_comanager() then raise exception 'SOLO_SERVIDOR'; end if;

  -- Paquetes vencidos: el saldo no usado expira (no acumulable)
  for v_pkg in select * from packages where estado in ('activo', 'agotado') and fin < fn_hoy_gye() loop
    v_saldo := fn_saldo_monedero(v_pkg.profile_id, v_pkg.id);
    if v_saldo > 0 then
      insert into wallet_ledger (profile_id, package_id, delta_horas, origen, descripcion)
      values (v_pkg.profile_id, v_pkg.id, -v_saldo, 'expiracion',
        format('ExpiraciÃ³n de paquete: %s hora(s) no usadas', v_saldo));
      perform fn_notificar(v_pkg.profile_id, 'expiracion', 'Paquete vencido',
        format('Tu paquete venciÃ³ el %s. %s hora(s) sin usar expiraron (los paquetes no son acumulables).', v_pkg.fin, v_saldo));
    end if;
    update packages set estado = 'expirado' where id = v_pkg.id;
    v_n := v_n + 1;
  end loop;

  -- Horas de recompensa vencidas (monedero general, aproximaciÃ³n FIFO)
  for v_perfil in
    select profile_id,
      sum(delta_horas) filter (where package_id is null) as saldo_general,
      sum(delta_horas) filter (where package_id is null and delta_horas > 0 and vence_en < fn_hoy_gye()) as creditos_vencidos,
      abs(coalesce(sum(delta_horas) filter (where package_id is null and origen = 'expiracion'), 0)) as ya_expirado
    from wallet_ledger group by profile_id
  loop
    v_expirable := least(coalesce(v_perfil.saldo_general, 0),
      coalesce(v_perfil.creditos_vencidos, 0) - v_perfil.ya_expirado);
    if v_expirable > 0 then
      insert into wallet_ledger (profile_id, delta_horas, origen, descripcion)
      values (v_perfil.profile_id, -v_expirable, 'expiracion',
        format('ExpiraciÃ³n de horas de recompensa/crÃ©dito (%s h)', v_expirable));
      perform fn_notificar(v_perfil.profile_id, 'expiracion', 'Horas vencidas',
        format('%s hora(s) de tu monedero vencieron por vigencia.', v_expirable));
    end if;
  end loop;

  -- Reservas Payphone abandonadas (libera el bloque tras N minutos sin pago)
  update reservations r set estado = 'cancelada'
  from payments p
  where r.pago_id = p.id and r.estado = 'pendiente_pago' and p.estado = 'pendiente'
    and p.metodo = 'payphone'
    and p.creado_en < now() - make_interval(mins => coalesce((fn_config('retencion_payphone_minutos'))::text::int, 30));
  -- Reservas pendientes sin ningÃºn pago iniciado
  update reservations set estado = 'cancelada'
  where estado = 'pendiente_pago' and pago_id is null
    and creado_en < now() - interval '60 minutes';

  return jsonb_build_object('paquetes_procesados', v_n);
end $$;

-- Resumen del monedero para el tensiÃ³metro
create or replace function fn_resumen_monedero(p_profile uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profile uuid := coalesce(p_profile, auth.uid());
  v_pkg record;
  v_general numeric;
  v_total numeric;
begin
  if v_profile <> auth.uid() and not es_comanager() then raise exception 'SIN_PERMISO'; end if;
  select * into v_pkg from packages
  where profile_id = v_profile and estado = 'activo' and fin >= fn_hoy_gye()
  order by fin asc limit 1;
  v_general := coalesce((select sum(delta_horas) from wallet_ledger
    where profile_id = v_profile and package_id is null), 0);
  v_total := fn_saldo_monedero(v_profile);
  return jsonb_build_object(
    'saldo_total', v_total,
    'saldo_general', v_general,
    'paquete', case when v_pkg.id is null then null else jsonb_build_object(
      'id', v_pkg.id, 'plan', v_pkg.plan_id, 'horas_total', v_pkg.horas_total,
      'saldo', fn_saldo_monedero(v_profile, v_pkg.id),
      'inicio', v_pkg.inicio, 'fin', v_pkg.fin,
      'dias_restantes', greatest(v_pkg.fin - fn_hoy_gye(), 0)
    ) end
  );
end $$;


-- ############ migrations\0004_proteccion_pagos.sql ############

-- Defensa en profundidad: un co-med puede cambiar el mÃ©todo de pago o adjuntar
-- su comprobante, pero JAMÃS alterar monto, estado o a quÃ© corresponde el pago.
create or replace function fn_proteger_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not es_comanager() then
    new.monto := old.monto;
    new.estado := old.estado;
    new.package_id := old.package_id;
    new.profile_id := old.profile_id;
    new.numero_recibo := old.numero_recibo;
    new.confirmado_por := old.confirmado_por;
    new.confirmado_en := old.confirmado_en;
    new.payphone_tx := old.payphone_tx;
  end if;
  return new;
end $$;

create trigger tg_proteger_pago before update on payments
  for each row execute function fn_proteger_pago();


-- ############ seed.sql ############

-- ============================================================
-- VitalCowork â€” Datos semilla
-- Cuentas demo (solo entorno local/desarrollo):
--   Co-manager: admin@vitalcowork.ec   / demo123456
--   Co-meds:    dra.paredes@demo.ec, dr.molina@demo.ec, lic.andrade@demo.ec / demo123456
-- ============================================================

-- ---------- Especialidades permitidas (sin cirugÃ­a mayor) ----------
insert into specialties (nombre) values
  ('Medicina General'), ('Medicina Interna'), ('CardiologÃ­a'),
  ('PsicologÃ­a'), ('NutriciÃ³n'), ('EndocrinologÃ­a'), ('GeriatrÃ­a'),
  ('DermatologÃ­a clÃ­nica'), ('PediatrÃ­a'), ('GinecologÃ­a (consulta)'),
  ('NeumologÃ­a'), ('ReumatologÃ­a'), ('PsiquiatrÃ­a'), ('Fisioterapia');

-- ---------- Espacios ----------
insert into spaces (id, nombre, descripcion, es_principal, reservable_publico) values
  ('11111111-1111-1111-1111-111111111111', 'Consultorio principal',
   'Consultorio grande, completamente amoblado para consulta ambulatoria.', true, true),
  ('22222222-2222-2222-2222-222222222222', 'Consultorio satÃ©lite',
   'Consultorio pequeÃ±o de apoyo (ECG y ecocardiogramas). Se habilita en alta demanda.', false, false);

-- ---------- Planes (valores iniciales, editables por el co-manager) ----------
insert into plans (id, nivel, nombre, precio_hora, min_horas_semana, min_horas_mes,
  reagendamientos_por_reserva, color, badge, copy_comercial, orden) values
  ('triaje', 'BÃ¡sico', 'Plan Triaje', 15.00, null, null, 1, '#0e7490', null,
   'El dinamismo del primer contacto: acceso rÃ¡pido, eficiente y de evaluaciÃ³n. Reserva tu hora para hoy, esta semana o el mes en curso.', 1),
  ('estancia', 'Silver', 'Plan Estancia Plus', 12.00, 5, 15, null, '#64748b', 'MÃ¡s popular',
   'Comodidad y permanencia: un espacio bien equipado y confortable, perfecto para jornadas medianas o de mediano plazo. Incluye reagendamientos ilimitados.', 2),
  ('vip', 'Gold', 'Plan Ronda MÃ©dica VIP', 10.00, 10, 30, null, '#b45309', 'MÃ¡ximo ahorro',
   'MÃ¡xima jerarquÃ­a, autoridad y exclusividad: prioridad, acceso total a las mejores instalaciones y mayores beneficios â€” como el especialista lÃ­der durante su pase de visita. Reagendamientos ilimitados.', 3);

-- ---------- ConfiguraciÃ³n (todo editable desde el panel) ----------
insert into settings (clave, valor, descripcion) values
  ('horario', '{"jornadas": [[9,12],[13,18]]}', 'Jornadas de atenciÃ³n (hora inicio/fin). El hueco entre jornadas es el receso de almuerzo.'),
  ('gracia_minutos', '8', 'Minutos de gracia al exceder la hora reservada (Art. 9)'),
  ('umbral_reincidencias', '3', 'Excedentes acumulados que activan la suspensiÃ³n automÃ¡tica de la prÃ³xima reserva'),
  ('reagenda_anticipacion_horas', '4', 'AnticipaciÃ³n mÃ­nima (horas) para poder reagendar una reserva'),
  ('penalizacion_dentro_24h', '0.5', 'FracciÃ³n penalizada al cancelar dentro de las 24h (Art. 4)'),
  ('penalizacion_no_show', '1', 'FracciÃ³n penalizada por no presentarse sin aviso (Art. 4)'),
  ('vigencia_paquete_dias', '30', 'DÃ­as calendario de vigencia de los paquetes'),
  ('vigencia_recompensas_dias', '90', 'DÃ­as de vigencia de las horas de recompensa por derivaciÃ³n'),
  ('vigencia_credito_dias', '30', 'DÃ­as de vigencia de crÃ©ditos por cancelaciÃ³n de hora individual'),
  ('retencion_payphone_minutos', '30', 'Minutos que se retiene un bloque con pago Payphone sin completar'),
  ('recordatorio_transferencia_horas', '12', 'Horas sin confirmar una transferencia antes de recordar al co-manager'),
  ('whatsapp_numero', '"593983936496"', 'NÃºmero de WhatsApp del establecimiento (formato internacional, sin +)'),
  ('bancos', '[
    {"banco": "Banco Guayaquil", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"},
    {"banco": "Banco Pichincha", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"},
    {"banco": "Produbanco", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"},
    {"banco": "Banco del PacÃ­fico", "tipo": "Ahorros", "numero": "0000000000", "titular": "VitalCowork", "cedula_ruc": "0900000000"}
  ]', 'Cuentas bancarias para transferencias (editar con datos reales)');

-- ---------- CatÃ¡logo de recompensas por derivaciÃ³n ----------
insert into reward_catalog (estudio, horas, orden) values
  ('Electrocardiograma', 1, 1),
  ('Ecocardiograma', 2, 2),
  ('Prueba de esfuerzo', 3, 3),
  ('Holter de ritmo', 2, 4),
  ('MAPA (presiÃ³n arterial 24h)', 2, 5),
  ('Asesoramiento nutricional con especialista', 2, 6);

-- ---------- Feriados nacionales de Ecuador (con traslados segÃºn ley) ----------
insert into holidays_blocks (fecha, tipo, motivo) values
  -- 2026
  ('2026-01-01', 'feriado', 'AÃ±o Nuevo'),
  ('2026-02-16', 'feriado', 'Carnaval'),
  ('2026-02-17', 'feriado', 'Carnaval'),
  ('2026-04-03', 'feriado', 'Viernes Santo'),
  ('2026-05-01', 'feriado', 'DÃ­a del Trabajo'),
  ('2026-05-25', 'feriado', 'Batalla de Pichincha (trasladado del dom. 24)'),
  ('2026-08-10', 'feriado', 'Primer Grito de Independencia'),
  ('2026-10-09', 'feriado', 'Independencia de Guayaquil'),
  ('2026-11-02', 'feriado', 'DÃ­a de los Difuntos'),
  ('2026-11-03', 'feriado', 'Independencia de Cuenca'),
  ('2026-12-25', 'feriado', 'Navidad'),
  -- 2027
  ('2027-01-01', 'feriado', 'AÃ±o Nuevo'),
  ('2027-02-08', 'feriado', 'Carnaval'),
  ('2027-02-09', 'feriado', 'Carnaval'),
  ('2027-03-26', 'feriado', 'Viernes Santo'),
  ('2027-04-30', 'feriado', 'DÃ­a del Trabajo (trasladado del sÃ¡b. 1 de mayo)'),
  ('2027-05-24', 'feriado', 'Batalla de Pichincha'),
  ('2027-08-09', 'feriado', 'Primer Grito de Independencia (trasladado del mar. 10)'),
  ('2027-10-08', 'feriado', 'Independencia de Guayaquil (trasladado del sÃ¡b. 9)'),
  ('2027-11-01', 'feriado', 'DÃ­a de los Difuntos (trasladado del mar. 2)'),
  ('2027-11-05', 'feriado', 'Independencia de Cuenca (trasladado del miÃ©. 3)');

-- ---------- TÃ©rminos y condiciones v1.0 (Reglamento Ã­ntegro) ----------
insert into tnc_versions (version, contenido_md, publicado) values ('1.0', $tnc$
# TÃ©rminos y Condiciones de Uso â€” VitalCowork

Al registrarte en VitalCowork declaras y aceptas:

1. **AcreditaciÃ³n profesional.** Eres un profesional de la salud legalmente habilitado en Ecuador (registro ACESS/Senescyt o equivalente) y la documentaciÃ³n que cargas es autÃ©ntica. Tu cuenta se activa solo tras la verificaciÃ³n del administrador.
2. **Alcance del servicio.** VitalCowork alquila espacios para **consulta mÃ©dica ambulatoria**. EstÃ¡n excluidos los procedimientos quirÃºrgicos mayores o complejos; solo se permiten procedimientos menores (p. ej., extracciÃ³n de puntos, limpieza quirÃºrgica menor).
3. **Responsabilidad profesional.** Cada co-med es el Ãºnico y exclusivo responsable de la atenciÃ³n, diagnÃ³stico y tratamiento de sus pacientes. VitalCowork provee la infraestructura fÃ­sica y no participa en la relaciÃ³n mÃ©dicoâ€“paciente.
4. **ProtecciÃ³n de datos.** Tus datos personales se tratan conforme a la Ley OrgÃ¡nica de ProtecciÃ³n de Datos Personales (LOPDP) del Ecuador, con fines de gestiÃ³n de reservas, pagos y seguridad. En el registro se solicita nombre y nÃºmero de cÃ©dula para fines de seguridad y confidencialidad. Tus datos personales nunca se muestran a otros co-meds: en el calendario solo aparece tu alias y tu especialidad.

---

# REGLAMENTO INTERNO DEL COWORKING MÃ‰DICO â€” VITALCOWORK
*Fecha de emisiÃ³n: 16 de julio de 2026*

## CAPÃTULO I: DISPOSICIONES GENERALES

**Art. 1. Objeto**: establecer las normas y procedimientos que rigen el funcionamiento de VitalCowork, promoviendo un ambiente profesional, Ã©tico y colaborativo para todos los profesionales de la salud que integran la comunidad.

**Art. 2. Ãmbito de aplicaciÃ³n**: cumplimiento obligatorio para todos los mÃ©dicos, profesionales de la salud, personal administrativo y visitantes que utilicen las instalaciones.

## CAPÃTULO II: USO DE LAS INSTALACIONES

**Art. 3. Horarios de atenciÃ³n**: instalaciones disponibles de lunes a viernes, de 09:00 a 12:00 y de 13:00 a 18:00, salvo excepciones autorizadas.

**Art. 4. Reservaciones**: las Ã¡reas y consultorios se reservan mediante el sistema establecido. Cancelaciones con al menos 24 horas de anticipaciÃ³n no tienen costo; cancelar dentro de las 24 horas se penaliza con el 50% del valor de esa hora; no notificar cancelaciÃ³n se penaliza con el total de la hora reservada.

**Art. 5. Mantenimiento y limpieza**: el consultorio se entrega limpio y con lencerÃ­a limpia (batas o mediasÃ¡banas). Cada co-med es responsable de mantener en orden su espacio y cumplir las disposiciones de higiene y bioseguridad vigentes, desechando la basura segÃºn sea material comÃºn o infeccioso.

## CAPÃTULO III: CONDUCTA Y Ã‰TICA

**Art. 6. Comportamiento profesional**: conducta respetuosa, Ã©tica y profesional con colegas, pacientes y visitantes.

**Art. 7. Confidencialidad**: obligaciÃ³n de garantizar la confidencialidad de la informaciÃ³n de los pacientes y cumplir las normativas de protecciÃ³n de datos; prohibido tomar fotos o videos del lugar o de pacientes sin consentimiento.

**Art. 8. Uso de equipos y materiales**: uso responsable y conforme a las instrucciones de uso y seguridad; los daÃ±os acarrean sanciones o correcciones.

## CAPÃTULO IV: RESPONSABILIDADES Y SANCIONES

**Art. 9. Tiempo reservado**: el co-med debe respetar el horario reservado; al excederlo dispone de 8 minutos de gracia, tras lo cual se cobra una hora adicional (abonada o descontada de su paquete), siempre que la siguiente franja no estÃ© reservada por otro mÃ©dico. El incumplimiento puede acarrear la suspensiÃ³n automÃ¡tica de una prÃ³xima reserva.

**Art. 10. Responsabilidades del usuario**: cada co-med responde por el cumplimiento de este reglamento y el correcto uso de instalaciones y recursos.

**Art. 11. Sanciones**: el incumplimiento podrÃ¡ resultar en sanciones desde advertencias hasta suspensiÃ³n o cancelaciÃ³n del acceso, segÃºn la gravedad.

## CAPÃTULO V: DISPOSICIONES FINALES

**Art. 12. ModificaciÃ³n**: el reglamento puede ser modificado por la direcciÃ³n de VitalCowork, comunicÃ¡ndose oportunamente a los usuarios. La app notificarÃ¡ y pedirÃ¡ re-aceptaciÃ³n cuando cambie la versiÃ³n.

**Art. 13. AceptaciÃ³n**: el ingreso y permanencia en las instalaciones implica la aceptaciÃ³n total de estas disposiciones.
$tnc$, true);

-- ============================================================
-- Cuentas demo (SOLO desarrollo local â€” no ejecutar en producciÃ³n)
-- ============================================================
do $$
declare
  v_ids uuid[] := array[
    'a0000000-0000-0000-0000-000000000001', -- co-manager
    'a0000000-0000-0000-0000-000000000002', -- Dra. Paredes (NutriciÃ³n)
    'a0000000-0000-0000-0000-000000000003', -- Dr. Molina (Medicina Interna)
    'a0000000-0000-0000-0000-000000000004'  -- Lic. Andrade (PsicologÃ­a)
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
   '0900000001', 'DirecciÃ³n', (select id from specialties where nombre = 'CardiologÃ­a'),
   '0983936496', 'admin@vitalcowork.ec'),
  ('a0000000-0000-0000-0000-000000000002', 'comed', 'aprobado', 'Dra. Josefina Paredes',
   '0900000002', 'J.P.', (select id from specialties where nombre = 'NutriciÃ³n'),
   '0990000002', 'dra.paredes@demo.ec'),
  ('a0000000-0000-0000-0000-000000000003', 'comed', 'aprobado', 'Dr. Marco Molina',
   '0900000003', 'M.M.', (select id from specialties where nombre = 'Medicina Interna'),
   '0990000003', 'dr.molina@demo.ec'),
  ('a0000000-0000-0000-0000-000000000004', 'comed', 'pendiente', 'Lic. Carla Andrade',
   '0900000004', 'C.A.', (select id from specialties where nombre = 'PsicologÃ­a'),
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

-- Recompensa acreditada de ejemplo (Dr. Molina derivÃ³ un ecocardiograma)
insert into referrals (id, profile_id, reward_id, paciente_iniciales, estado, acreditada_por, acreditada_en) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003',
   (select id from reward_catalog where estudio = 'Ecocardiograma'), 'N.N.',
   'acreditada', 'a0000000-0000-0000-0000-000000000001', now() - interval '2 days');
insert into wallet_ledger (profile_id, delta_horas, origen, referral_id, descripcion, vence_en) values
  ('a0000000-0000-0000-0000-000000000003', 2, 'recompensa', 'c0000000-0000-0000-0000-000000000001',
   'Recompensa por derivaciÃ³n: Ecocardiograma', current_date + 90);

-- ---------- Reservas de ejemplo (prÃ³xima semana laboral) ----------
do $$
declare
  v_lunes date := (date_trunc('week', current_date))::date + 7; -- lunes prÃ³ximo
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

