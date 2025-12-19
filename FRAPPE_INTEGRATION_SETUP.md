# Frappe/ERPNext Integration Setup

This document describes the Frappe integration changes made to the Time Tracker application.

## Overview

The application now uses Frappe/ERPNext for authentication and project management instead of Supabase user management. Only users existing in Frappe can log in, and only projects assigned to them in Frappe are displayed.

## Environment Variables

Add the following to your `.env` file:

```env
FRAPPE_URL=https://your-frappe-instance.com
```

**Important**: Make sure `FRAPPE_URL` points to your Frappe/ERPNext instance without a trailing slash.

## Changes Made

### 1. New Files Created

- **`frappeClient.js`**: HTTP client with session-based authentication using cookies
- **`frappeAuth.js`**: Authentication functions (login, logout, getCurrentUser)
- **`frappeService.js`**: Service functions to fetch user projects from Frappe

### 2. Modified Files

#### `package.json`
- Added dependencies: `axios`, `tough-cookie`, `axios-cookiejar-support`

#### `main.js`
- Added Frappe module imports
- Added IPC handlers:
  - `auth:login` - Handle user login
  - `auth:logout` - Handle user logout
  - `auth:me` - Get current logged-in user
  - `frappe:get-user-projects` - Fetch projects assigned to user

#### `preload.js`
- Added `window.auth` API with `login()`, `logout()`, `me()`
- Added `window.frappe` API with `getUserProjects()`

#### `renderer/screens/login.html`
- Added password input field
- Removed category dropdown and projects section (no longer needed)
- Added error message display element

#### `renderer/scripts/login.js`
- Completely rewritten to use Frappe authentication
- Removed Supabase user creation/checking logic
- Now validates email and password, then calls `window.auth.login()`

#### `renderer/scripts/clockIn.js`
- Updated `loadAssignedProjects()` to fetch projects from Frappe using `window.frappe.getUserProjects()`
- Removed Supabase project assignment queries

#### `renderer/styles/common.css`
- Added `.auth-error-message` styling for login error display

## How It Works

### Login Flow

1. User enters email and password in login screen
2. `handleLogin()` in `login.js` calls `window.auth.login(email, password)`
3. This triggers IPC handler `auth:login` in `main.js`
4. Main process calls `frappeLogin()` which posts to `/api/method/login` in Frappe
5. If successful, session cookie is stored in the cookie jar
6. User email is stored in localStorage and user is redirected

### Project Loading

1. When user clicks "Clock In", `loadAssignedProjects()` is called
2. It calls `window.frappe.getUserProjects()` via IPC
3. Main process calls `frappeGetUserProjects()` which:
   - Gets current user from Frappe session
   - Queries `/api/resource/Task` with filter `assigned_to = userEmail`
   - Extracts unique projects from tasks
   - Returns array of `{id, name}` objects
4. Projects are displayed in dropdown

## Frappe API Endpoints Used

- `POST /api/method/login` - User login
- `GET /api/method/logout` - User logout  
- `GET /api/method/frappe.auth.get_logged_user` - Get current user
- `GET /api/resource/Task` - Get tasks/projects assigned to user

## Customization

### Adjusting Project Fetching

If your Frappe setup uses a different doctype for projects, modify `frappeService.js`:

```javascript
// For example, if using Project doctype directly:
const res = await frappe.get('/api/resource/Project', {
  params: {
    filters: JSON.stringify([
      ['project_manager', '=', userEmail], // or your field
    ]),
    fields: JSON.stringify(['name', 'project_name']),
  },
});
```

### Session Management

Sessions are managed via cookies in the `frappeClient.js` cookie jar. The session persists while the app is running and is cleared on logout or app restart.

## Testing

1. Ensure `FRAPPE_URL` is set in `.env`
2. Start the app: `npm start`
3. Try logging in with valid Frappe credentials
4. Check that projects assigned to the user appear in the dropdown

## Troubleshooting

### "Authentication service not available"
- Make sure IPC handlers are registered in `main.js`
- Check that `preload.js` exposes `window.auth` API

### "No projects assigned"
- Verify user is assigned to tasks/projects in Frappe
- Check Frappe API response in console logs
- Adjust filters in `frappeService.js` if needed

### Login fails
- Check `FRAPPE_URL` is correct
- Verify user exists in Frappe
- Check network connectivity to Frappe instance
- Review console logs for detailed error messages

