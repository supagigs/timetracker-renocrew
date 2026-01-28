# Frappe API Key Setup

For server-side API calls in Next.js, you need to configure Frappe API keys. The application uses token-based authentication for server-side requests.

## Step 1: Generate API Key and Secret in Frappe

1. Log in to your Frappe/ERPNext instance
2. Navigate to **User** list
3. Open the user account that your Time Tracker application will use for API access
   - This should be a user with appropriate permissions (e.g., System Manager or a user with access to User, Project, and Task doctypes)
4. Click on the **Settings** tab
5. Expand the **API Access** section
6. Click on **Generate Keys**
7. A popup will display the **API Secret** - **Copy this value immediately**, as it will not be shown again
8. The **API Key** will also be displayed in the same section

## Step 2: Add Environment Variables

Add the following to your `.env.local` file in the `time-tracker-reports` directory:

```env
FRAPPE_URL=https://your-frappe-instance.com
FRAPPE_API_KEY=your_api_key_here
FRAPPE_API_SECRET=your_api_secret_here
```

**Important Notes:**
- Do NOT commit these values to version control
- Make sure `.env.local` is in your `.gitignore` file
- The API Secret is only shown once when generated - if you lose it, you'll need to regenerate new keys

## Step 3: Verify Configuration

After adding the environment variables, restart your Next.js development server:

```bash
npm run dev
```

The application will now use API key authentication for all server-side Frappe API calls, including:
- Fetching user roles
- Fetching all users (filtered by company)
- Fetching all projects (filtered by company)
- Getting user company information

## How It Works

- **Client-side login**: Uses session-based authentication (cookies) via `frappeLogin()`
- **Server-side API calls**: Uses token-based authentication (API key + secret) for all other operations

If API keys are not configured, the application will fall back to session-based auth, but this may not work reliably for server-side calls.

## Troubleshooting

If you encounter authentication errors:

1. Verify that `FRAPPE_API_KEY` and `FRAPPE_API_SECRET` are set correctly in your `.env.local` file
2. Ensure the API keys were generated for a user with appropriate permissions
3. Check that `FRAPPE_URL` is correct and accessible
4. Restart your Next.js server after adding environment variables





