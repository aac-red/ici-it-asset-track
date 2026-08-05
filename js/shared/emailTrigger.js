// ============================================================
// EMAIL TRIGGER HELPER (frontend side)
// Calls the send-email Edge Function. Fire-and-forget — a failed
// email never blocks the issue/return action completing.
// Supported types: 'issued' | 'issued_batch' | 'returned'
// ============================================================
import { supabase } from './supabaseClient.js';

export async function triggerEmail(type, to, data) {
  if (!to) return { skipped: true, reason: 'No email on file.' };
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
