-- ============================================================
-- VitalCowork — Funciones transaccionales de negocio
-- Toda la lógica crítica vive en el backend (SECURITY DEFINER):
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

-- Horas de inicio reservables según la configuración de jornadas
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

-- ¿El bloque es válido para reservar? (día hábil, jornada, sin feriado/bloqueo,
-- espacio activo y habilitado)
create or replace function fn_bloque_valido(
  p_fecha date, p_hora smallint, p_space uuid, p_es_manager boolean
) returns text -- null = válido; texto = motivo de rechazo
language plpgsql stable security definer set search_path = public as $$
declare
  v_space spaces;
begin
  if extract(isodow from p_fecha) > 5 then
    return 'Solo se reserva de lunes a viernes';
  end if;
  if not (p_hora = any (fn_horas_reservables())) then
    return 'Hora fuera del horario de atención';
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
    return 'Este espacio solo está habilitado por el administrador';
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
-- Tabla espejo pública del calendario (sin datos personales) para
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
  values (new.id, new.space_id, new.fecha, new.hora, new.estado, coalesce(v_alias, '—'), v_esp, new.es_hora_extra)
  on conflict (reservation_id) do update set
    space_id = excluded.space_id, fecha = excluded.fecha, hora = excluded.hora,
    estado = excluded.estado, alias = excluded.alias,
    especialidad = excluded.especialidad, es_hora_extra = excluded.es_hora_extra;
  return new;
end $$;
create trigger tg_sync_slot after insert or update or delete on reservations
  for each row execute function fn_sync_slot();

-- ============================================================
-- RESERVAR BLOQUES (multi-selección, transaccional, anti-colisión)
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

  -- Art. 9: suspensión automática de la próxima reserva por reincidencia
  if v_perfil.suspension_proxima_reserva and not v_manager then
    update profiles set suspension_proxima_reserva = false, reincidencias_excedente = 0
      where id = v_profile;
    perform fn_notificar(v_profile, 'suspension',
      'Reserva suspendida (Art. 9)',
      'Por exceder repetidamente tu tiempo reservado, esta reserva fue suspendida automáticamente según el Art. 9 del reglamento. Ya puedes volver a reservar.');
    perform fn_notificar(fn_comanager_id(), 'suspension',
      'Suspensión aplicada', format('Se aplicó la suspensión automática de reserva a %s.', v_perfil.nombre_completo));
    raise exception 'SUSPENSION_ART9: por reincidencia en excedentes, esta reserva queda suspendida (Art. 9 del reglamento). Tu próxima reserva ya estará habilitada.';
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
      raise exception 'BLOQUE_PASADO: % %:00 ya pasó', v_fecha, v_hora;
    end if;
    v_err := fn_bloque_valido(v_fecha, v_hora, p_space, v_manager);
    if v_err is not null then
      raise exception 'BLOQUE_INVALIDO: % (% %:00)', v_err, v_fecha, v_hora;
    end if;
    -- Plan Triaje: reservable solo dentro del mes en curso
    if v_pkg.id is null and v_fecha > v_fin_mes then
      raise exception 'FUERA_DE_MES: con hora individual (Plan Triaje) solo puedes reservar dentro del mes en curso';
    end if;
    -- Paquete: solo dentro de su vigencia de 30 días
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
-- REAGENDAR (política flexible por plan; Art. dedicado del brief)
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
    raise exception 'NO_REAGENDABLE: la reserva está en estado %', v_r.estado;
  end if;

  select * into v_plan from plans where id = v_r.plan_id;
  if v_r.package_id is not null then
    select * into v_pkg from packages where id = v_r.package_id;
  end if;

  if not v_manager then
    -- Anticipación mínima (configurable, inicial 4h)
    if fn_bloque_ts(v_r.fecha, v_r.hora) - now() < make_interval(hours => v_ant_horas::int) then
      raise exception 'FUERA_DE_TIEMPO: solo puedes reagendar con al menos % horas de anticipación', v_ant_horas;
    end if;
    -- Límite por plan (null = ilimitado, beneficio Estancia Plus / Ronda Médica VIP)
    if v_plan.reagendamientos_por_reserva is not null
       and v_r.reagendamientos >= v_plan.reagendamientos_por_reserva then
      raise exception 'LIMITE_REAGENDA: tu plan permite % reagendamiento(s) por reserva. Mejora a Estancia Plus o Ronda Médica VIP para reagendar sin límite.', v_plan.reagendamientos_por_reserva;
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
    raise exception 'BLOQUE_PASADO: ese bloque ya pasó';
  end if;
  v_err := fn_bloque_valido(p_fecha, p_hora, v_r.space_id, v_manager);
  if v_err is not null then raise exception 'BLOQUE_INVALIDO: %', v_err; end if;

  v_old := jsonb_build_object('fecha', v_r.fecha, 'hora', v_r.hora);
  begin
    update reservations set fecha = p_fecha, hora = p_hora,
      reagendamientos = reagendamientos + case when v_actor = v_r.profile_id then 1 else 0 end
    where id = p_reserva;
  exception when unique_violation then
    -- El sistema jamás pisa turnos de otros co-meds: solo bloques libres
    raise exception 'BLOQUE_OCUPADO: ese bloque ya está reservado, elige otro';
  end;

  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'reagendada', v_actor,
    v_old || jsonb_build_object('nueva_fecha', p_fecha, 'nueva_hora', p_hora, 'motivo', p_motivo));

  if v_actor = v_r.profile_id then
    perform fn_notificar(fn_comanager_id(), 'reagendada', 'Reserva reagendada',
      format('Una reserva del %s %s:00 se movió al %s %s:00.', v_r.fecha, v_r.hora, p_fecha, p_hora),
      jsonb_build_object('reserva', p_reserva));
  else
    perform fn_notificar(v_r.profile_id, 'reagendada', 'Tu reserva fue reagendada',
      format('El administrador movió tu reserva del %s %s:00 al %s %s:00.%s',
        v_r.fecha, v_r.hora, p_fecha, p_hora,
        coalesce(' Motivo: ' || p_motivo, '')),
      jsonb_build_object('reserva', p_reserva));
  end if;

  return jsonb_build_object('ok', true, 'fecha', p_fecha, 'hora', p_hora);
