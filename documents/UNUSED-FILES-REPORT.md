# Unused / Optional Files Report

Files that are not required for the current mobile-only flow (Login → Projects → Timer).

---

## 1. Orphan screens — REMOVED

The following were removed (no navigation to them in the app):

- **renderer/screens/report.html** — "View Reports" opens the external Next.js site, not this page.
- **renderer/scripts/report.js** — Script for the removed report screen.
- **renderer/screens/displayName.html** — Display name is set from login/Supabase; no link to this screen.
- **renderer/scripts/displayName.js** — Script for the removed displayName screen.

---

## 2. Duplicate file — REMOVED

- **BUILD-DMG-MAC.md** (project root) was removed. The copy in **documents/BUILD-DMG-MAC.md** is kept.

---

## 3. Outdated documentation

| File | Issue |
|------|--------|
| **documents/FRAPPE_INTEGRATION_SETUP.md** | Still describes `renderer/scripts/clockIn.js` and "Clock In" → project loading. That flow was removed. |
| **documents/DUPLICATE-CODE-ANALYSIS.md** | Still references selectTask, clockIn, createTimesheet, tracker. Update or trim to reflect current flow. |

---

## 4. Files that are used (keep)

- **login.html** + login.js — entry point
- **projects.html** + projects.js — project list after login
- **startProject.html** + startProject.js — timer screen
- **home.html** + home.js — hub (Start, View Reports, Logout; Return to Timer when active)
- **assets/toast.html** — loaded by main for toasts
- All other renderer scripts (utils, sessionSync, idleTracker, supabaseClient, etc.) are referenced by the screens above.
