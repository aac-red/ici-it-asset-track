// ============================================================
// USERS DATA MODULE (Admin only)
// Listing/deactivating/role-changing works directly against the
// `profiles` table (RLS already restricts writes to admins).
// Creating a brand-new account requires the admin-create-user
// Edge Function, since that's the only place the service_role
// key can safely be used.
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

export async function fetchUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Create a new staff/admin account.
 * Calls the admin-create-user Edge Function — the frontend never
 * touches auth.users directly or holds a service_role key.
 */
export async function createUserAccount({ email, password, fullName, role, department }) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, fullName, role, department },
  });

  if (error) {
    // supabase-js wraps non-2xx responses in `error`; the function's
    // own JSON error message is usually in error.context or data.
    throw new Error(error.message || 'Could not create user.');
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

/** Toggle a user's active status. Inactive users are blocked at login (see auth.js). */
export async function setUserActive(userId, isActive) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Change a user's role between admin/staff. */
export async function setUserRole(userId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
