import { supabase } from './supabase';

/** Grup WhatsApp per bidang. RLS hanya membuka isinya untuk member yang sudah onboarding. Melempar kalau gagal dimuat. */
export async function fetchWhatsappGroups() {
  const { data, error } = await supabase().from('whatsapp_groups').select('*').order('sort_order').order('created_at');
  if (error) throw error;
  return data ?? [];
}
