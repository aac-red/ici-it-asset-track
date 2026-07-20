-- ============================================================
-- PHASE A: DEPARTMENT-BASED ASSET TAGGING
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- 1. Departments table
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Seed the 12 departments
insert into public.departments (code, name) values
  ('ADMN', 'Admin Department'),
  ('ACCT', 'Accounting'),
  ('PURC', 'Purchasing'),
  ('SALE', 'Sales'),
  ('MKTC', 'Marketing Communication'),
  ('HREL', 'Human Relation'),
  ('HRES', 'Human Resources'),
  ('INFO', 'Information Technology'),
  ('WHSE', 'Warehouse'),
  ('AUTO', 'Automation'),
  ('TECH', 'Technical Department'),
  ('ENGR', 'Engineering Department')
on conflict (code) do nothing;

-- 3. Add department_code column to items
alter table public.items
  add column if not exists department_code text references public.departments(code);

create index if not exists idx_items_department_code
  on public.items(department_code);

-- 4. RLS for departments
alter table public.departments enable row level security;

drop policy if exists "departments_select_authenticated" on public.departments;
create policy "departments_select_authenticated"
  on public.departments for select
  using (auth.role() = 'authenticated');

drop policy if exists "departments_insert_admin" on public.departments;
create policy "departments_insert_admin"
  on public.departments for insert
  with check (public.is_admin());

drop policy if exists "departments_update_admin" on public.departments;
create policy "departments_update_admin"
  on public.departments for update
  using (public.is_admin());

drop policy if exists "departments_delete_admin" on public.departments;
create policy "departments_delete_admin"
  on public.departments for delete
  using (public.is_admin());
