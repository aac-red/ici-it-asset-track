// ============================================================
// BORROWERS DATA MODULE
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

export async function fetchBorrowers({ search = '' } = {}) {
  let query = supabase.from('borrowers').select('*').order('full_name', { ascending: true });

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `full_name.ilike.${term},email.ilike.${term},department.ilike.${term},employee_id.ilike.${term},initials.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchBorrowerById(id) {
  const { data, error } = await supabase.from('borrowers').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createBorrower(payload) {
  const { data, error } = await supabase.from('borrowers').insert([payload]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateBorrower(id, payload) {
  const { data, error } = await supabase.from('borrowers').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteBorrower(id) {
  const { error } = await supabase.from('borrowers').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error('This borrower has loan history and can\'t be deleted.');
    }
    throw new Error(error.message);
  }
}

/** Count of currently active (unreturned) loans for a borrower — used for delete-guard UI. */
export async function countActiveLoans(borrowerId) {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('borrower_id', borrowerId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return count || 0;
}
