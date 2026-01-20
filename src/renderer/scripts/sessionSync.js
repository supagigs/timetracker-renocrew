(function () {
  if (window.SessionSync) {
    return;
  }

  // SessionSync is now a no-op since we're using Frappe authentication
  // This keeps the API available for backward compatibility but doesn't try to sync with Supabase
  const SessionSync = {
    email: null,
    channel: null,
    logoutHandler: null,

    setEmail(email) {
      // Store email but don't subscribe to Supabase channels
      if (!email || typeof email !== 'string') {
        return;
      }
      const normalized = email.trim().toLowerCase();
      this.email = normalized;
      // No-op: Previously subscribed to Supabase realtime channels
    },

    async updateAppState(loggedIn) {
      // No-op: Previously synced session state with Supabase user_sessions table
      // With Frappe, session management is handled server-side
      return Promise.resolve();
    },

    subscribe() {
      // No-op: Previously subscribed to Supabase realtime channels
    },

    triggerRemoteLogout(source) {
      // Still dispatch event in case other code listens for it
      if (typeof this.logoutHandler === 'function') {
        try {
          this.logoutHandler(source);
        } catch (error) {
          console.error('[SessionSync] Logout handler error:', error);
        }
      }

      window.dispatchEvent(
        new CustomEvent('session:remote-logout', {
          detail: { source },
        }),
      );
    },

    setLogoutHandler(handler) {
      this.logoutHandler = handler;
    },

    clear() {
      // No-op: Previously cleaned up Supabase channels
      this.channel = null;
      this.email = null;
    },
  };

  window.SessionSync = SessionSync;
})();


