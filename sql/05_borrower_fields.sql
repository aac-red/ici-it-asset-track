-- ============================================================
-- ADD BORROWER FIELDS: initials, notes
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Safe to run even if you already created the borrowers table —
-- this only adds columns that don't exist yet.
-- ============================================================

alter table public.borrowers
  add column if not exists initials text,
  add column if not exists notes text;
