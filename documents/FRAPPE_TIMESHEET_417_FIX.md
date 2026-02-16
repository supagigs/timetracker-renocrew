# Fixing 417 Errors for get_or_create_timesheet and start_timesheet_session

The Time Tracker app calls two Frappe API methods:

- **POST /api/method/get_or_create_timesheet** — get or create a timesheet (and row) for a project
- **POST /api/method/start_timesheet_session** — set `from_time` on a timesheet row to “start” the session

When these return **HTTP 417** with `UpdateAfterSubmitError` (“Not allowed to change Time Sheets after submission”), it is because **Frappe is blocking an update to a document it considers submitted**. The client app already has workarounds (reuse draft, treat “already started” as success), but the **root fix is on the Frappe server**.

---

## Why 417 Happens

1. **Submitted document**  
   Frappe does not allow changing a document after it is **Submitted** (`docstatus == 1`). If your script loads a timesheet that is submitted and then modifies it (e.g. appending a row or changing a row), `doc.save()` will raise `UpdateAfterSubmitError` and the API returns 417.

2. **Wrong document or docstatus**  
   The script might be loading a **different** timesheet (e.g. another user’s or an old submitted one) instead of the **draft** timesheet for the current user/project. Or it might be using a timesheet that was submitted in the DB while the UI still shows “Draft” (e.g. cache or amended doc).

3. **Unnecessary save**  
   In **start_timesheet_session**, if the row already has `from_time` set and `to_time` null, updating and saving again can still trigger validations (e.g. “update after submit” if the script or framework treats the doc as submitted).

---

## Where the logic lives

Your stack trace showed:

```text
File "<serverscript>: get_or_create_timesheet", line 78
```

So the logic is in a **Frappe Server Script** (Setup → Server Script, or Customization → Server Script), not in a Python app in this repo. You need to edit that Server Script (or replace it with a whitelisted Python method) on your **Frappe/ERPNext** instance.

---

## 1. Fix get_or_create_timesheet (Server Script or Python)

**Goal:** For the given project (and optional task), return a **draft** timesheet and a row that can be used for timing. Never modify a **submitted** timesheet.

- **If you find an existing timesheet for the project (and user):**
  - If it is **Draft** (`docstatus == 0`):
    - If there is already an **open** row (e.g. `to_time` is null or `completed != 1`), return that timesheet name and row id; **do not add a new row and do not save** unless you actually add a row.
    - If there is no open row, add one row, then save. Only do this when the doc is **Draft**.
  - If it is **Submitted** (`docstatus == 1`):
    - Do **not** modify it. Create a **new** draft timesheet for the same project (and task), add one row, save, and return the new timesheet name and new row id.

- **If no timesheet exists:**  
  Create a new draft timesheet, add one row, save, return its name and row id.

- **Before any `doc.save()`:**  
  Check `doc.docstatus == 0`. If it is not 0, do not save that doc; create a new draft instead (as above).

**Pseudocode (conceptual):**

```python
# get_or_create_timesheet(project, task=None)
# 1) Find existing timesheet for this user + project (Draft only, or include Submitted to decide)
# 2) If found and docstatus == 0 (Draft):
#    - Find row with to_time is None (open row)
#    - If found: return {"timesheet": doc.name, "row": row.name}  # no save
#    - If not found: append one row, doc.save(), return new row
# 3) If found and docstatus == 1 (Submitted): do NOT modify; create new draft timesheet, add row, save, return new name/row
# 4) If not found: create new draft timesheet, add row, save, return name/row
```

Adjust your Server Script (or Python method) so it never calls `save()` on a submitted timesheet and never adds a row to a submitted timesheet.

---

## 2. Fix start_timesheet_session (Server Script or Python)

**Goal:** Mark the given timesheet row as “session started” by setting `from_time` (and leave `to_time` null). Avoid 417 by not updating submitted docs and by skipping no-op updates.

- Load the timesheet by name; get the row by id (e.g. from `time_logs`).
- **If the timesheet is submitted** (`docstatus != 0`):  
  Do not modify it. Return a clear error (e.g. “Timesheet is submitted; cannot start session”) or return 4xx with a clear message. The client can then create a new draft (your client already has logic for that).

- **If the row already has `from_time` set and `to_time` is null:**  
  Treat as “already started”. Return success **without** calling `doc.save()`. That avoids unnecessary save and possible 417.

- **If the row is open and `from_time` is not set:**  
  Set `from_time` (e.g. to `frappe.utils.now_datetime()`), then `doc.save()`.

**Pseudocode (conceptual):**

```python
# start_timesheet_session(timesheet, row)
# 1) doc = frappe.get_doc("Timesheet", timesheet)
# 2) If doc.docstatus != 0: return error "Timesheet is submitted"
# 3) Find time_log where time_log.name == row
# 4) If row.from_time is set and row.to_time is None: return success (no save)
# 5) Set row.from_time = frappe.utils.now_datetime()
# 6) doc.save()
# 7) return success
```

---

## 3. Use Python instead of Server Script (recommended)

Server Scripts run in a restricted environment and can be harder to debug. For stable, maintainable behavior:

1. In your **custom Frappe app**, add a Python file (e.g. `your_app/timesheet_api.py`).
2. Define whitelisted methods, e.g.:

```python
import frappe

@frappe.whitelist()
def get_or_create_timesheet(project, task=None):
    # Implement logic above: only modify draft; for submitted, create new draft
    ...

@frappe.whitelist()
def start_timesheet_session(timesheet, row):
    # Implement logic above: check docstatus; skip save if row already started
    ...
```

3. In **hooks.py**, ensure the app is loaded.
4. **Disable or remove** the existing Server Scripts that implement these names so the API uses the Python methods instead.
5. Restart bench: `bench restart`.

Then the same URLs (`/api/method/get_or_create_timesheet`, `/api/method/start_timesheet_session`) will call your Python code and you can avoid 417 by never saving a submitted doc and by not saving when the row is already started.

---

## 4. Summary

| Issue | Cause | Fix on server |
|-------|--------|----------------|
| 417 on get_or_create_timesheet | Adding a row to a submitted timesheet or saving a submitted doc | Only add rows to draft timesheets; if existing is submitted, create a new draft and return that. |
| 417 on start_timesheet_session | Saving a submitted timesheet or saving when row is already started | Check docstatus; if draft and row has no from_time, set it and save; if row already has from_time and no to_time, return success without save. |

The **client** (Electron app) already:

- Reuses an existing draft when get_or_create returns 417.
- Treats “row already started” as success when start_timesheet_session returns 417.

Fixing the server as above removes the underlying 417 and keeps behavior consistent for all clients (browser, Electron, future integrations).
