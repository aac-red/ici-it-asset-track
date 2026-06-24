-- ============================================================
-- PHASE 6 FIX: profiles SELECT policy
-- Run this in: Supabase Dashboard > SQL Editor > New Query
--
-- Why: the original policy only let a user see their OWN profile
-- (or let admins see everyone). That's too strict for the Phase 6
-- dashboard activity feed and Reports "Issued By" column, where a
-- staff member legitimately needs to see a colleague's name, not
-- just their own. This widens SELECT to any authenticated user
-- (read-only — update/insert/delete stay restricted to self/admin).
-- ============================================================

drop policy if exists "profiles_select_own_or_admin" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles for select
  using ( auth.role() = 'authenticated' );
