begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.active = true
  limit 1;
$$;

create or replace function public.has_any_role(variadic allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any(allowed_roles), false);
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    'viewer',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.normalize_guest_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := regexp_replace(trim(new.full_name), '\s+', ' ', 'g');
  new.document_number_normalized := nullif(upper(regexp_replace(coalesce(new.document_number, ''), '[^[:alnum:]]', '', 'g')), '');
  new.phone_normalized := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  new.email := nullif(lower(trim(new.email::text)), '')::citext;
  new.state := nullif(upper(trim(new.state)), '');
  if tg_op = 'UPDATE' then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

create trigger guests_normalize_before_write
  before insert or update on public.guests
  for each row execute function public.normalize_guest_fields();

create or replace function public.prepare_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  local_nights integer;
  room_capacity integer;
  room_active boolean;
  room_state public.room_status;
begin
  local_nights := greatest(1, ceil(extract(epoch from (new.check_out_at - new.check_in_at)) / 86400.0)::integer);
  new.nights := local_nights;
  new.total_amount := greatest(0, round((new.nightly_rate * local_nights) - new.discount + new.surcharge, 2));
  if new.code is null or trim(new.code) = '' then
    new.code := 'CH-' || to_char(coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo', 'YYYY') || '-' ||
      lpad(new.sequential_number::text, 6, '0');
  end if;

  if new.status in ('pre_reservation', 'pending', 'confirmed', 'checked_in') then
    select rm.max_capacity, rm.active, rm.current_status
    into room_capacity, room_active, room_state
    from public.rooms rm where rm.id = new.room_id;
    if not found or not room_active then
      raise exception using errcode = '23514', message = 'O quarto selecionado não está ativo.';
    end if;
    if new.adults + new.children > room_capacity then
      raise exception using errcode = '23514', message = 'A quantidade de hóspedes excede a capacidade do quarto.';
    end if;
    if room_state = 'blocked' then
      raise exception using errcode = '23514', message = 'O quarto está bloqueado.';
    end if;
    if exists (
      select 1 from public.maintenance m
      where m.room_id = new.room_id and m.status in ('open', 'in_progress', 'waiting_parts')
        and tstzrange(m.start_at, coalesce(m.expected_release_at, 'infinity'::timestamptz), '[)')
            && tstzrange(new.check_in_at, new.check_out_at, '[)')
    ) then
      raise exception using errcode = '23P01', message = 'O quarto está em manutenção no período selecionado.';
    end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

create trigger reservations_prepare_before_write
  before insert or update on public.reservations
  for each row execute function public.prepare_reservation();

create or replace function public.sync_reservation_responsible_guest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reservation_guests
  set is_responsible = false
  where reservation_id = new.id and guest_id <> new.responsible_guest_id and is_responsible;

  insert into public.reservation_guests (reservation_id, guest_id, is_responsible)
  values (new.id, new.responsible_guest_id, true)
  on conflict (reservation_id, guest_id)
  do update set is_responsible = true;
  return new;
end;
$$;

create trigger reservations_sync_responsible_after_write
  after insert or update of responsible_guest_id on public.reservations
  for each row execute function public.sync_reservation_responsible_guest();

create or replace function public.is_room_available(
  p_room_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_exclude_reservation uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_app_role() is not null
    and p_check_out > p_check_in
    and exists (
      select 1 from public.rooms rm
      where rm.id = p_room_id and rm.active = true and rm.current_status not in ('blocked', 'maintenance')
    )
    and not exists (
      select 1
      from public.reservations r
      where r.room_id = p_room_id
        and r.id is distinct from p_exclude_reservation
        and r.deleted_at is null
        and r.status in ('pre_reservation', 'pending', 'confirmed', 'checked_in')
        and tstzrange(r.check_in_at, r.check_out_at, '[)') && tstzrange(p_check_in, p_check_out, '[)')
    );
$$;

create or replace function public.transition_reservation(p_reservation_id uuid, p_action text, p_reason text default null)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations;
  target_status public.reservation_status;
begin
  if not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role) then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar a reserva.';
  end if;

  select * into reservation_row
  from public.reservations
  where id = p_reservation_id and deleted_at is null
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Reserva não encontrada.'; end if;

  target_status := case p_action
    when 'confirm' then 'confirmed'::public.reservation_status
    when 'check_in' then 'checked_in'::public.reservation_status
    when 'check_out' then 'checked_out'::public.reservation_status
    when 'cancel' then 'canceled'::public.reservation_status
    when 'no_show' then 'no_show'::public.reservation_status
    else null
  end;

  if target_status is null then
    raise exception using errcode = '22023', message = 'Ação de reserva inválida.';
  end if;

  if p_action = 'confirm' and reservation_row.status not in ('pre_reservation', 'pending') then
    raise exception using errcode = '22023', message = 'Somente reservas pendentes podem ser confirmadas.';
  elsif p_action = 'check_in' and reservation_row.status not in ('pending', 'confirmed') then
    raise exception using errcode = '22023', message = 'A reserva não está apta para check-in.';
  elsif p_action = 'check_out' and reservation_row.status <> 'checked_in' then
    raise exception using errcode = '22023', message = 'Somente uma hospedagem ativa pode fazer check-out.';
  elsif p_action in ('cancel', 'no_show') and reservation_row.status in ('checked_out', 'canceled', 'no_show') then
    raise exception using errcode = '22023', message = 'A reserva já está encerrada.';
  end if;

  update public.reservations
  set status = target_status,
      canceled_reason = case when p_action = 'cancel' then nullif(trim(p_reason), '') else canceled_reason end,
      checked_in_at_actual = case when p_action = 'check_in' then now() else checked_in_at_actual end,
      checked_in_by = case when p_action = 'check_in' then auth.uid() else checked_in_by end,
      checked_out_at_actual = case when p_action = 'check_out' then now() else checked_out_at_actual end,
      checked_out_by = case when p_action = 'check_out' then auth.uid() else checked_out_by end,
      updated_by = auth.uid()
  where id = p_reservation_id
  returning * into reservation_row;

  if p_action = 'check_in' then
    update public.rooms set current_status = 'occupied', updated_by = auth.uid() where id = reservation_row.room_id;
  elsif p_action = 'check_out' then
    update public.rooms
    set current_status = 'awaiting_cleaning', cleaning_status = 'pending', updated_by = auth.uid()
    where id = reservation_row.room_id;
  elsif p_action in ('cancel', 'no_show') then
    update public.rooms
    set current_status = 'available', updated_by = auth.uid()
    where id = reservation_row.room_id and current_status = 'reserved';
  elsif p_action = 'confirm' and (reservation_row.check_in_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date then
    update public.rooms set current_status = 'reserved', updated_by = auth.uid()
    where id = reservation_row.room_id and current_status = 'available';
  end if;

  return reservation_row;
end;
$$;

create or replace function public.change_reservation_room(p_reservation_id uuid, p_new_room_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations;
  old_room_id uuid;
begin
  if not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role) then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar o quarto.';
  end if;

  select * into reservation_row
  from public.reservations
  where id = p_reservation_id and deleted_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Reserva não encontrada.'; end if;
  if reservation_row.status not in ('pre_reservation', 'pending', 'confirmed', 'checked_in') then
    raise exception using errcode = '22023', message = 'A reserva encerrada não pode trocar de quarto.';
  end if;
  if reservation_row.room_id = p_new_room_id then return reservation_row; end if;
  if not public.is_room_available(p_new_room_id, reservation_row.check_in_at, reservation_row.check_out_at, reservation_row.id) then
    raise exception using errcode = '23P01', message = 'O novo quarto não está disponível no período da reserva.';
  end if;

  old_room_id := reservation_row.room_id;
  update public.reservations
  set room_id = p_new_room_id, updated_by = auth.uid()
  where id = p_reservation_id
  returning * into reservation_row;

  if reservation_row.status = 'checked_in' then
    update public.rooms
    set current_status = 'awaiting_cleaning', cleaning_status = 'pending', updated_by = auth.uid()
    where id = old_room_id;
    update public.rooms
    set current_status = 'occupied', updated_by = auth.uid()
    where id = p_new_room_id;
  elsif (reservation_row.check_in_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date then
    update public.rooms set current_status = 'available', updated_by = auth.uid()
    where id = old_room_id and current_status = 'reserved';
    update public.rooms set current_status = 'reserved', updated_by = auth.uid()
    where id = p_new_room_id and current_status = 'available';
  end if;
  return reservation_row;
end;
$$;

create or replace function public.update_room_cleaning(
  p_room_id uuid,
  p_cleaning_status public.cleaning_status,
  p_reason text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_row public.rooms;
begin
  if not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role, 'housekeeping'::public.app_role) then
    raise exception using errcode = '42501', message = 'Sem permissão para atualizar a limpeza.';
  end if;

  update public.rooms
  set cleaning_status = p_cleaning_status,
      current_status = case
        when p_cleaning_status = 'in_progress' then 'cleaning'::public.room_status
        when p_cleaning_status in ('clean', 'inspected') and current_status in ('awaiting_cleaning', 'cleaning') then 'available'::public.room_status
        else current_status
      end,
      internal_notes = case when nullif(trim(p_reason), '') is not null then concat_ws(E'\n', internal_notes, '[Limpeza] ' || trim(p_reason)) else internal_notes end,
      updated_by = auth.uid()
  where id = p_room_id and active = true
  returning * into room_row;

  if not found then raise exception using errcode = 'P0002', message = 'Quarto não encontrado.'; end if;
  return room_row;
end;
$$;

create or replace function public.record_sensitive_access(p_table_name text, p_record_id uuid, p_context text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_table_name <> 'guests' or not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role) then
    raise exception using errcode = '42501', message = 'Acesso sensível não autorizado.';
  end if;
  insert into public.audit_logs (user_id, action, table_name, record_id, new_values)
  values (auth.uid(), 'VIEW_SENSITIVE', p_table_name, p_record_id::text, jsonb_build_object('context', p_context));
end;
$$;

create or replace function public.set_room_operational_status(p_room_id uuid, p_status public.room_status, p_reason text default null)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_row public.rooms;
begin
  if not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role) then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar a situação operacional.';
  end if;
  if p_status not in ('available', 'blocked') then
    raise exception using errcode = '22023', message = 'Situação operacional inválida para alteração manual.';
  end if;

  select * into room_row from public.rooms where id = p_room_id and active = true for update;
  if not found then raise exception using errcode = 'P0002', message = 'Quarto não encontrado.'; end if;

  if p_status = 'blocked' then
    if room_row.current_status <> 'available' then
      raise exception using errcode = '22023', message = 'Somente um quarto disponível pode ser bloqueado manualmente.';
    end if;
    if exists (
      select 1 from public.reservations r
      where r.room_id = p_room_id and r.deleted_at is null
        and r.status in ('pre_reservation', 'pending', 'confirmed', 'checked_in')
    ) then
      raise exception using errcode = '23P01', message = 'O quarto possui reservas ativas e não pode ser bloqueado sem remanejamento.';
    end if;
  elsif room_row.current_status <> 'blocked' then
    raise exception using errcode = '22023', message = 'Somente um bloqueio manual pode ser liberado por esta ação.';
  end if;

  update public.rooms
  set current_status = p_status,
      internal_notes = case when nullif(trim(p_reason), '') is null then internal_notes else concat_ws(E'\n', internal_notes, '[Situação] ' || trim(p_reason)) end,
      updated_by = auth.uid()
  where id = p_room_id
  returning * into room_row;
  return room_row;
end;
$$;

create or replace function public.block_room_for_maintenance(
  p_room_id uuid,
  p_reason text,
  p_description text,
  p_start_at timestamptz,
  p_expected_release_at timestamptz,
  p_responsible_name text
)
returns public.maintenance
language plpgsql
security definer
set search_path = ''
as $$
declare
  maintenance_row public.maintenance;
begin
  if not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role) then
    raise exception using errcode = '42501', message = 'Sem permissão para bloquear o quarto.';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Informe o motivo da manutenção.';
  end if;
  if p_expected_release_at is not null and p_expected_release_at <= p_start_at then
    raise exception using errcode = '22023', message = 'A previsão de liberação deve ser posterior ao início.';
  end if;
  if exists (
    select 1 from public.reservations r
    where r.room_id = p_room_id and r.deleted_at is null
      and r.status in ('pre_reservation', 'pending', 'confirmed', 'checked_in')
      and tstzrange(r.check_in_at, r.check_out_at, '[)') && tstzrange(p_start_at, coalesce(p_expected_release_at, 'infinity'::timestamptz), '[)')
  ) then
    raise exception using errcode = '23P01', message = 'O quarto possui hospedagem ou reserva confirmada no período da manutenção.';
  end if;

  insert into public.maintenance (
    room_id, reason, description, start_at, expected_release_at, responsible_name, status, created_by, updated_by
  ) values (
    p_room_id, trim(p_reason), nullif(trim(p_description), ''), p_start_at,
    p_expected_release_at, nullif(trim(p_responsible_name), ''), 'open', auth.uid(), auth.uid()
  ) returning * into maintenance_row;

  update public.rooms
  set current_status = 'maintenance', updated_by = auth.uid()
  where id = p_room_id and active = true;
  if not found then raise exception using errcode = 'P0002', message = 'Quarto não encontrado.'; end if;
  return maintenance_row;
end;
$$;

create or replace function public.complete_room_maintenance(p_maintenance_id uuid, p_notes text default null)
returns public.maintenance
language plpgsql
security definer
set search_path = ''
as $$
declare
  maintenance_row public.maintenance;
begin
  if not public.has_any_role('admin'::public.app_role, 'reception'::public.app_role, 'housekeeping'::public.app_role) then
    raise exception using errcode = '42501', message = 'Sem permissão para concluir a manutenção.';
  end if;
  update public.maintenance
  set status = 'completed', released_at = now(),
      description = case when nullif(trim(p_notes), '') is null then description else concat_ws(E'\n', description, '[Conclusão] ' || trim(p_notes)) end,
      updated_by = auth.uid()
  where id = p_maintenance_id and status not in ('completed', 'canceled')
  returning * into maintenance_row;
  if not found then raise exception using errcode = 'P0002', message = 'Manutenção ativa não encontrada.'; end if;

  update public.rooms
  set current_status = 'awaiting_cleaning', cleaning_status = 'pending', updated_by = auth.uid()
  where id = maintenance_row.room_id;
  return maintenance_row;
end;
$$;

create or replace function public.recalculate_reservation_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reservation uuid := coalesce(new.reservation_id, old.reservation_id);
  total numeric(12,2);
  received numeric(12,2);
begin
  select r.total_amount into total from public.reservations r where r.id = target_reservation;
  select coalesce(sum(case when p.status = 'received' then p.amount when p.status = 'refunded' then -p.amount else 0 end), 0)
  into received from public.payments p where p.reservation_id = target_reservation;

  update public.reservations
  set payment_status = case
    when received <= 0 then 'pending'::public.reservation_payment_status
    when received < total then 'partial'::public.reservation_payment_status
    else 'paid'::public.reservation_payment_status
  end
  where id = target_reservation;
  return coalesce(new, old);
end;
$$;

create trigger payments_recalculate_reservation
  after insert or update or delete on public.payments
  for each row execute function public.recalculate_reservation_payment_status();

create or replace function public.track_room_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.current_status is distinct from new.current_status or old.cleaning_status is distinct from new.cleaning_status then
    insert into public.room_status_history (
      room_id, previous_status, new_status, previous_cleaning_status, new_cleaning_status, changed_by
    ) values (
      new.id, old.current_status, new.current_status, old.cleaning_status, new.cleaning_status, auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger rooms_track_status_after_update
  after update of current_status, cleaning_status on public.rooms
  for each row execute function public.track_room_status();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb;
  new_data jsonb;
  target_id text;
begin
  old_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_id := coalesce(new_data ->> 'id', old_data ->> 'id');

  insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  values (auth.uid(), tg_op, tg_table_name, target_id, old_data, new_data);
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'guests', 'room_categories', 'rooms', 'reservations', 'payments', 'maintenance']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', 'audit_' || table_name, table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'guests', 'room_categories', 'rooms', 'reservations', 'payments', 'maintenance']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_updated_at_' || table_name, table_name);
  end loop;
