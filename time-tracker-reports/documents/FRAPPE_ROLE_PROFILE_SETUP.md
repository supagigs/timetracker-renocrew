# Frappe Role Profile Setup

This document explains how to set up Frappe whitelisted methods to get user role profiles correctly.

## Why Role Profile?

In Frappe/ERPNext:
- **Role Profile** is stored in `User.role_profile_name` field
- **Roles list** (from Has Role doctype) is different from Role Profile
- To check "Is this user a SuperAdmin?", use `role_profile_name`

## Required Frappe Methods

You need to add these whitelisted methods to your Frappe instance.

### Method 1: get_current_user_profile (Session-based, Recommended)

**Location:** Add to a Python file in your Frappe app (e.g., `hooks.py` or a custom app)

```python
import frappe

@frappe.whitelist()
def get_current_user_profile():
    """
    Get current logged-in user's profile including role_profile_name
    Uses session-based authentication - secure and recommended
    """
    user = frappe.session.user
    
    if user == "Guest":
        return None
    
    user_doc = frappe.get_doc("User", user)
    
    return {
        "email": user_doc.email,
        "full_name": user_doc.full_name,
        "role_profile": user_doc.role_profile_name
    }
```

**Usage:** Called automatically by Next.js during login with `credentials: 'include'`

### Method 2: get_user_role_profile_by_email (API key-based, Fallback)

**Location:** Same as above

```python
import frappe

@frappe.whitelist()
def get_user_role_profile_by_email(email):
    """
    Get role_profile_name for a specific user email
    Uses API key authentication - fallback when session is not available
    """
    return frappe.get_value(
        "User",
        email,
        "role_profile_name"
    )
```

**Usage:** Used by sync scripts and when session is not available

## How to Add These Methods

### Option 1: Custom Frappe App (Recommended)

1. Create a custom app in Frappe (if you don't have one)
2. Create a Python file (e.g., `custom_app/api/user_profile.py`)
3. Add the methods above
4. The methods will be automatically whitelisted

### Option 2: Add to hooks.py

1. Open your Frappe app's `hooks.py`
2. Add the methods to a module that's imported
3. Or create a new file and import it in `hooks.py`

### Option 3: Add via Frappe Console

1. Go to Frappe → Tools → Console
2. Run the Python code to add the methods
3. Note: This is temporary and will be lost on restart

## Verification

After adding the methods, test them:

### Test Method 1 (Session-based):
```bash
# From your browser console (after logging into Frappe)
fetch('https://your-frappe-instance.com/api/method/get_current_user_profile', {
  credentials: 'include'
}).then(r => r.json()).then(console.log)
```

Expected response:
```json
{
  "message": {
    "email": "user@example.com",
    "full_name": "User Name",
    "role_profile": "SuperAdmin"
  }
}
```

### Test Method 2 (API key-based):
```bash
curl -X GET "https://your-frappe-instance.com/api/method/get_user_role_profile_by_email?email=user@example.com" \
  -H "Authorization: token YOUR_API_KEY:YOUR_API_SECRET"
```

Expected response:
```json
{
  "message": "SuperAdmin"
}
```

## How the Application Uses These

### During Login (Next.js)
- Calls `get_current_user_profile` with session cookies
- Checks if `role_profile === 'SuperAdmin'`
- Sets user role in Supabase accordingly

### During Sync (Script)
- Calls `get_user_role_profile_by_email` with API key
- Updates all users' roles in Supabase based on their role_profile_name

## Important Notes

1. **credentials: 'include'** is mandatory for session-based calls
   - Without it, Frappe sees the user as Guest
   - This is set automatically in the Next.js code

2. **Role Profile ≠ Roles List**
   - Don't use `frappe.get_roles(user)` - this returns roles list, not role profile
   - Don't query Has Role doctype - this is different from role profile

3. **API Key User ≠ Logged-in User**
   - API key auth uses a different user context
   - For web UI, always use session-based auth

## Troubleshooting

### Error: "Method not found"
- Make sure the methods are whitelisted with `@frappe.whitelist()`
- Check that the methods are in a module that's loaded by Frappe
- Restart Frappe bench if needed

### Error: "Guest user" or returns None
- For session-based calls, ensure `credentials: 'include'` is set
- Check that cookies are being sent with the request
- Verify the user is actually logged into Frappe

### Error: "Field not permitted"
- API key user might not have permission to read `role_profile_name`
- Check API key user's permissions in Frappe
- Consider using the whitelisted method instead of direct resource API

