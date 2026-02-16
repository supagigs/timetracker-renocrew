# Duplicate / Similar Code Analysis

Summary of files that share similar code or functionality. Consolidation is optional but would reduce maintenance and drift.

---

## 1. **formatTime (HH:MM:SS)** — 4 implementations

| File | What it does |
|------|----------------|
| **utils.js** | `TimeUtils.formatTime(seconds)` — canonical HH:MM:SS, exposed globally |
| **projects.js** | Local `formatTime()` — same plus “days” format for very large values (e.g. `2d 03:45:00`) |
| **startProject.js** | Local `formatTime()` — same as utils + NaN/negative → `'00:00:00'` |
| **report.js** | Local `formatTime()` — same logic, minor difference (no `Math.floor` on secs) |

**Recommendation:** Use `TimeUtils.formatTime(seconds)` everywhere. projects.js can either extend it (e.g. `TimeUtils.formatTimeWithDays(seconds)`) or keep a thin wrapper that delegates to `TimeUtils.formatTime` for normal range and adds the “Xd HH:MM:SS” case for large values. All screens already load `utils.js`, so no HTML changes needed.

---

## 2. **session:remote-logout handler** — 4 copies

Same pattern in:

- **home.js** (wraps in `performLogout({ skipConfirm: true, remote: true })`)
- **report.js**
- **displayName.js**

Each: show warning → SessionSync clear → remove user storage keys → `location.href = 'login.html'`.

**Recommendation:** Add a shared helper, e.g. in **sessionSync.js** or **utils.js**: `handleRemoteLogout()` that does the clear + redirect. Each screen calls that (home.js can still call `performLogout` after if needed). Reduces duplication and keeps behavior in one place.

---

## 3. **Loading projects from Frappe** — 3 call sites

| File | Usage |
|------|--------|
| **projects.js** | `loadProjects()` → `getUserProjects()` → enrich with Supabase time_sessions → render list |
| **login.js** | `getUserProjects()` (e.g. for post-login checks) |

Same API, different UI and follow-up logic. Not full duplication, but the **Frappe call + error handling** could be a small shared helper (e.g. `FrappeService.getUserProjects()` or a wrapper in a shared module) if you want one place for “get user projects + handle API errors”.

---

## 4. **Redirect helpers** — local in selectTask only

**selectTask.js** defines:

- `redirectToProjects()` → `window.location.href = 'projects.html'`
- `redirectToLogin()` → `window.location.href = 'login.html'`

Other scripts do the same redirects inline. Optional: move these to a small **navigation** or **routes** helper (e.g. in utils or a `navigation.js`) so all screens use the same paths and names.

---

## 5. **Date/time display** — similar pattern, different screens

- **clockIn.js**: `updateDateTime()` → `toLocaleDateString()` / `toLocaleTimeString()`, `setInterval(..., 1000)`
- **createTimesheet.js**: one-off `now.toLocaleDateString()` / `toLocaleTimeString()` for header

Only clockIn has a live clock. No strong duplication; could share a tiny “format current date/time for header” helper if you want consistency.

---

## 6. **Screens vs scripts** — no redundant screens

- **clockIn** → project (and task) selection → **selectTask** → **createTimesheet** → **startProject** (timer).
- **projects** → pick project → **startProject** (timer).

Different entry points (home “Clock In” vs “Projects”), different UIs (dropdown vs cards). No two screens duplicate the same flow; no suggestion to remove a screen.

---

## Summary table

| Category | Files | Action idea |
|----------|--------|-------------|
| formatTime | utils, projects, startProject, report | Use `TimeUtils.formatTime` (+ optional `formatTimeWithDays` in projects) |
| session:remote-logout | clockIn, home, report, displayName | Shared `handleRemoteLogout()` (or similar) in one module |
| getUserProjects | clockIn, projects, login | Optional: shared “get user projects” wrapper |
| Redirects | selectTask (and inline elsewhere) | Optional: shared navigation helpers |

No other file pairs have the same level of overlap as the old **tracker.js vs startProject.js**; the remaining duplicates are mostly small helpers (formatTime, logout, redirects) that can be centralized when you refactor.
