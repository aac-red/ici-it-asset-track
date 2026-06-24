-- ============================================================
-- PHASE 8 ADDITION: borrower initials + notes
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

alter table public.borrowers
  add column if not exists initials text,
  add column if not exists notes text;
