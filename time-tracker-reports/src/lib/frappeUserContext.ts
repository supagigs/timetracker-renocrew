import { createServerSupabaseClient } from '@/lib/supabaseServer';

/**
 * Sync user context from Frappe and cache it in Supabase
 * This fetches the current user's profile from Frappe and stores it in user_context table
 * 
 * Note: This requires a whitelisted Frappe method: get_current_user_context
 * Add this to your Frappe instance:
 * 
 * @frappe.whitelist()
 * def get_current_user_context():
 *     user = frappe.session.user
 *     if user == "Guest":
 *         return None
 *     user_doc = frappe.get_doc("User", user)
 *     employee = frappe.db.get_value("Employee", {"user_id": user}, "company")
 *     return {
 *         "email": user_doc.email,
 *         "full_name": user_doc.full_name,
 *         "role_profile": user_doc.role_profile_name,
 *         "company": employee
 *     }
 */
export async function syncUserContextFromFrappe() {
  const frappeUrl = process.env.FRAPPE_URL;
  if (!frappeUrl) {
    throw new Error('FRAPPE_URL is not configured');
  }

  const baseURL = frappeUrl.replace(/\/$/, '');

  const res = await fetch(`${baseURL}/api/method/get_current_user_context`, {
    credentials: 'include', // VERY IMPORTANT - required for session-based auth
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user context from Frappe: ${res.statusText}`);
  }

  const json = await res.json();
  const context = json.message;

  if (!context?.email) {
    throw new Error('Invalid user context from Frappe');
  }

  const supabase = createServerSupabaseClient();

  // Upsert user context to cache
  const { error: upsertError } = await supabase
    .from('user_context')
    .upsert(
      {
        email: context.email,
        full_name: context.full_name || null,
        role_profile: context.role_profile || null,
        company: context.company || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'email',
      }
    );

  if (upsertError) {
    console.error('[frappeUserContext] Failed to upsert user context:', upsertError);
    // Don't throw - return context even if cache update fails
  }

  return context;
}

