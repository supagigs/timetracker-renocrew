import { createServerSupabaseClient } from './supabaseServer';
import { getFrappeCurrentUserRoleProfile, getFrappeRoleProfileForEmail } from './frappeClient';

export type UserProfile = {
  id: number | null;
  email: string;
  displayName: string | null;
  role: string | null;
  company: string | null;
};

/**
 * Fetch user profile from Supabase, and if display_name is missing, fetch it from Frappe
 * This ensures the manager's name is always displayed in all tabs
 */
export async function fetchUserProfile(email: string): Promise<UserProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, display_name, role, company')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[userProfile] Failed to fetch profile:', error.message || JSON.stringify(error));
    return null;
  }

  if (!data) {
    return null;
  }

  let displayName = data.display_name ?? null;
  
  // If display_name is null, try to fetch it from Frappe
  if (!displayName) {
    try {
      // Try to get full name from Frappe using API key auth
      const { createFrappeClient } = await import('@/lib/frappeClient');
      const frappe = createFrappeClient(true); // Use API key auth
      
      // Try to get user's full name from Frappe User doctype
      try {
        const userRes = await frappe.get('/api/resource/User', {
          params: {
            fields: JSON.stringify(['name', 'full_name']),
            filters: JSON.stringify([['name', '=', normalizedEmail]]),
            limit_page_length: 1,
          },
        });
        
        const users = userRes?.data?.data || [];
        if (users.length > 0 && users[0]?.full_name) {
          displayName = users[0].full_name;
        }
      } catch (directQueryErr) {
        // If direct query fails (Frappe might block it), try getAllFrappeUsers as fallback
        console.warn('[userProfile] Direct User query failed, trying getAllFrappeUsers:', directQueryErr);
        const { getAllFrappeUsers } = await import('@/lib/frappeClient');
        const frappeUsers = await getAllFrappeUsers();
        const frappeUser = frappeUsers.find(u => u.email.toLowerCase() === normalizedEmail);
        if (frappeUser?.full_name) {
          displayName = frappeUser.full_name;
        }
      }
      
      // Update Supabase with the fetched display name for future use
      if (displayName) {
        await supabase
          .from('users')
          .update({ display_name: displayName })
          .eq('email', normalizedEmail)
          .catch(err => {
            // Non-fatal - just log the error
            console.warn('[userProfile] Failed to update display_name in Supabase:', err);
          });
      }
    } catch (err) {
      // Non-fatal - just log the error and continue with null displayName
      console.warn('[userProfile] Failed to fetch display name from Frappe:', err);
    }
  }

  return {
    id: typeof data.id === 'number' ? data.id : null,
    email: data.email,
    displayName: displayName,
    role: data.role ?? null,
    company: data.company ?? null,
  };
}















