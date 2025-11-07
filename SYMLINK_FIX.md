# Fixing Symbolic Link Error in electron-builder

## Problem

When running `npm run build`, you may encounter this error:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

This happens because electron-builder tries to extract the winCodeSign archive, which contains macOS files with symbolic links. Windows requires administrator privileges to create symbolic links.

## Quick Solutions

### Solution 1: Enable Windows Developer Mode (Recommended - One-time setup)

This is the **easiest permanent solution**:

1. Open **Settings** (Windows key + I)
2. Go to **Update & Security** > **For developers**
3. Turn on **Developer Mode**
4. Restart your computer (if prompted)

After enabling Developer Mode, you can create symbolic links without administrator privileges. This will fix the issue permanently.

**Run the fix script to check/enable:**
```powershell
.\scripts\fix-symlink-issue.ps1
```

### Solution 2: Run PowerShell as Administrator (Quick fix)

1. Close your current PowerShell window
2. Right-click on **PowerShell** in the Start menu
3. Select **"Run as Administrator"**
4. Navigate to your project directory:
   ```powershell
   cd "D:\Megha\Electron App\Supatimetracker"
   ```
5. Run the build:
   ```powershell
   npm run build
   ```

### Solution 3: Manually Extract the Archive (Advanced)

If the above solutions don't work, you can manually extract the archive with admin privileges:

1. Run PowerShell as Administrator
2. Navigate to the cache directory:
   ```powershell
   cd "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   ```
3. Find the latest .7z file and extract it manually
4. The build should work after this

### Solution 4: Use a Different Build Tool (Alternative)

If you continue to have issues, you can use `electron-packager` instead:

```bash
npm install --save-dev electron-packager
npx electron-packager . "Time Tracker" --platform=win32 --arch=x64 --out=dist
```

## Why This Happens

- electron-builder downloads the winCodeSign tool for code signing
- The archive contains macOS files (darwin) with symbolic links
- Windows requires admin privileges to create symbolic links
- Even though code signing is disabled, electron-builder still downloads the tool

## Prevention

After enabling Developer Mode (Solution 1), this issue will not occur again. Developer Mode is safe to enable and is commonly used by developers.

## Verification

After applying a solution, verify it works:

```powershell
npm run build
```

The build should complete without the symbolic link error.






