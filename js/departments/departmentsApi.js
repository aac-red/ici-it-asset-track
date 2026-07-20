// ============================================================
// DEPARTMENTS DATA MODULE
// ============================================================
import { supabase } from '../shared/supabaseClient.js';

export const COMPANY_PREFIX = 'ICI';

/** Fetch all departments ordered by name. */
export async function fetchDepartments({ activeOnly = false } = {}) {
  let query = supabase
    .from('departments')
    .select('*')
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function createDepartment({ code, name }) {
  const { data, error } = await supabase
    .from('departments')
    .insert([{ code: code.toUpperCase().trim(), name: name.trim() }])
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`Code "${code}" already exists.`);
    throw new Error(error.message);
  }
  return data;
}

export async function updateDepartment(code, { name }) {
  const { error } = await supabase
    .from('departments')
    .update({ name: name.trim() })
    .eq('code', code);
  if (error) throw new Error(error.message);
}

export async function setDepartmentActive(code, isActive) {
  const { error } = await supabase
    .from('departments')
    .update({ is_active: isActive })
    .eq('code', code);
  if (error) throw new Error(error.message);
}

/**
 * Suggest the next asset tag for a department.
 * Format: ICI-[DEPT]-[YEAR]-[NNNN]
 */
export async function suggestAssetTag(departmentCode) {
  const year = new Date().getFullYear();
  const prefix = `${COMPANY_PREFIX}-${departmentCode}-${year}-`;
  const { data, error } = await supabase
    .from('items')
    .select('asset_tag')
    .ilike('asset_tag', `${prefix}%`)
    .order('asset_tag', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return `${prefix}0001`;
  const lastSeries = parseInt(data[0].asset_tag.split('-').pop(), 10) || 0;
  return `${prefix}${String(lastSeries + 1).padStart(4, '0')}`;
}
