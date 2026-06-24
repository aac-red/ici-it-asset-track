// ============================================================
// SUPABASE CLIENT CONFIGURATION
// ============================================================
// Loaded as an ES module. Uses the public "anon" key, which is
// SAFE to expose in frontend code — it has no power beyond what
// our RLS policies (sql/02_rls_policies.sql) allow.
//
// NEVER put the "service_role" key anywhere in this codebase.
// ============================================================

// TODO: Replace with your actual Supabase project values.
// Find these in: Supabase Dashboard > Project Settings > API
const SUPABASE_URL = 'https://vbjfvjuynffyqtvodxho.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiamZ2anV5bmZmeXF0dm9keGhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjc1NDUsImV4cCI6MjA5NzY0MzU0NX0.1ZAbWNotRNkrV0_zQNuLUnmMym77-Lbog59Wxz3xbH0';

// Loaded globally via CDN script tag in HTML (see index.html / login.html):
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
