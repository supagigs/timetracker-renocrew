# Running PowerShell as Administrator

Some Windows build issues (symbolic-link creation, locked files) require elevated privileges. Use the steps below whenever `npm run build` fails with permission errors or whenever `scripts/fix-symlink-issue.ps1` tells you elevation is required.

---

## Quick Method
1. Press the **Windows** key.
2. Type `powershell`.
3. Right-click **Windows PowerShell** (or **PowerShell**).
4. Choose **Run as administrator**.
5. Approve the UAC prompt.

The title bar should read `Administrator: Windows PowerShell`.

---

## Alternative Launch Methods

### Run Dialog
- Press **Windows + R**.
- Enter `powershell`.
- Press **Ctrl + Shift + Enter** for an elevated session.

### Task Manager
1. Press **Ctrl + Shift + Esc**.
2. Click **File → Run new task**.
3. Type `powershell` and tick **Create this task with administrative privileges**.

### File Explorer
1. Open `C:\Windows\System32\WindowsPowerShell\v1.0`.
2. Right-click `powershell.exe` → **Run as administrator**.

---

## After Opening an Elevated Shell

```powershell
cd "D:\Megha\Electron App\Supatimetracker"
# Example tasks that sometimes need elevation
npm run build
# or
.\scripts\fix-symlink-issue.ps1
```

Use `Get-Location` to confirm you’re in the project folder before running commands.

---

## Verify Elevation

Run the following command. It returns `True` when the current PowerShell session has admin rights:

```powershell
([Security.Principal.WindowsPrincipal]
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

---

## Troubleshooting

- **“Run as administrator” missing:** try the Run Dialog shortcut (Ctrl + Shift + Enter) or search for “Windows PowerShell” specifically.
- **UAC prompt never appears:** ensure you’re using an account with admin privileges. Domain-managed machines may require IT assistance.
- **Still seeing `A required privilege is not held by the client`:** enable Windows Developer Mode as outlined in `SYMLINK_FIX.md` and rerun the build.

Elevated shells are only needed for setup tasks that modify system-protected resources. Close the window once you are done to avoid running subsequent commands with unnecessary privileges. 🔐








