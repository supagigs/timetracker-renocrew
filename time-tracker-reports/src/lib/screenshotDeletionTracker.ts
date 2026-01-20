/**
 * Utility functions to track screenshot deletions
 * Tracks deletions per day, per session, and per month
 */

export interface DeletionStats {
  perDay: number;
  perSession: number;
  perMonth: number;
}

interface DeletionRecord {
  screenshotId: number;
  sessionId: number;
  userEmail: string; // User who owns the screenshot
  deletedAt: string; // ISO timestamp
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
}

const STORAGE_KEY = 'screenshot_deletions';
const SESSION_STORAGE_KEY = 'screenshot_deletions_session';

/**
 * Get all deletion records from localStorage
 */
function getDeletionRecords(): DeletionRecord[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const records = JSON.parse(stored) as any[];
    
    // Filter out old records without userEmail (migration from old format)
    // and records older than 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const validRecords = records.filter(r => {
      // Only include records with userEmail (new format)
      if (!r.userEmail) return false;
      // Only include records not older than 6 months
      if (new Date(r.deletedAt) < sixMonthsAgo) return false;
      return true;
    }) as DeletionRecord[];
    
    // If we filtered out records, save the cleaned version
    if (validRecords.length !== records.length) {
      saveDeletionRecords(validRecords);
    }
    
    return validRecords;
  } catch (error) {
    console.error('Error reading deletion records:', error);
    return [];
  }
}

/**
 * Save deletion records to localStorage
 */
function saveDeletionRecords(records: DeletionRecord[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('Error saving deletion records:', error);
  }
}

/**
 * Get current session ID (for per-session tracking)
 */
function getCurrentSessionId(): string {
  if (typeof window === 'undefined') return 'default';
  
  try {
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch (error) {
    console.error('Error getting session ID:', error);
    return 'default';
  }
}

/**
 * Record a screenshot deletion
 */
export function recordDeletion(screenshotId: number, sessionId: number, userEmail: string): void {
  if (typeof window === 'undefined') {
    console.warn('[recordDeletion] Cannot record deletion: window is undefined');
    return;
  }

  if (!userEmail) {
    console.warn('[recordDeletion] Cannot record deletion: userEmail is required');
    return;
  }

  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const month = date.substring(0, 7); // YYYY-MM
  
  const record: DeletionRecord = {
    screenshotId,
    sessionId,
    userEmail: userEmail.toLowerCase().trim(), // Normalize email
    deletedAt: now.toISOString(),
    date,
    month,
  };
  
  const records = getDeletionRecords();
  records.push(record);
  saveDeletionRecords(records);
  
  console.log('[recordDeletion] Recorded deletion:', {
    screenshotId,
    sessionId,
    userEmail: record.userEmail,
    date,
    month,
    totalRecords: records.length,
  });
}

/**
 * Get deletion statistics for a specific user
 */
export function getDeletionStats(userEmail: string): DeletionStats {
  if (typeof window === 'undefined') {
    return { perDay: 0, perSession: 0, perMonth: 0 };
  }

  if (!userEmail) {
    return { perDay: 0, perSession: 0, perMonth: 0 };
  }

  const normalizedEmail = userEmail.toLowerCase().trim();
  const records = getDeletionRecords().filter(r => r.userEmail === normalizedEmail);
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const thisMonth = today.substring(0, 7); // YYYY-MM
  const currentSessionId = getCurrentSessionId();
  
  // Per day: count deletions today for this user
  const perDay = records.filter(r => r.date === today).length;
  
  // Per session: count deletions in current browser session for this user
  // We use sessionStorage to track this session's deletions
  let perSession = 0;
  try {
    const sessionDeletions = sessionStorage.getItem(`session_deletions_${currentSessionId}_${normalizedEmail}`);
    if (sessionDeletions) {
      perSession = parseInt(sessionDeletions, 10) || 0;
    }
  } catch (error) {
    console.error('Error reading session deletions:', error);
  }
  
  // Per month: count deletions this month for this user
  const perMonth = records.filter(r => r.month === thisMonth).length;
  
  const stats = { perDay, perSession, perMonth };
  console.log('[getDeletionStats] Stats for', normalizedEmail, ':', { ...stats, totalRecords: records.length, today, thisMonth });
  
  return stats;
}

/**
 * Get deletion statistics for a specific session ID (database session) for a specific user
 */
export function getSessionDeletionStats(sessionId: number, userEmail: string): number {
  if (!userEmail || !sessionId) return 0;
  
  const normalizedEmail = userEmail.toLowerCase().trim();
  const records = getDeletionRecords().filter(r => r.userEmail === normalizedEmail);
  // Compare session IDs, handling both number and string types
  return records.filter(r => {
    // Convert both to numbers for comparison to handle any type mismatches
    const recordSessionId = typeof r.sessionId === 'number' ? r.sessionId : parseInt(String(r.sessionId), 10);
    const targetSessionId = typeof sessionId === 'number' ? sessionId : parseInt(String(sessionId), 10);
    return !isNaN(recordSessionId) && !isNaN(targetSessionId) && recordSessionId === targetSessionId;
  }).length;
}

/**
 * Update session deletion count for a specific user
 */
export function incrementSessionDeletionCount(userEmail: string): void {
  if (typeof window === 'undefined') return;
  if (!userEmail) return;
  
  try {
    const normalizedEmail = userEmail.toLowerCase().trim();
    const currentSessionId = getCurrentSessionId();
    const key = `session_deletions_${currentSessionId}_${normalizedEmail}`;
    const current = sessionStorage.getItem(key);
    const count = current ? parseInt(current, 10) + 1 : 1;
    sessionStorage.setItem(key, count.toString());
  } catch (error) {
    console.error('Error incrementing session deletion count:', error);
  }
}

/**
 * Reset session deletion count (useful for testing or manual reset)
 */
export function resetSessionDeletionCount(userEmail?: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const currentSessionId = getCurrentSessionId();
    if (userEmail) {
      const normalizedEmail = userEmail.toLowerCase().trim();
      const key = `session_deletions_${currentSessionId}_${normalizedEmail}`;
      sessionStorage.removeItem(key);
    } else {
      // Remove all session deletion counts for this session
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith(`session_deletions_${currentSessionId}_`)) {
          sessionStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.error('Error resetting session deletion count:', error);
  }
}

