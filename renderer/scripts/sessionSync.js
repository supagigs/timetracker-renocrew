(function () {
  if (window.SessionSync) {
    return;
  }

  const SessionSync = {
    email: null,
    channel: null,
    logoutHandler: null,

    get client() {
      return window.supabase || null;
    },

    setEmail(email) {
      if (!email || typeof email !== 'string') {
        return;
      }
      const normalized = email.trim().toLowerCase();
      if (this.email === normalized) {
        return;
      }
      this.email = normalized;
      this.subscribe();
    },

    async updateAppState(loggedIn) {
      if (!this.client || !this.email) {
        return;
      }

      try {
        const { data: existing, error: fetchError } = await this.client
          .from('user_sessions')
          .select('web_logged_in, app_logged_in')
          .eq('email', this.email)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        const payload = {
          email: this.email,
          app_logged_in: !!loggedIn,
          web_logged_in: existing?.web_logged_in ?? false,
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await this.client
          .from('user_sessions')
          .upsert(payload);

        if (upsertError) {
          throw upsertError;
        }
      } catch (error) {
        console.error('[SessionSync] Failed to update app session state:', error);
      }
    },

    subscribe() {
      if (!this.client || !this.email) {
        return;
      }

      if (this.channel) {
        this.client.removeChannel(this.channel);
        this.channel = null;
      }

      this.channel = this.client
        .channel(`user-session-app-${this.email}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_sessions',
            filter: `email=eq.${this.email}`,
          },
          (payload) => {
            const oldWeb = payload.old?.web_logged_in ?? null;
            const newWeb = payload.new?.web_logged_in ?? null;

            if (newWeb === false && oldWeb !== newWeb) {
              this.triggerRemoteLogout('web');
            }
          },
        );

      this.channel.subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[SessionSync] Channel error:', err);
        }
      });
    },

    triggerRemoteLogout(source) {
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
      if (this.channel && this.client) {
        this.client.removeChannel(this.channel);
      }
      this.channel = null;
      this.email = null;
    },
  };

  window.SessionSync = SessionSync;
})();


