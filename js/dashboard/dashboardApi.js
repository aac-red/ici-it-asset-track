// ============================================================
// DASHBOARD STATS MODULE
// Aggregate queries powering the dashboard's stat cards, chart,
// and recent activity feed.
// ============================================================
import { supabase } from '../shared/supabaseClient.js';
import { isOverdue } from '../transactions/transactionsApi.js';

/**
 * Core counts for the stat cards row.
 * @returns {Promise<{totalItems:number, available:number, activeLoans:number, overdue:number}>}
 */
export async function fetchDashboardStats() {
  const [itemsRes, txRes] = await Promise.all([
    supabase.from('items').select('id, status'),
    supabase.from('transactions').select('id, status, due_date').eq('status', 'active'),
  ]);

  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);

  const items = itemsRes.data;
  const activeLoans = txRes.data;

  return {
    totalItems: items.length,
    available: items.filter(i => i.status === 'available').length,
    activeLoans: activeLoans.length,
    overdue: activeLoans.filter(isOverdue).length,
  };
}

/** Item counts grouped by category, for the bar chart. */
export async function fetchItemsByCategory() {
  const { data, error } = await supabase.from('items').select('category');
  if (error) throw new Error(error.message);

  const counts = {};
  data.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });
  return counts; // { Laptop: 12, Monitor: 5, ... }
}

/** Item counts grouped by status, for the donut chart. */
export async function fetchItemsByStatus() {
  const { data, error } = await supabase.from('items').select('status');
  if (error) throw new Error(error.message);

  const counts = { available: 0, borrowed: 0, maintenance: 0, retired: 0 };
  data.forEach((item) => {
    if (counts[item.status] !== undefined) counts[item.status]++;
  });
  return counts;
}

/** Most-borrowed items (by transaction count), top N. */
export async function fetchMostBorrowedItems(limit = 5) {
  const { data, error } = await supabase
    .from('transactions')
    .select('item_id, items ( name, asset_tag )');
  if (error) throw new Error(error.message);

  const counts = {};
  data.forEach((tx) => {
    if (!tx.item_id) return;
    if (!counts[tx.item_id]) {
      counts[tx.item_id] = { name: tx.items?.name || 'Deleted item', assetTag: tx.items?.asset_tag || '—', count: 0 };
    }
    counts[tx.item_id].count++;
  });

  return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Most recent activity log entries, joined with actor name. */
export async function fetchRecentActivity(limit = 8) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, entity_type, details, created_at, profiles ( full_name )')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

/** Write an entry to the activity log. Fire-and-forget — never blocks the caller's main action. */
export async function logActivity(actorId, action, entityType, entityId, details = {}) {
  try {
    await supabase.from('activity_log').insert([{
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    }]);
  } catch (err) {
    console.error('Activity log write failed (non-blocking):', err.message);
  }
}
