-- Defensa en profundidad: un co-med puede cambiar el método de pago o adjuntar
-- su comprobante, pero JAMÁS alterar monto, estado o a qué corresponde el pago.
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
