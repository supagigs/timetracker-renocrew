# Troubleshooting: Permission Status Always Shows "Denied"

## Problem
The app's permission status always shows as "denied" even after granting Screen Recording permission in System Settings.

## Root Causes

### 1. **Bundle ID Mismatch** (Most Common)
macOS permissions are tied to the **Bundle ID**, not the app name. If the Bundle ID doesn't match what's in System Settings, the permission check will fail.

**How to Check:**
- Run the diagnostic tool: `window.electronAPI.diagnoseScreenCapture()`
- Look at the `bundleId` field in the output
- Check System Settings → Privacy & Security → Screen Recording
- The app listed should match the Bundle ID, not just the app name

**Solutions:**
- **Dev vs Packaged**: Dev builds use Electron's default Bundle ID (different from packaged app)
  - Dev build Bundle ID: Usually something like `com.electron.*` or varies
  - Packaged app Bundle ID: `com.supagigs.timetracker` (from `package.json`)
  - **Fix**: Grant permission separately for dev and packaged versions
- **Multiple Versions**: If you have multiple versions installed, each has a different Bundle ID
  - **Fix**: Remove old versions, keep only one

### 2. **App Not Restarted After Granting Permission**
macOS permissions sometimes require a full app restart to take effect.

**Solution:**
1. Grant permission in System Settings
2. **QUIT the app completely** (Cmd+Q, don't just close the window)
3. Wait 2-3 seconds
4. Restart the app
5. Check permission status again

### 3. **Wrong App Enabled in System Settings**
You might have enabled "Electron" instead of "Time Tracker", or enabled a different version.

**Solution:**
1. Open System Settings → Privacy & Security → Screen Recording
2. Look for the exact app name that matches your current build:
   - **Packaged app**: Should show "Time Tracker"
   - **Dev build**: May show "Electron" or the dev bundle name
3. If you see multiple entries, disable all and restart the app
4. Grant permission again when prompted

### 4. **TCC Database Corruption**
The macOS permission database (TCC) can become corrupted.

**Solution:**
Reset the Screen Recording permission for your app:
```bash
tccutil reset ScreenCapture com.supagigs.timetracker
```
Then restart the app and grant permission again.

**Warning:** This will reset ALL Screen Recording permissions for this Bundle ID.

### 5. **TCC Database Access Denied (This is OK!)**
If you see "permission denied" when accessing the TCC database, **this is EXPECTED and NORMAL**. The app does NOT need Full Disk Access to function.

**What this means:**
- The app tried to read the TCC database directly to check permission status
- macOS denied access to the TCC database file (which requires Full Disk Access)
- **This does NOT affect the app's functionality** - it will use other methods to check permissions

**What the app does:**
1. Tries to read TCC database (may fail with "permission denied" - this is OK)
2. Falls back to `node-mac-permissions` (if installed)
3. Falls back to `systemPreferences.getMediaAccessStatus('screen')`
4. Verifies with `desktopCapturer.getSources()`

**You do NOT need to:**
- Grant Full Disk Access to the app
- Grant Full Disk Access to Terminal
- Do anything special - the app handles this automatically

**The app only needs:**
- ✅ Screen Recording permission
- ✅ Accessibility permission (for window/app detection)

**If you see this in logs:**
```
TCC database is inaccessible (permission denied) - this is EXPECTED and OK
The app does NOT need Full Disk Access to function. Using alternative permission check methods.
```
This is **normal** and you can safely ignore it.

### 6. **Permission Check Method Not Working**
The app uses multiple methods to check permission:
1. `node-mac-permissions` (most reliable)
2. `systemPreferences.getMediaAccessStatus('screen')` (Electron native)
3. TCC database query (may fail with permission denied - this is OK)
4. Verification via `desktopCapturer.getSources()`

**If `node-mac-permissions` is not installed:**
```bash
npm install node-mac-permissions
```

### 7. **App Running in Different Context**
The app might be running with different permissions than expected (e.g., from different location, different user, etc.)

**Check:**
- Where is the app installed? (Applications folder vs Downloads)
- Are you running it from Terminal vs Finder?
- Is it a DMG mount vs installed app?

**Solution:**
- Install the app properly in `/Applications`
- Run it from Applications folder or Dock
- Avoid running from DMG or temporary locations

## Diagnostic Steps

### Step 1: Run Diagnostic Tool
Open Developer Tools (View → Toggle Developer Tools) and run:
```javascript
window.electronAPI.diagnoseScreenCapture().then(console.log);
```

Check these fields:
- `bundleId`: Should be `com.supagigs.timetracker` for packaged app
- `appName`: Should be "Time Tracker" (not "Electron")
- `isPackaged`: Should be `true` for packaged app
- `permissionStatus`: Current permission status
- `troubleshooting`: Array of troubleshooting steps

### Step 2: Verify System Settings
1. Open System Settings → Privacy & Security → Screen Recording
2. Check if your app is listed:
   - **Name**: Should match `appName` from diagnostic
   - **Toggle**: Should be ON (blue/enabled)
3. If not listed:
   - Try capturing a screenshot (this should trigger permission prompt)
   - Or manually add the app using the "+" button

### Step 3: Check Bundle ID Match
The Bundle ID in System Settings must match your app's Bundle ID:

**For Packaged App:**
- Expected: `com.supagigs.timetracker`
- Check: Look at the diagnostic output's `bundleId` field

**For Dev Build:**
- Bundle ID varies (usually `com.electron.*` or Electron default)
- Check: Run diagnostic to see actual Bundle ID

**Verify in Terminal:**
```bash
# Check what apps have Screen Recording permission
tccutil dump ScreenCapture | grep -i "time tracker\|electron\|supagigs"
```

### Step 4: Clear Permission Cache
The app caches permission status for 5 seconds. To force a fresh check:
1. Wait 5+ seconds after granting permission
2. Or restart the app
3. Or run diagnostic tool (it clears cache automatically)

### Step 5: Reset and Re-grant Permission
If nothing works, reset the permission:
```bash
# Reset Screen Recording permission for your app
tccutil reset ScreenCapture com.supagigs.timetracker

# Then restart the app and grant permission again
```

## Common Scenarios

### Scenario 1: Dev Build Always Shows Denied
**Cause**: Dev build uses different Bundle ID than packaged app
**Solution**: 
- Grant permission to the dev build separately
- Or build the packaged app and grant permission to that
- Dev builds usually show as "Electron" in System Settings

### Scenario 2: Just Installed from DMG
**Cause**: App hasn't requested permission yet, or permission was granted to DMG mount (temporary)
**Solution**:
1. Install app to Applications folder (drag from DMG)
2. Run app from Applications folder
3. Grant permission when prompted
4. If not prompted, go to System Settings and enable manually

### Scenario 3: Permission Granted But Still Denied
**Cause**: Bundle ID mismatch or app not restarted
**Solution**:
1. Verify Bundle ID matches (use diagnostic tool)
2. QUIT app completely (Cmd+Q)
3. Wait 3 seconds
4. Restart app
5. Check permission status again

### Scenario 4: Multiple Time Tracker Apps Installed
**Cause**: Different versions have different Bundle IDs
**Solution**:
1. Remove all old versions
2. Keep only one version installed
3. Grant permission to that version only

## Verification Checklist

After granting permission, verify:

- [ ] Permission is enabled in System Settings
- [ ] App name in System Settings matches current build
- [ ] Bundle ID matches (check diagnostic output)
- [ ] App has been fully quit and restarted
- [ ] Diagnostic tool shows `permissionStatus: "granted"`
- [ ] `desktopCapturer.getSources()` returns screen sources
- [ ] Screenshots can be captured successfully

## Still Not Working?

If permission still shows as denied after following all steps:

1. **Check Console Logs**:
   - Look for detailed permission check logs
   - Search for "Permissions" in console
   - Check for error messages

2. **Try Alternative Method**:
   ```bash
   # Install node-mac-permissions for more reliable checking
   npm install node-mac-permissions
   ```

3. **Check macOS Version**:
   - Screen Recording permission was introduced in macOS 10.15 (Catalina)
   - Older versions may not support it

4. **Check for Security Software**:
   - Some antivirus or security software may block permissions
   - Temporarily disable to test

5. **Full System Reset** (Last Resort):
   ```bash
   # Reset ALL Screen Recording permissions (affects all apps)
   tccutil reset ScreenCapture
   ```
   **Warning**: This will reset Screen Recording permission for ALL apps.

## Technical Details

### Permission Check Methods

The app tries multiple methods in order:

1. **node-mac-permissions** (Primary)
   - Directly queries TCC database
   - Most reliable
   - Returns: `'authorized'`, `'denied'`, `'not-determined'`, or `'restricted'`

2. **systemPreferences.getMediaAccessStatus('screen')** (Fallback)
   - Electron's native API
   - May not be available in all Electron versions
   - Returns: `'granted'`, `'denied'`, `'not-determined'`, `'restricted'`, or `'unknown'`

3. **desktopCapturer.getSources()** (Verification)
   - Actually tries to capture screens
   - If permission is denied, returns empty array or throws error
   - Used as secondary verification

### Cache Behavior

Permission status is cached for 5 seconds to avoid excessive checks:
- Cache duration: `PERMISSION_CACHE_DURATION = 5000ms`
- Cache is cleared when:
  - Running diagnostic tool
  - Explicitly checking permission via IPC
  - Cache expires (after 5 seconds)

### Bundle ID Resolution

The app tries to get Bundle ID from:
1. Info.plist file (packaged app)
2. package.json build.appId (fallback)
3. Returns null if neither available

## Summary

**Most Common Fix:**
1. Grant permission in System Settings
2. Verify Bundle ID matches
3. QUIT app completely (Cmd+Q)
4. Restart app
5. Verify with diagnostic tool

**If Still Denied:**
- Check Bundle ID mismatch
- Reset permission: `tccutil reset ScreenCapture com.supagigs.timetracker`
- Install `node-mac-permissions`: `npm install node-mac-permissions`
- Check console logs for detailed error messages

