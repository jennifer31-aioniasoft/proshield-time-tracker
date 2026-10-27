-- ProShield Time Tracker — Supabase database schema
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.

-- 1) Profiles: one row per user (their name + manager flag)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  is_manager boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) Sessions: one row per work session (clock in -> clock out)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  description text,
  paused_ms bigint not null default 0,   -- total time paused (finished pauses), in milliseconds
  paused_at timestamptz,                 -- set while the session is currently paused
  created_at timestamptz not null default now()
);
-- Pause/Resume columns (safe to re-run on an existing database)
alter table public.sessions add column if not exists paused_ms bigint not null default 0;
alter table public.sessions add column if not exists paused_at timestamptz;
create index if not exists sessions_user_idx on public.sessions(user_id);
create index if not exists sessions_clockin_idx on public.sessions(clock_in);

-- 3) Helper: is the current user a manager? (security definer avoids RLS recursion)
create or replace function public.is_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_manager from public.profiles where id = auth.uid()), false);
$$;

-- 4) Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Row Level Security
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

-- Profiles: see your own; managers see everyone
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_manager());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid());

-- Sessions: see/insert/update your own; managers can see everyone
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select
  using (user_id = auth.uid() or public.is_manager());

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions for insert
  with check (user_id = auth.uid());

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions for update
  using (user_id = auth.uid());

-- 6) After you sign up once, make yourself a manager (change the email):
-- update public.profiles set is_manager = true
--   where id = (select id from auth.users where email = 'you@proshield.com');
