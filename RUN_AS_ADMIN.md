# How to Run PowerShell as Administrator

## Quick Method (Easiest)

1. **Press Windows key** or click **Start**
2. **Type**: `powershell`
3. **Right-click** on "Windows PowerShell" or "PowerShell"
4. **Select**: "Run as Administrator"
5. **Click**: "Yes" when prompted by User Account Control (UAC)

## Alternative Methods

### Method 2: Using Run Dialog
1. Press **Windows + R**
2. Type: `powershell`
3. Press **Ctrl + Shift + Enter** (this automatically runs as admin)
4. Click "Yes" in the UAC prompt

### Method 3: Using Task Manager
1. Press **Ctrl + Shift + Esc** to open Task Manager
2. Click **File** → **Run new task**
3. Type: `powershell`
4. **Check the box**: "Create this task with administrative privileges"
5. Click **OK**

### Method 4: From File Explorer
1. Open **File Explorer**
2. Navigate to: `C:\Windows\System32\WindowsPowerShell\v1.0\`
3. **Right-click** on `powershell.exe`
4. Select **"Run as Administrator"**
5. Click "Yes" in the UAC prompt

## How to Verify You're Running as Administrator

After opening PowerShell, check the title bar. It should say:
```
Administrator: Windows PowerShell
```

Or run this command to verify:
```powershell
([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

If it returns `True`, you're running as Administrator.

## After Opening PowerShell as Administrator

1. **Navigate to your project**:
   ```powershell
   cd "D:\Megha\Electron App\Supatimetracker"
   ```

2. **Run the build**:
   ```powershell
   npm run build
   ```

## Troubleshooting

### "Run as Administrator" Option Not Available
- Make sure you're right-clicking on "Windows PowerShell" or "PowerShell", not "PowerShell ISE" or "Windows Terminal"
- Try Method 2 (Run Dialog with Ctrl+Shift+Enter)

### UAC Prompt Doesn't Appear
- Your account might not have administrator privileges
- Contact your system administrator or use an account with admin rights

### Can't Find PowerShell in Start Menu
- Type `powershell` in the search box
- Look for "Windows PowerShell" (not "PowerShell ISE" or "Windows Terminal")

## Note

Running as Administrator gives PowerShell elevated privileges, which are needed to create symbolic links on Windows. This is required to fix the electron-builder symlink error.

For a permanent solution that doesn't require running as admin each time, enable **Windows Developer Mode** (see `SYMLINK_FIX.md`).





