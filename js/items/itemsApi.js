// ============================================================
// ITEMS DATA MODULE
// All Supabase reads/writes for the `items` table live here, so
// the page controller stays focused on UI logic only.
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

export const CATEGORIES = ['Laptop', 'Monitor', 'Cable', 'Peripheral', 'Other'];
export const STATUSES = ['available', 'borrowed', 'maintenance', 'retired'];
export const CONDITIONS = ['new', 'good', 'fair', 'damaged'];

/**
 * Fetch items, optionally filtered by search text / category / status.
 * Search matches asset_tag, name, brand, model, or serial_number.
 */
export async function fetchItems({ search = '', category = '', status = '' } = {}) {
  let query = supabase.from('items').select('*').order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `asset_tag.ilike.${term},name.ilike.${term},brand.ilike.${term},model.ilike.${term},serial_number.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchItemById(id) {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

/** Create a new item. `payload` should match the items table columns. */
export async function createItem(payload, currentUserId) {
  const { data, error } = await supabase
    .from('items')
    .insert([{ ...payload, added_by: currentUserId }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('That asset tag is already in use.');
    throw new Error(error.message);
  }
  return data;
}

export async function updateItem(id, payload) {
  const { data, error } = await supabase
    .from('items')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('That asset tag is already in use.');
    throw new Error(error.message);
  }
  return data;
}

/**
 * Delete an item. Will fail with a friendly message if the item has
 * transaction history (since transactions reference items with
 * `on delete restrict` — this is intentional, to preserve audit trail).
 */
export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error('This item has loan history and can\'t be deleted. Mark it "Retired" instead.');
    }
    throw new Error(error.message);
  }
}

/**
 * Fetch all items for the Inventory module view (no status/category
 * filtering — inventory cares about every item regardless of loan state).
 */
export async function fetchAllItemsForInventory({ search = '' } = {}) {
  let query = supabase.from('items').select('*').order('name');

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`asset_tag.ilike.${term},name.ilike.${term},location.ilike.${term},supplier.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** True if an item's warranty expires within the next 30 days (or has already expired). */
export function isWarrantyExpiringSoon(item) {
  if (!item.warranty_expiry) return false;
  const expiry = new Date(item.warranty_expiry);
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  return expiry <= in30Days;
}

/**
 * Suggest the next asset tag for a category, e.g. "LAP-0007".
 * Looks at existing tags sharing the category's prefix and increments.
 * Best-effort — admin can always override the suggested value.
 */
const CATEGORY_PREFIX = {
  Laptop: 'LAP',
  Monitor: 'MON',
  Cable: 'CAB',
  Peripheral: 'PER',
  Other: 'OTH',
};

export async function suggestAssetTag(category) {
  const prefix = CATEGORY_PREFIX[category] || 'AST';
  const { data, error } = await supabase
    .from('items')
    .select('asset_tag')
    .ilike('asset_tag', `${prefix}-%`)
    .order('asset_tag', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return `${prefix}-0001`;
  }

  const lastNum = parseInt(data[0].asset_tag.split('-')[1], 10) || 0;
  return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}
