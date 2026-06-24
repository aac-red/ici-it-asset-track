// ============================================================
// EMAIL TRIGGER HELPER (frontend side)
// Calls the `send-email` Edge Function. Failures here are
// intentionally non-blocking — a failed email should never stop
// an issue/return action from completing, since the loan record
// itself is the source of truth, not the notification.
// ============================================================
import { supabase } from './supabaseClient.js';

/**
 * @param {'issued'|'returned'} type
 * @param {string} to - recipient email (can be null/undefined — caller should check)
 * @param {object} data - template data (itemName, assetTag, dueDate, borrowerName, etc.)
 */
export async function triggerEmail(type, to, data) {
  if (!to) return { skipped: true, reason: 'No email on file for this borrower.' };

  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: { type, to, data },
    });
    if (error) throw error;
    return result;
  } catch (err) {
    console.error('Email notification failed (non-blocking):', err.message);
    return { error: err.message };
  }
}
