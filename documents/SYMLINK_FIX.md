# Fixing the Symlink Error During `npm run build`

When electron-builder downloads signing tools it extracts archives containing symbolic links. On Windows, creating a symlink requires either Developer Mode or elevated privileges. If those conditions are not met you might see:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

Follow the steps below to resolve the issue.

---

## 1. Recommended Fix – Enable Developer Mode

Developer Mode allows non-admin processes to create symlinks.

1. Open **Settings → Privacy & security → For developers** (older versions: **Settings → Update & Security → For developers**).
2. Toggle **Developer Mode** to **On**.
3. Reboot if Windows prompts you.
4. Re-run the build:
   ```powershell
   cd "D:\Megha\Electron App\Supatimetracker"
   npm run build
   ```

Developer Mode is safe to keep enabled on development machines and permanently solves the symlink problem.

---

## 2. Quick Workaround – Run PowerShell as Administrator

If you cannot enable Developer Mode, launch an elevated shell (see `RUN_AS_ADMIN.md`) and build from there:

```powershell
cd "D:\Megha\Electron App\Supatimetracker"
npm run build
```

The elevated session grants the necessary privilege for that run only.

---

## 3. Automated Script

We ship a helper that checks Developer Mode, offers to enable it, and cleans the electron-builder cache:

```powershell
cd "D:\Megha\Electron App\Supatimetracker"
.\scripts\fix-symlink-issue.ps1
```

Follow the prompts in the terminal; the script exits with actionable guidance if the fix could not be applied automatically.

---

## 4. Manual Cleanup (Advanced)

If the cache is already corrupted, you can manually delete the offending archive:

```powershell
Remove-Item "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Force
npm run build
```

This forces electron-builder to download a fresh copy after you have the correct privileges in place.

---

## 5. Preventing Future Failures

- Keep Developer Mode enabled on your development workstation.
- Close all PowerShell/Terminal windows before running the build from an elevated session to avoid mixing privilege levels.
- Clean build output with `Remove-Item dist -Recurse -Force` before re-running a build if a previous attempt failed.

With the correct permission in place the electron-builder pipeline completes without additional configuration. ✅








