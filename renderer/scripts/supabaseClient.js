// Supabase client initialization with proper error handling
const SUPABASE_URL = window.env?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.env?.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase environment variables not found');
  console.error('SUPABASE_URL:', SUPABASE_URL ? 'Present' : 'Missing');
  console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Present' : 'Missing');
  
  // Show user-friendly error message
  if (typeof document !== 'undefined') {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ff4444;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      text-align: center;
    `;
    errorDiv.innerHTML = `
      <strong>Configuration Error</strong><br>
      Missing Supabase environment variables.<br>
      Please create a .env file with your Supabase credentials.
    `;
    document.body.appendChild(errorDiv);
  }
} else {
  // Initialize Supabase client
  try {
    // Check if supabase is available globally
    if (typeof supabase === 'undefined') {
      throw new Error('Supabase library not loaded');
    }
    
    window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: {
        schema: 'public',
      },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      },
      global: {
        headers: { 'x-my-custom-header': 'my-app-name' },
      },
    });
    console.log('Supabase client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    
    if (typeof document !== 'undefined') {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message error';
      errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4444;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        text-align: center;
      `;
      errorDiv.textContent = 'Failed to connect to database. Please try again.';
      document.body.appendChild(errorDiv);
    }
  }
}
