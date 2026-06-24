-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Run this AFTER 01_schema.sql
-- Logic: any logged-in user (admin or staff) can read/write the
-- working data (items, borrowers, transactions). Only admins can
-- manage user profiles/roles or delete records.
-- ============================================================

-- ------------------------------------------------------------
-- Helper function: is the current user an admin?
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$ language sql security definer stable;

-- ------------------------------------------------------------
-- Enable RLS on all tables
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.borrowers enable row level security;
alter table public.transactions enable row level security;
alter table public.activity_log enable row level security;

-- ------------------------------------------------------------
-- PROFILES policies
-- ------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using ( auth.uid() = id or public.is_admin() );

drop policy if exists "profiles_insert_admin_only" on public.profiles;
create policy "profiles_insert_admin_only"
  on public.profiles for insert
  with check ( public.is_admin() or auth.uid() = id );

drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
  on public.profiles for delete
  using ( public.is_admin() );

-- ------------------------------------------------------------
-- ITEMS policies — any authenticated user can read/create/update,
-- only admin can delete (prevents accidental data loss by staff)
-- ------------------------------------------------------------
drop policy if exists "items_select_authenticated" on public.items;
create policy "items_select_authenticated"
  on public.items for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "items_insert_authenticated" on public.items;
create policy "items_insert_authenticated"
  on public.items for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "items_update_authenticated" on public.items;
create policy "items_update_authenticated"
  on public.items for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "items_delete_admin_only" on public.items;
create policy "items_delete_admin_only"
  on public.items for delete
  using ( public.is_admin() );

-- ------------------------------------------------------------
-- BORROWERS policies — same pattern as items
-- ------------------------------------------------------------
drop policy if exists "borrowers_select_authenticated" on public.borrowers;
create policy "borrowers_select_authenticated"
  on public.borrowers for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "borrowers_insert_authenticated" on public.borrowers;
create policy "borrowers_insert_authenticated"
  on public.borrowers for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "borrowers_update_authenticated" on public.borrowers;
create policy "borrowers_update_authenticated"
  on public.borrowers for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "borrowers_delete_admin_only" on public.borrowers;
create policy "borrowers_delete_admin_only"
  on public.borrowers for delete
  using ( public.is_admin() );

-- ------------------------------------------------------------
-- TRANSACTIONS policies — same pattern
-- ------------------------------------------------------------
drop policy if exists "transactions_select_authenticated" on public.transactions;
create policy "transactions_select_authenticated"
  on public.transactions for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "transactions_insert_authenticated" on public.transactions;
create policy "transactions_insert_authenticated"
  on public.transactions for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "transactions_update_authenticated" on public.transactions;
create policy "transactions_update_authenticated"
  on public.transactions for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "transactions_delete_admin_only" on public.transactions;
create policy "transactions_delete_admin_only"
  on public.transactions for delete
  using ( public.is_admin() );

-- ------------------------------------------------------------
-- ACTIVITY LOG policies — everyone can read, system/users can insert,
-- nobody updates/deletes (immutable audit trail)
-- ------------------------------------------------------------
drop policy if exists "activity_log_select_authenticated" on public.activity_log;
create policy "activity_log_select_authenticated"
  on public.activity_log for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "activity_log_insert_authenticated" on public.activity_log;
create policy "activity_log_insert_authenticated"
  on public.activity_log for insert
  with check ( auth.role() = 'authenticated' );

-- ============================================================
-- IMPORTANT — FIRST ADMIN SETUP
-- ============================================================
-- After running this file:
-- 1. Go to Authentication > Users in Supabase Dashboard
-- 2. Create your first user manually (Add User > with email/password)
-- 3. Copy that user's UUID
-- 4. Run this (replace the values):
--
--    insert into public.profiles (id, full_name, email, role)
--    values ('PASTE-USER-UUID-HERE', 'Your Name', 'your@email.com', 'admin');
--
-- This makes that account the first Admin. From then on, the Admin
-- can create staff accounts via Dashboard > Authentication > Users,
-- then add their profile row with role = 'staff' the same way
-- (Phase 6 will add an in-app screen for this).
-- ============================================================
