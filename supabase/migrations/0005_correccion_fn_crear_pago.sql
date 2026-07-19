-- Corrección: min(uuid) no existe en Postgres. Se reescribe fn_crear_pago
-- tomando el perfil con LIMIT 1 y validando que todas las reservas sean
-- del mismo co-med.

create or replace function fn_crear_pago(
  p_reservas uuid[], p_metodo metodo_pago
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := es_comanager();
  v_total numeric;
  v_perfiles int;
  v_profile uuid;
  v_pago uuid;
begin
  select sum(precio), count(distinct profile_id)
    into v_total, v_perfiles
  from reservations
  where id = any(p_reservas) and estado = 'pendiente_pago' and pago_id is null;

  if v_total is null then raise exception 'SIN_RESERVAS_PENDIENTES'; end if;
  if v_perfiles <> 1 then
    raise exception 'RESERVAS_MIXTAS: todas las reservas del pago deben ser del mismo profesional';
  end if;

  select profile_id into v_profile
  from reservations
  where id = any(p_reservas) and estado = 'pendiente_pago' and pago_id is null
  limit 1;

  if v_profile <> v_actor and not v_manager then raise exception 'SIN_PERMISO'; end if;
  if p_metodo = 'efectivo' and not v_manager then
    raise exception 'EFECTIVO_SOLO_VENTANILLA: el pago en efectivo lo registra recepción';
  end if;

  insert into payments (profile_id, monto, metodo, estado)
  values (v_profile, v_total, p_metodo, 'pendiente') returning id into v_pago;
  update reservations set pago_id = v_pago where id = any(p_reservas);

  return jsonb_build_object('pago', v_pago, 'monto', v_total);
end $$;
