begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists citext;

create type public.app_role as enum ('admin', 'reception', 'housekeeping', 'viewer');
create type public.document_type as enum ('cpf', 'passport', 'other');
create type public.reservation_status as enum (
  'pre_reservation', 'pending', 'confirmed', 'checked_in', 'checked_out', 'canceled', 'no_show'
);
create type public.reservation_payment_status as enum ('pending', 'partial', 'paid', 'refunded', 'canceled');
create type public.room_status as enum (
  'available', 'reserved', 'occupied', 'awaiting_cleaning', 'cleaning', 'blocked', 'maintenance'
);
create type public.cleaning_status as enum ('clean', 'pending', 'in_progress', 'inspected');
create type public.maintenance_status as enum ('open', 'in_progress', 'waiting_parts', 'completed', 'canceled');
create type public.payment_method as enum (
  'cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'invoice', 'other'
);
create type public.payment_transaction_status as enum ('pending', 'received', 'refunded', 'voided');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 3 and 120),
  role public.app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 3 and 160),
  document_type public.document_type not null default 'cpf',
  document_number text,
  document_number_normalized text,
  document_path text,
  birth_date date,
  phone text,
  phone_normalized text,
  email citext,
  postal_code text,
  street text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state char(2),
  country text not null default 'Brasil',
  nationality text not null default 'Brasileira',
  emergency_contact_name text,
  emergency_contact_phone text,
  preferences text,
  accessibility_needs text,
  internal_notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or email::text ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  check (state is null or state ~ '^[A-Z]{2}$')
);

create unique index guests_document_unique
  on public.guests (document_type, document_number_normalized)
  where document_number_normalized is not null and deleted_at is null;
create index guests_name_search_idx on public.guests using gin (to_tsvector('portuguese', full_name));
create index guests_phone_idx on public.guests (phone_normalized) where deleted_at is null;
create index guests_email_idx on public.guests (lower(email::text)) where deleted_at is null;

create table public.room_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 80),
  description text,
  default_capacity smallint not null default 2 check (default_capacity between 1 and 20),
  default_nightly_rate numeric(12,2) not null check (default_nightly_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique check (char_length(trim(room_number)) between 1 and 20),
  category_id uuid not null references public.room_categories(id) on delete restrict,
  floor smallint,
  bed_type text not null,
  bed_count smallint not null default 1 check (bed_count between 1 and 10),
  max_capacity smallint not null check (max_capacity between 1 and 20),
  standard_nightly_rate numeric(12,2) not null check (standard_nightly_rate >= 0),
  amenities text[] not null default '{}',
  description text,
  internal_notes text,
  current_status public.room_status not null default 'available',
  cleaning_status public.cleaning_status not null default 'clean',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rooms_status_idx on public.rooms (current_status, cleaning_status);
create index rooms_category_idx on public.rooms (category_id);
create index rooms_floor_idx on public.rooms (floor);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  sequential_number bigint generated always as identity,
  code text not null unique,
  responsible_guest_id uuid not null references public.guests(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in_at timestamptz not null,
  check_out_at timestamptz not null,
  adults smallint not null default 1 check (adults between 1 and 20),
  children smallint not null default 0 check (children between 0 and 20),
  nightly_rate numeric(12,2) not null check (nightly_rate >= 0),
  nights integer not null default 1 check (nights > 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  surcharge numeric(12,2) not null default 0 check (surcharge >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  payment_method public.payment_method,
  payment_status public.reservation_payment_status not null default 'pending',
  status public.reservation_status not null default 'pending',
  origin_channel text not null default 'Direto',
  notes text,
  special_requests text,
  canceled_reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  checked_in_by uuid references public.profiles(id) on delete set null,
  checked_out_by uuid references public.profiles(id) on delete set null,
  checked_in_at_actual timestamptz,
  checked_out_at_actual timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_period_valid check (check_out_at > check_in_at),
  constraint reservation_capacity_valid check (adults + children > 0)
);

alter table public.reservations
  add constraint reservations_no_active_overlap
  exclude using gist (
    room_id with =,
    tstzrange(check_in_at, check_out_at, '[)') with &&
  )
  where (
    status in ('pre_reservation', 'pending', 'confirmed', 'checked_in')
    and deleted_at is null
  );

create index reservations_period_idx on public.reservations (check_in_at, check_out_at);
create index reservations_status_idx on public.reservations (status, check_in_at);
create index reservations_guest_idx on public.reservations (responsible_guest_id);
create index reservations_room_idx on public.reservations (room_id, check_in_at);
create index reservations_payment_idx on public.reservations (payment_status) where deleted_at is null;

create table public.reservation_guests (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete restrict,
  is_responsible boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (reservation_id, guest_id)
);

create unique index reservation_single_responsible_idx
  on public.reservation_guests (reservation_id)
  where is_responsible;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  status public.payment_transaction_status not null default 'received',
  paid_at timestamptz,
  transaction_reference text,
  notes text,
  receipt_path text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'received' and paid_at is not null) or status <> 'received')
);

create index payments_reservation_idx on public.payments (reservation_id, status);
create index payments_paid_at_idx on public.payments (paid_at desc);

create table public.maintenance (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 160),
  description text,
  start_at timestamptz not null default now(),
  expected_release_at timestamptz,
  released_at timestamptz,
  responsible_name text,
  status public.maintenance_status not null default 'open',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_release_at is null or expected_release_at > start_at)
);

create index maintenance_room_status_idx on public.maintenance (room_id, status);
create index maintenance_release_idx on public.maintenance (expected_release_at) where status <> 'completed';

create table public.room_status_history (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  previous_status public.room_status,
  new_status public.room_status not null,
  previous_cleaning_status public.cleaning_status,
  new_cleaning_status public.cleaning_status not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index room_status_history_room_idx on public.room_status_history (room_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  table_name text not null,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

comment on table public.guests is 'Dados pessoais protegidos por RLS e acesso auditado conforme LGPD.';
comment on column public.guests.document_number is 'Documento pessoal: nunca exibir integralmente em listagens.';
comment on table public.audit_logs is 'Log imutável de operações relevantes e acessos sensíveis.';

commit;