end $$;

create or replace function public.get_dashboard_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with local_today as (
    select (now() at time zone 'America/Sao_Paulo')::date as day
  ), room_counts as (
    select
      count(*) filter (where active) as total,
      count(*) filter (where active and current_status = 'available') as available,
      count(*) filter (where active and current_status = 'reserved') as reserved,
      count(*) filter (where active and current_status = 'occupied') as occupied,
      count(*) filter (where active and current_status = 'awaiting_cleaning') as awaiting_cleaning,
      count(*) filter (where active and current_status = 'maintenance') as maintenance
    from public.rooms
  ), reservation_counts as (
    select
      count(*) filter (where (created_at at time zone 'America/Sao_Paulo')::date = t.day) as reservations_today,
      count(*) filter (where (check_in_at at time zone 'America/Sao_Paulo')::date = t.day and status in ('pending','confirmed')) as checkins_today,
      count(*) filter (where (check_out_at at time zone 'America/Sao_Paulo')::date = t.day and status = 'checked_in') as checkouts_today,
      count(*) filter (where status in ('pre_reservation','pending')) as pending
    from public.reservations, local_today t
    where deleted_at is null
  )
  select jsonb_build_object(
    'rooms', jsonb_build_object(
      'total', rc.total,
      'available', rc.available,
      'reserved', rc.reserved,
      'occupied', rc.occupied,
      'awaitingCleaning', rc.awaiting_cleaning,
      'maintenance', rc.maintenance,
      'occupancyRate', case when rc.total = 0 then 0 else round((rc.occupied::numeric / rc.total::numeric) * 100, 1) end
    ),
    'reservationsToday', rr.reservations_today,
    'checkinsToday', rr.checkins_today,
    'checkoutsToday', rr.checkouts_today,
    'pendingReservations', rr.pending
  )
  from room_counts rc cross join reservation_counts rr
  where public.current_app_role() is not null;
