-- ============================================================
-- VitalCowork — Row Level Security
-- Control de acceso por rol EN EL BACKEND (no solo UI):
--  · co-med: solo ve/edita lo suyo; las reservas ajenas solo vía la
--    vista anonimizada calendario_publico (alias + especialidad).
--  · co-manager: acceso completo.
-- ============================================================

-- Helper: ¿el usuario autenticado es co-manager?
-- SECURITY DEFINER para evitar recursión de RLS sobre profiles.
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

-- ---------- Catálogos: lectura pública autenticada, escritura co-manager ----------
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

-- ---------- Acreditaciones: el dueño sube y ve; solo co-manager revisa ----------
create policy sel_acred on accreditations for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy ins_acred on accreditations for insert to authenticated
  with check (profile_id = auth.uid() or es_comanager());
create policy upd_acred on accreditations for update to authenticated
  using (es_comanager()) with check (es_comanager());

-- ---------- Paquetes y monedero: lectura propia; escritura solo vía funciones ----------
create policy sel_paquetes on packages for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy sel_wallet on wallet_ledger for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
create policy adm_wallet on wallet_ledger for insert to authenticated
  with check (es_comanager()); -- ajustes manuales; el resto lo hacen funciones SECURITY DEFINER

-- ---------- Reservas: el co-med solo ve las suyas (las ajenas van por la vista) ----------
create policy sel_reservas on reservations for select to authenticated
  using (profile_id = auth.uid() or es_comanager());
-- inserciones/updates SOLO vía funciones transaccionales (security definer)
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
    then p.alias else p.alias end as alias, -- alias siempre (es el dato público)
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
-- dueño y el co-manager pueden leer.
create policy up_acred on storage.objects for insert to authenticated
  with check (bucket_id = 'acreditaciones' and (storage.foldername(name))[1] = auth.uid()::text);
create policy rd_acred on storage.objects for select to authenticated
  using (bucket_id = 'acreditaciones' and ((storage.foldername(name))[1] = auth.uid()::text or es_comanager()));
create policy up_comp on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy rd_comp on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or es_comanager()));
