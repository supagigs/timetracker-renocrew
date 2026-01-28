# Client ↔ Freelancer Assignments

The Electron app and the Next.js reports portal now rely on a dedicated `client_freelancer_assignments` table. This document explains how to deploy, verify, and maintain that table in Supabase.

---

## 1. Purpose

- Keep a permanent record of which freelancers are associated with which clients.
- Drive the client views in the reports portal (sidebar navigation, overview summaries, filters).
- Allow independent management of assignments even when no active project exists.

The table is automatically kept in sync when projects are assigned inside the Electron app, but you can also manage it manually for migrations or bulk updates.

---

## 2. Deployment

1. Open the Supabase SQL editor for your project.
2. Run the migration file `database-migration-client-freelancer-assignments.sql`.
3. Confirm it finishes without errors. The script performs the following:
   - Creates the `client_freelancer_assignments` table.
   - Adds indexes for `client_email` and `freelancer_email`.
   - Enables Row Level Security and adds policies used by the app and reports portal.
   - Backfills existing relationships from `project_assignments`.

> Run this migration after the base schema and project-assignment migrations to ensure the dependency tables already exist.

---

## 3. Table Definition

| Column            | Type      | Notes                                                  |
| ----------------- | --------- | ------------------------------------------------------ |
| `id`              | bigint PK | Auto-generated primary key.                            |
| `client_email`    | text      | Lowercased email of the client.                        |
| `freelancer_email`| text      | Lowercased email of the freelancer.                    |
| `assigned_at`     | timestamptz| Defaults to `now()`.                                   |
| `is_active`       | boolean   | Defaults to `true`; toggled instead of deleting rows.  |
|
| Constraint        |           | `UNIQUE (client_email, freelancer_email)` prevents duplicates. |

Two covering indexes are created to speed up lookups by client or freelancer.

---

## 4. Automatic Updates

When a client assigns a project in the Electron UI:

1. The new row is inserted into `project_assignments`.
2. A trigger in the migration calls a helper function that upserts into `client_freelancer_assignments`.
3. Reassigning an existing pair reactivates the `is_active` flag.

The reverse happens when assignments are removed—`is_active` flips to `false` so historical data remains available.

---

## 5. Manual Maintenance

Use the following SQL snippets when bulk editing data or troubleshooting:

### Add or Reactivate an Assignment
```sql
INSERT INTO client_freelancer_assignments (client_email, freelancer_email)
VALUES ('client@example.com', 'freelancer@example.com')
ON CONFLICT (client_email, freelancer_email)
DO UPDATE SET is_active = TRUE, assigned_at = now();
```

### Deactivate Without Deleting
```sql
UPDATE client_freelancer_assignments
SET is_active = FALSE
WHERE client_email = 'client@example.com'
  AND freelancer_email = 'freelancer@example.com';
```

### Fetch Active Freelancers for a Client
```sql
SELECT freelancer_email, assigned_at
FROM client_freelancer_assignments
WHERE client_email = 'client@example.com' AND is_active = TRUE
ORDER BY assigned_at DESC;
```

### Fetch Active Clients for a Freelancer
```sql
SELECT client_email, assigned_at
FROM client_freelancer_assignments
WHERE freelancer_email = 'freelancer@example.com' AND is_active = TRUE
ORDER BY assigned_at DESC;
```

### Full Join With Display Names
```sql
SELECT cfa.client_email,
       cfa.freelancer_email,
       cfa.assigned_at,
       uc.display_name AS client_name,
       uf.display_name AS freelancer_name
FROM client_freelancer_assignments cfa
LEFT JOIN users uc ON uc.email = cfa.client_email
LEFT JOIN users uf ON uf.email = cfa.freelancer_email
WHERE cfa.is_active = TRUE
ORDER BY cfa.assigned_at DESC;
```

---

## 6. Integration Points

- **Electron app** – `renderer/scripts/projects.js` and other project-management flows call a Supabase RPC that upserts the assignment automatically.
- **Reports portal** – `src/lib/projects.ts` and related components use this table to build client and freelancer dashboards.
- **Session watcher** – Because the reports portal mirrors the client navigation, the assignments table determines which sections a freelancer can access.

Whenever you update the schema or policies, rebuild/regenerate the types in the Next.js project if you rely on TypeScript definitions.

---

## 7. Troubleshooting

- **Assignments missing after build** → Ensure the migration ran on the target Supabase project.
- **Duplicate rows** → Check for manually inserted data that bypassed the unique constraint with case differences; normalize emails to lowercase before inserting.
- **RLS errors** → Verify the policies created in the migration are still present. Re-run the migration or recreate the policies manually.

Keep this table healthy and the client/freelancer experience stays in sync across desktop and web. 🚀