$$;

create or replace view public.reservation_overview
with (security_invoker = true)
as
select
  r.*,
  g.full_name as guest_name,
  g.phone as guest_phone,
  g.email::text as guest_email,
  rm.room_number,
  rc.name as category_name,
  coalesce((select sum(p.amount) from public.payments p where p.reservation_id = r.id and p.status = 'received'), 0) as amount_paid
from public.reservations r
join public.guests g on g.id = r.responsible_guest_id
join public.rooms rm on rm.id = r.room_id
join public.room_categories rc on rc.id = rm.category_id
where r.deleted_at is null;

create or replace view public.room_overview
with (security_invoker = true)
as
select
  rm.*,
  rc.name as category_name,
  current_guest.full_name as current_guest_name,
  next_booking.code as next_reservation_code,
  next_booking.check_in_at as next_check_in,
  next_booking.check_out_at as expected_release_at
from public.rooms rm
join public.room_categories rc on rc.id = rm.category_id
left join lateral (
  select g.full_name
  from public.reservations r
  join public.guests g on g.id = r.responsible_guest_id
  where r.room_id = rm.id and r.status = 'checked_in' and r.deleted_at is null
  order by r.check_in_at desc limit 1
) current_guest on true
left join lateral (
  select r.code, r.check_in_at, r.check_out_at
  from public.reservations r
  where r.room_id = rm.id and r.status in ('pending','confirmed') and r.check_in_at >= now() and r.deleted_at is null
  order by r.check_in_at limit 1
) next_booking on true
where rm.active = true;

commit;
