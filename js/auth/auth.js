// ============================================================
// AUTH MODULE
// Handles login, logout, session checks, and role lookups.
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

/**
 * Attempt to log in with email + password.
 * @returns {Promise<{profile: object}>}
 * @throws {Error} with a user-friendly message on failure
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Normalize Supabase's error into something readable
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Incorrect email or password.');
    }
    throw new Error(error.message);
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('No profile found for this account. Contact your admin.');
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error('This account has been deactivated. Contact your admin.');
  }

  return { profile };
}

/** Sign the current user out and redirect to login. */
export async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

/** Get the current Supabase auth session, or null if not logged in. */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Get the current user's profile row (id, full_name, role, etc).
 * Returns null if not logged in or profile doesn't exist.
 */
export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Failed to load profile:', error.message);
    return null;
  }
  return data;
}

/**
 * Route guard for protected pages. Call at the top of every
 * authenticated page's init script.
 * Redirects to login.html if not authenticated.
 * If `requireAdmin` is true, redirects non-admins to the dashboard.
 * @returns {Promise<object>} the current profile
 */
export async function requireAuth({ requireAdmin = false } = {}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    window.location.href = 'login.html';
    throw new Error('Not authenticated'); // halts caller's execution
  }

  if (requireAdmin && profile.role !== 'admin') {
    window.location.href = 'dashboard.html';
    throw new Error('Not authorized');
  }

  return profile;
}