end $$;

-- ============================================================
-- CANCELAR (Art. 4: ≥24h sin costo; <24h 50%; no-show 100%)
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
    raise exception 'NO_CANCELABLE: la reserva está en estado %', v_r.estado;
  end if;

  v_pagada := v_r.estado = 'confirmada';

  if v_manager and v_r.profile_id <> v_actor then
    -- Cancelación del establecimiento: por defecto sin penalización (reembolso total)
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
        format('Devolución por cancelación (%s%% penalización)', (v_pct * 100)::int), v_vence, v_actor);
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
      case when v_pct > 0 then format(' Se aplicó una penalización del %s%% (Art. 4 del reglamento).', (v_pct*100)::int)
           when v_pagada then ' Se devolvió el 100%% a tu monedero de horas.' else '' end),
    jsonb_build_object('reserva', p_reserva));
  if v_actor = v_r.profile_id then
    perform fn_notificar(fn_comanager_id(), 'cancelada', 'Cancelación de reserva',
      format('Se canceló una reserva del %s %s:00.', v_r.fecha, v_r.hora));
  end if;

  return jsonb_build_object('ok', true, 'penalizacion_pct', v_pct, 'devolucion_horas', v_devolucion);
end $$;

-- ============================================================
-- NO-SHOW (Art. 4: penalización del 100%)
-- ============================================================
create or replace function fn_marcar_no_show(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_r reservations;
begin
  if not es_comanager() and auth.uid() is not null then raise exception 'SOLO_COMANAGER'; end if;
  select * into v_r from reservations where id = p_reserva for update;
  if v_r.estado <> 'confirmada' then raise exception 'ESTADO_INVALIDO'; end if;
  update reservations set estado = 'no_show' where id = p_reserva;
  -- 100% de penalización: no se devuelve nada (la hora ya se descontó/pagó)
  insert into reservation_events (reservation_id, tipo, actor, datos)
  values (p_reserva, 'no_show', auth.uid(), jsonb_build_object('penalizacion_pct', 1));
  perform fn_notificar(v_r.profile_id, 'no_show', 'Inasistencia registrada',
    format('No se registró tu asistencia a la reserva del %s a las %s:00. Según el Art. 4 del reglamento se penaliza con el 100%% del valor de la hora.', v_r.fecha, v_r.hora));
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
    raise exception 'MUY_TARDE: el bloque ya terminó';
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
  -- únicamente si la siguiente franja está libre.
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
        '⚠ Excediste tu hora y la siguiente franja está reservada',
        'Debes desocupar el consultorio de inmediato: otro profesional tiene reservada la siguiente hora.');
      perform fn_notificar(v_otro, 'alerta_excedente',
        '⚠ Posible demora en tu consultorio',
        'El profesional anterior excedió su hora. El administrador ya fue alertado.');
      perform fn_notificar(fn_comanager_id(), 'alerta_excedente',
        '⚠ Conflicto de excedente',
        format('Un co-med excedió su bloque de %s:00 y la franja siguiente está reservada. Considera habilitar el consultorio satélite.', v_r.hora));
    else
      -- Cobro automático de una hora adicional
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
        format('Excediste tu hora reservada por %s minutos (más de %s de gracia). Se cobró una hora adicional (%s).',
          v_exceso_min, v_gracia,
          case v_cobro when 'descontado_del_monedero' then 'descontada de tu paquete/monedero' else 'pago pendiente en ventanilla' end));
    end if;

    -- Reincidencia → suspensión automática de la próxima reserva
    update profiles set reincidencias_excedente = reincidencias_excedente + 1
      where id = v_r.profile_id
      returning reincidencias_excedente into v_reinc;
    if v_reinc >= v_umbral then
      update profiles set suspension_proxima_reserva = true where id = v_r.profile_id;
      insert into reservation_events (reservation_id, tipo, actor, datos)
      values (p_reserva, 'suspension', v_actor, jsonb_build_object('reincidencias', v_reinc));
      perform fn_notificar(v_r.profile_id, 'suspension',
        'Aviso de suspensión (Art. 9)',
        'Por reincidencia en excedentes de tiempo, tu próxima reserva será suspendida automáticamente según el Art. 9 del reglamento.');
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
    raise exception 'EFECTIVO_SOLO_VENTANILLA: el pago en efectivo lo registra recepción';
  end if;

  insert into payments (profile_id, monto, metodo, estado)
  values (v_profile, v_total, p_metodo, 'pendiente') returning id into v_pago;
  update reservations set pago_id = v_pago where id = any(p_reservas);

  return jsonb_build_object('pago', v_pago, 'monto', v_total);
