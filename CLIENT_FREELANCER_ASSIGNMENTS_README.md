# Client-Freelancer Assignments Feature

## Overview
This feature stores the relationship between clients and freelancers in the database, allowing you to track which freelancer works under which client.

## Database Migration

### Step 1: Run the Migration
Run the SQL migration file in your Supabase SQL editor:
```
database-migration-client-freelancer-assignments.sql
```

This will:
- Create the `client_freelancer_assignments` table
- Set up indexes for faster queries
- Enable Row Level Security (RLS)
- Create permissive RLS policies
- Automatically migrate existing relationships from `project_assignments` table

### Step 2: Verify the Table
After running the migration, verify the table exists:
```sql
SELECT * FROM client_freelancer_assignments;
```

## Table Structure

### `client_freelancer_assignments`
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Unique identifier |
| `client_email` | TEXT NOT NULL | Email of the client |
| `freelancer_email` | TEXT NOT NULL | Email of the freelancer |
| `assigned_at` | TIMESTAMP | When the assignment was created (default: NOW()) |
| `is_active` | BOOLEAN | Whether the assignment is active (default: TRUE) |
| UNIQUE(client_email, freelancer_email) | | Ensures one assignment per client-freelancer pair |

## How It Works

### Automatic Assignment Creation
When a client assigns a project to a freelancer:
1. The project assignment is created in `project_assignments` table
2. **Automatically**, a client-freelancer assignment is created/updated in `client_freelancer_assignments` table
3. If the assignment already exists, it's reactivated (is_active = true)

### Manual Assignment Management
You can also manually manage assignments using SQL:

#### Add a new assignment:
```sql
INSERT INTO client_freelancer_assignments (client_email, freelancer_email)
VALUES ('client@example.com', 'freelancer@example.com');
```

#### Deactivate an assignment (without deleting):
```sql
UPDATE client_freelancer_assignments
SET is_active = FALSE
WHERE client_email = 'client@example.com' 
  AND freelancer_email = 'freelancer@example.com';
```

#### Reactivate an assignment:
```sql
UPDATE client_freelancer_assignments
SET is_active = TRUE
WHERE client_email = 'client@example.com' 
  AND freelancer_email = 'freelancer@example.com';
```

#### Delete an assignment:
```sql
DELETE FROM client_freelancer_assignments
WHERE client_email = 'client@example.com' 
  AND freelancer_email = 'freelancer@example.com';
```

## Query Examples

### Get all freelancers for a client:
```sql
SELECT freelancer_email, assigned_at, is_active
FROM client_freelancer_assignments
WHERE client_email = 'client@example.com'
  AND is_active = TRUE
ORDER BY assigned_at DESC;
```

### Get all clients for a freelancer:
```sql
SELECT client_email, assigned_at, is_active
FROM client_freelancer_assignments
WHERE freelancer_email = 'freelancer@example.com'
  AND is_active = TRUE
ORDER BY assigned_at DESC;
```

### Get all active assignments:
```sql
SELECT 
  cfa.client_email,
  cfa.freelancer_email,
  cfa.assigned_at,
  u_client.display_name AS client_name,
  u_freelancer.display_name AS freelancer_name
FROM client_freelancer_assignments cfa
LEFT JOIN users u_client ON u_client.email = cfa.client_email
LEFT JOIN users u_freelancer ON u_freelancer.email = cfa.freelancer_email
WHERE cfa.is_active = TRUE
ORDER BY cfa.assigned_at DESC;
```

## Integration with Application

### In `projects.js`
The `assignProjectToFreelancer()` function automatically creates/updates the client-freelancer assignment when a project is assigned.

### Future Enhancements
You can extend this feature to:
1. Display a list of freelancers for each client in the UI
2. Display which clients a freelancer works for
3. Add a dedicated "Manage Freelancers" page for clients
4. Add a "My Clients" page for freelancers
5. Show statistics per client-freelancer relationship

## Notes

- The migration automatically creates assignments from existing `project_assignments` data
- Assignments are automatically created when projects are assigned
- The `is_active` flag allows you to deactivate relationships without deleting them
- The unique constraint prevents duplicate assignments







