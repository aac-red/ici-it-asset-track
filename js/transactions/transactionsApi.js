// ============================================================
// TRANSACTIONS DATA MODULE
// Handles issuing items, returning them, and overdue detection.
//
// Design note on "overdue": we don't store a cron-updated status.
// Instead, status is 'active' while out, 'returned' once back, and
// "overdue" is a DERIVED state computed from due_date vs. today
// for any 'active' transaction. This avoids needing a scheduled
// job just to keep a status column in sync, and is always accurate
// the moment the page loads. Phase 5's email job re-derives the
// same way server-side.
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

const SELECT_WITH_RELATIONS = `
  *,
  items ( id, asset_tag, name, category, status ),
  borrowers ( id, full_name, department, email, phone ),
  profiles ( id, full_name )
`;

/** True if a transaction is active and past its due date. */
export function isOverdue(tx) {
  if (tx.status !== 'active') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(tx.due_date) < today;
}

/** Get a display status that includes the derived 'overdue' state. */
export function displayStatus(tx) {
  if (tx.status === 'active' && isOverdue(tx)) return 'overdue';
  return tx.status;
}

/**
 * Fetch transactions with item/borrower/issuer info joined.
 * filter: 'active' | 'overdue' | 'returned' | '' (all)
 * dateFrom/dateTo: 'YYYY-MM-DD' strings, filters by issue_date (optional)
 */
export async function fetchTransactions({ filter = '', search = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase
    .from('transactions')
    .select(SELECT_WITH_RELATIONS)
    .order('issue_date', { ascending: false });

  if (filter === 'returned') {
    query = query.eq('status', 'returned');
  } else if (filter === 'active' || filter === 'overdue') {
    query = query.eq('status', 'active');
  }

  if (dateFrom) query = query.gte('issue_date', dateFrom);
  if (dateTo) query = query.lte('issue_date', `${dateTo}T23:59:59`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let results = data;

  if (filter === 'overdue') {
    results = results.filter(isOverdue);
  } else if (filter === 'active') {
    results = results.filter((tx) => !isOverdue(tx));
  }

  if (search.trim()) {
    const term = search.trim().toLowerCase();
    results = results.filter((tx) =>
      tx.items?.asset_tag?.toLowerCase().includes(term) ||
      tx.items?.name?.toLowerCase().includes(term) ||
      tx.borrowers?.full_name?.toLowerCase().includes(term)
    );
  }

  return results;
}

/** Items currently available to be issued (status = 'available'). */
export async function fetchAvailableItems() {
  const { data, error } = await supabase
    .from('items')
    .select('id, asset_tag, name, category')
    .eq('status', 'available')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Issue an item to a borrower. Wrapped logically as: create the
 * transaction, then flip the item's status to 'borrowed'.
 * Supabase JS doesn't have a multi-table client-side transaction,
 * so we do it in sequence and roll back the transaction row if the
 * item update fails (best-effort consistency for a client-only app).
 */
export async function issueItem({ itemId, borrowerId, dueDate, notes, issuedBy }) {
  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .insert([{
      item_id: itemId,
      borrower_id: borrowerId,
      issued_by: issuedBy,
      due_date: dueDate,
      notes: notes || null,
      status: 'active',
    }])
    .select()
    .single();

  if (txError) throw new Error(txError.message);

  const { error: itemError } = await supabase
    .from('items')
    .update({ status: 'borrowed' })
    .eq('id', itemId);

  if (itemError) {
    // Roll back the transaction row so we don't leave an orphaned
    // "active" loan for an item that's still marked available.
    await supabase.from('transactions').delete().eq('id', txData.id);
    throw new Error('Could not update item status. Please try again.');
  }

  return txData;
}

/**
 * Mark a transaction as returned and flip the item back to available.
 * `condition` lets staff optionally update the item's condition on return.
 */
export async function returnItem(transactionId, itemId, { condition } = {}) {
  const { error: txError } = await supabase
    .from('transactions')
    .update({ status: 'returned', return_date: new Date().toISOString() })
    .eq('id', transactionId);

  if (txError) throw new Error(txError.message);

  const itemUpdate = { status: 'available' };
  if (condition) itemUpdate.condition = condition;

  const { error: itemError } = await supabase
    .from('items')
    .update(itemUpdate)
    .eq('id', itemId);

  if (itemError) throw new Error('Item marked returned, but condition update failed.');
}

/** Quick counts for dashboard/badges: { active, overdue, returnedToday } */
export async function fetchTransactionStats() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, status, due_date')
    .eq('status', 'active');

  if (error) throw new Error(error.message);

  const active = data.length;
  const overdue = data.filter(isOverdue).length;

  return { active, overdue };
}
