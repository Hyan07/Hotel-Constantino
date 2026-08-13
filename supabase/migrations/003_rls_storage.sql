begin;

alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.room_categories enable row level security;
alter table public.rooms enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_guests enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance enable row level security;
alter table public.room_status_history enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_any_role('admin'::public.app_role));
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.has_any_role('admin'::public.app_role));
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.has_any_role('admin'::public.app_role) and id <> auth.uid())
  with check (public.has_any_role('admin'::public.app_role) and id <> auth.uid());

create policy guests_select_staff on public.guests
  for select to authenticated
  using (deleted_at is null and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy guests_insert_staff on public.guests
  for insert to authenticated
  with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy guests_update_staff on public.guests
  for update to authenticated
  using (deleted_at is null and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role))
  with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));

create policy room_categories_select_authenticated on public.room_categories
  for select to authenticated using (public.current_app_role() is not null and (active = true or public.has_any_role('admin'::public.app_role)));
create policy room_categories_admin_insert on public.room_categories
  for insert to authenticated with check (public.has_any_role('admin'::public.app_role));
create policy room_categories_admin_update on public.room_categories
  for update to authenticated using (public.has_any_role('admin'::public.app_role))
  with check (public.has_any_role('admin'::public.app_role));

create policy rooms_select_authenticated on public.rooms
  for select to authenticated using (public.current_app_role() is not null and (active = true or public.has_any_role('admin'::public.app_role)));
create policy rooms_insert_admin on public.rooms
  for insert to authenticated with check (public.has_any_role('admin'::public.app_role));
create policy rooms_update_admin_reception on public.rooms
  for update to authenticated
  using (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role))
  with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));

create policy reservations_select_authorized on public.reservations
  for select to authenticated
  using (deleted_at is null and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role, 'viewer'::public.app_role));
create policy reservations_insert_staff on public.reservations
  for insert to authenticated
  with check (
    public.has_any_role('admin'::public.app_role, 'reception'::public.app_role)
    and status in ('pre_reservation', 'pending', 'confirmed')
  );
create policy reservations_update_staff on public.reservations
  for update to authenticated
  using (
    deleted_at is null
    and status in ('pre_reservation', 'pending', 'confirmed')
    and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role)
  )
  with check (
    status in ('pre_reservation', 'pending', 'confirmed')
    and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role)
  );

create policy reservation_guests_select_staff on public.reservation_guests
  for select to authenticated using (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy reservation_guests_insert_staff on public.reservation_guests
  for insert to authenticated with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy reservation_guests_update_staff on public.reservation_guests
  for update to authenticated using (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role))
  with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy reservation_guests_delete_staff on public.reservation_guests
  for delete to authenticated using (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));

create policy payments_select_staff on public.payments
  for select to authenticated using (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy payments_insert_staff on public.payments
  for insert to authenticated with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy payments_update_admin on public.payments
  for update to authenticated using (public.has_any_role('admin'::public.app_role))
  with check (public.has_any_role('admin'::public.app_role));

create policy maintenance_select_authenticated on public.maintenance
  for select to authenticated using (public.current_app_role() is not null);
create policy maintenance_insert_staff on public.maintenance
  for insert to authenticated with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy maintenance_update_staff on public.maintenance
  for update to authenticated
  using (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role, 'housekeeping'::public.app_role))
  with check (public.has_any_role('admin'::public.app_role, 'reception'::public.app_role, 'housekeeping'::public.app_role));

create policy room_history_select_authenticated on public.room_status_history
  for select to authenticated using (public.current_app_role() is not null);

create policy audit_admin_select on public.audit_logs
  for select to authenticated using (public.has_any_role('admin'::public.app_role));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.guests to authenticated;
grant select, insert, update on public.room_categories to authenticated;
grant select, insert on public.rooms to authenticated;
grant update (room_number, category_id, floor, bed_type, bed_count, max_capacity, standard_nightly_rate, amenities, description, internal_notes, active) on public.rooms to authenticated;
grant select, insert on public.reservations to authenticated;
grant update (responsible_guest_id, room_id, check_in_at, check_out_at, adults, children, nightly_rate, discount, surcharge, payment_method, origin_channel, notes, special_requests) on public.reservations to authenticated;
grant select, insert, update, delete on public.reservation_guests to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select on public.maintenance to authenticated;
grant select on public.room_status_history, public.audit_logs to authenticated;
grant select on public.reservation_overview, public.room_overview to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.current_app_role() from public;
revoke all on function public.has_any_role(public.app_role[]) from public;
revoke all on function public.is_room_available(uuid,timestamptz,timestamptz,uuid) from public;
revoke all on function public.transition_reservation(uuid,text,text) from public;
revoke all on function public.change_reservation_room(uuid,uuid) from public;
revoke all on function public.update_room_cleaning(uuid,public.cleaning_status,text) from public;
revoke all on function public.record_sensitive_access(text,uuid,text) from public;
revoke all on function public.get_dashboard_summary() from public;
revoke all on function public.set_room_operational_status(uuid,public.room_status,text) from public;
revoke all on function public.block_room_for_maintenance(uuid,text,text,timestamptz,timestamptz,text) from public;
revoke all on function public.complete_room_maintenance(uuid,text) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
grant execute on function public.is_room_available(uuid,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.transition_reservation(uuid,text,text) to authenticated;
grant execute on function public.change_reservation_room(uuid,uuid) to authenticated;
grant execute on function public.update_room_cleaning(uuid,public.cleaning_status,text) to authenticated;
grant execute on function public.record_sensitive_access(text,uuid,text) to authenticated;
grant execute on function public.get_dashboard_summary() to authenticated;
grant execute on function public.set_room_operational_status(uuid,public.room_status,text) to authenticated;
grant execute on function public.block_room_for_maintenance(uuid,text,text,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.complete_room_maintenance(uuid,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('guest-documents', 'guest-documents', false, 10485760, array['application/pdf','image/jpeg','image/png']),
  ('receipts', 'receipts', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_staff_read on storage.objects
  for select to authenticated
  using (bucket_id in ('guest-documents','receipts') and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy storage_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('guest-documents','receipts') and public.has_any_role('admin'::public.app_role, 'reception'::public.app_role));
create policy storage_admin_update on storage.objects
  for update to authenticated
  using (bucket_id in ('guest-documents','receipts') and public.has_any_role('admin'::public.app_role))
  with check (bucket_id in ('guest-documents','receipts') and public.has_any_role('admin'::public.app_role));
create policy storage_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('guest-documents','receipts') and public.has_any_role('admin'::public.app_role));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    execute 'alter publication supabase_realtime add table public.reservations';
  end if;
end $$;

commit;
