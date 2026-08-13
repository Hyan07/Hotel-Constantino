begin;

select plan(4);

select has_table('public', 'reservations', 'reservations table exists');
select has_function('public', 'is_room_available', array['uuid','timestamp with time zone','timestamp with time zone','uuid'], 'availability function exists');

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'reservations_no_active_overlap' and contype = 'x'
  ),
  'database exclusion constraint blocks overlapping active reservations'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.reservations'::regclass),
  'RLS is enabled on reservations'
);

select * from finish();
rollback;
