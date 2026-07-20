// ============================================================
// ITEMS DATA MODULE
// Category field kept in DB but removed from UI.
// Department-based asset tagging: ICI-DEPT-YEAR-NNNN
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

export const STATUSES = ['available', 'borrowed', 'maintenance', 'retired'];
export const CONDITIONS = ['new', 'good', 'fair', 'damaged'];

export async function fetchItems({ search = '', status = '' } = {}) {
  let query = supabase.from('items').select('*, departments(code, name)')
    .order('created_at', { ascending: false });
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
  const { data, error } = await supabase.from('items')
    .select('*, departments(code, name)').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createItem(payload, currentUserId) {
  const { data, error } = await supabase.from('items')
    .insert([{ ...payload, added_by: currentUserId }]).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That asset tag is already in use.');
    throw new Error(error.message);
  }
  return data;
}

export async function updateItem(id, payload) {
  const { data, error } = await supabase.from('items')
    .update(payload).eq('id', id).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That asset tag is already in use.');
    throw new Error(error.message);
  }
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') throw new Error('This item has loan history and cannot be deleted. Mark it "Retired" instead.');
    throw new Error(error.message);
  }
}

export async function fetchAllItemsForInventory({ search = '' } = {}) {
  let query = supabase.from('items').select('*, departments(code, name)').order('name');
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`asset_tag.ilike.${term},name.ilike.${term},location.ilike.${term},supplier.ilike.${term}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export function isWarrantyExpiringSoon(item) {
  if (!item.warranty_expiry) return false;
  const expiry = new Date(item.warranty_expiry);
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  return expiry <= in30Days;
}