end $$;

-- Compra de paquete (Estancia Plus / Ronda Médica VIP)
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
    raise exception 'HORAS_INSUFICIENTES: % requiere mínimo % horas', v_plan.nombre, v_plan.min_horas_semana;
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
      perform fn_notificar(v_p.profile_id, 'paquete_activo', '¡Paquete activado!',
        format('Tu paquete ya está activo. Tienes %s días para usar tus horas (no acumulables).', v_vigencia));
    end if;

    update reservations set estado = 'confirmada' where pago_id = p_pago and estado = 'pendiente_pago';
    perform fn_notificar(v_p.profile_id, 'pago_confirmado', 'Pago confirmado',
      format('Tu pago de $%s fue confirmado. Recibo N° %s disponible en la app.', v_p.monto, v_p.numero_recibo));
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
-- RECOMPENSAS POR DERIVACIÓN (doble confirmación)
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
      format('Recompensa por derivación: %s', v_estudio), fn_hoy_gye() + v_dias, auth.uid());
    perform fn_notificar(v_ref.profile_id, 'recompensa', '🎉 Horas acreditadas',
      format('Se acreditaron %s hora(s) gratis a tu monedero por tu derivación de %s. Vigencia: %s días.', v_horas, v_estudio, v_dias));
  else
    update referrals set estado = 'rechazada', acreditada_por = auth.uid(),
      acreditada_en = now(), nota = coalesce(p_nota, nota)
    where id = p_referral;
    perform fn_notificar(v_ref.profile_id, 'recompensa', 'Derivación no acreditada',
      coalesce(p_nota, 'Tu derivación no pudo ser confirmada. Consulta en recepción.'));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- APROBACIÓN DE CO-MEDS
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
    perform fn_notificar(p_profile, 'aprobacion', '✅ Cuenta aprobada',
      'Tu acreditación fue verificada. Ya puedes reservar tu espacio en VitalCowork.');
  else
    perform fn_notificar(p_profile, 'aprobacion', 'Acreditación observada',
      coalesce(p_comentario, 'Tu acreditación necesita correcciones. Revisa tu perfil.'));
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
        format('Expiración de paquete: %s hora(s) no usadas', v_saldo));
      perform fn_notificar(v_pkg.profile_id, 'expiracion', 'Paquete vencido',
        format('Tu paquete venció el %s. %s hora(s) sin usar expiraron (los paquetes no son acumulables).', v_pkg.fin, v_saldo));
    end if;
    update packages set estado = 'expirado' where id = v_pkg.id;
    v_n := v_n + 1;
  end loop;

  -- Horas de recompensa vencidas (monedero general, aproximación FIFO)
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
        format('Expiración de horas de recompensa/crédito (%s h)', v_expirable));
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
  -- Reservas pendientes sin ningún pago iniciado
  update reservations set estado = 'cancelada'
  where estado = 'pendiente_pago' and pago_id is null
    and creado_en < now() - interval '60 minutes';

  return jsonb_build_object('paquetes_procesados', v_n);
end $$;

-- Resumen del monedero para el tensiómetro
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
