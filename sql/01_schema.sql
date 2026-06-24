-- ============================================================
-- IT ASSET BORROWING SYSTEM — DATABASE SCHEMA
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES  (extends Supabase auth.users with role + info)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  department text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users with role and profile info. One row per user.';

-- ------------------------------------------------------------
-- 2. ITEMS  (IT assets — fields chosen to also support a future
--    full Inventory module without needing schema changes later)
-- ------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,           -- e.g. "LAP-0042"
  name text not null,                        -- e.g. "Dell Latitude 5440"
  category text not null,                    -- Laptop, Monitor, Cable, Peripheral, Other
  brand text,
  model text,
  serial_number text,
  status text not null default 'available'
    check (status in ('available', 'borrowed', 'maintenance', 'retired')),
  condition text default 'good'
    check (condition in ('new', 'good', 'fair', 'damaged')),

  -- Future inventory-module fields (unused by borrowing UI in v1, kept here
  -- so the table never needs an ALTER later when that module is built)
  location text,
  quantity_in_stock integer default 1,
  purchase_date date,
  purchase_cost numeric(10,2),
  warranty_expiry date,
  supplier text,

  notes text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.items is 'IT assets available to borrow. Extra columns reserved for future Inventory module.';

-- ------------------------------------------------------------
-- 3. BORROWERS  (people who borrow items — may or may not have a login)
-- ------------------------------------------------------------
create table if not exists public.borrowers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  initials text,
  email text,
  phone text,
  department text,
  employee_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.borrowers is 'People who borrow items. Separate from profiles — borrowers do not log in.';

-- ------------------------------------------------------------
-- 4. TRANSACTIONS  (borrow / return records)
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  borrower_id uuid not null references public.borrowers(id) on delete restrict,
  issued_by uuid references public.profiles(id),
  issue_date timestamptz not null default now(),
  due_date date not null,
  return_date timestamptz,
  status text not null default 'active'
    check (status in ('active', 'returned', 'overdue')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.transactions is 'Borrow/return records linking an item to a borrower.';

-- ------------------------------------------------------------
-- 5. ACTIVITY LOG  (lightweight audit trail — used by Dashboard later)
-- ------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,        -- e.g. "item_created", "transaction_returned"
  entity_type text not null,   -- e.g. "item", "transaction", "borrower"
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

comment on table public.activity_log is 'Audit trail of key actions across the system.';

-- ------------------------------------------------------------
-- Helpful indexes
-- ------------------------------------------------------------
create index if not exists idx_items_status on public.items(status);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_transactions_item on public.transactions(item_id);
create index if not exists idx_transactions_borrower on public.transactions(borrower_id);
create index if not exists idx_transactions_due_date on public.transactions(due_date);

-- ------------------------------------------------------------
-- updated_at auto-touch trigger (reused by all tables)
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_borrowers_updated_at on public.borrowers;
create trigger trg_borrowers_updated_at before update on public.borrowers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
