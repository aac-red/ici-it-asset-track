// ============================================================
// TRANSACTIONS DATA MODULE
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

const SELECT_WITH_RELATIONS = `
  *,
  items ( id, asset_tag, name, category, status ),
  borrowers ( id, full_name, department, email, phone ),
  profiles ( id, full_name )
`;

/**
 * True if a transaction is active and past its due date.
 * Uses YYYY-MM-DD string comparison to avoid UTC/local timezone mismatch.
 */
export function isOverdue(tx) {
  if (tx.status !== 'active') return false;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return tx.due_date < todayStr;
}

export function displayStatus(tx) {
  if (tx.status === 'active' && isOverdue(tx)) return 'overdue';
  return tx.status;
}

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

  if (filter === 'overdue') results = results.filter(isOverdue);
  else if (filter === 'active') results = results.filter((tx) => !isOverdue(tx));

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

export async function fetchAvailableItems() {
  const { data, error } = await supabase
    .from('items')
    .select('id, asset_tag, name, category, department_code')
    .eq('status', 'available')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Issue a single item. Used internally by issueMultipleItems.
 */
async function issueSingleItem({ itemId, borrowerId, dueDate, notes, issuedBy }) {
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
    // Roll back the transaction row
    await supabase.from('transactions').delete().eq('id', txData.id);
    throw new Error('Could not update item status. Please try again.');
  }
  return txData;
}

/**
 * Issue multiple items to one borrower in a single batch.
 * Each item can have its own due date.
 *
 * @param {object} params
 * @param {Array<{itemId: string, dueDate: string, notes?: string}>} params.items
 * @param {string} params.borrowerId
 * @param {string} params.issuedBy - profile id of the issuer
 * @returns {Array} created transaction rows
 */
export async function issueMultipleItems({ items, borrowerId, issuedBy }) {
  const results = [];
  const failed = [];

  for (const entry of items) {
    try {
      const tx = await issueSingleItem({
        itemId: entry.itemId,
        borrowerId,
        dueDate: entry.dueDate,
        notes: entry.notes || null,
        issuedBy,
      });
      results.push({ tx, itemId: entry.itemId });
    } catch (err) {
      failed.push({ itemId: entry.itemId, error: err.message });
    }
  }

  return { results, failed };
}

// Keep single-item export for backwards compatibility
export async function issueItem({ itemId, borrowerId, dueDate, notes, issuedBy }) {
  return issueSingleItem({ itemId, borrowerId, dueDate, notes, issuedBy });
}

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
