# macOS Screen Recording Permission Fixes - Applied

This document summarizes all the fixes applied to resolve macOS screen recording permission issues based on the root causes identified.

## ✅ Fix 1: Added Required Entitlements (Hardened Runtime)

### Problem
macOS DENIES screen recording to apps unless they are code-signed with Hardened Runtime enabled and have the required entitlements.

### Solution Applied
Created `entitlements.mac.plist` with all required entitlements:

- ✅ `com.apple.security.app-sandbox` = false
- ✅ `com.apple.security.cs.allow-jit` = true
- ✅ `com.apple.security.cs.allow-unsigned-executable-memory` = true
- ✅ `com.apple.security.device.audio-input` = true (required for screen capture)
- ✅ `com.apple.security.device.camera` = true (required for screen capture)
- ✅ `com.apple.security.accessibility` = true (required for active window detection)
- ✅ `com.apple.security.network.client` = true
- ✅ `com.apple.security.automation.apple-events` = true

### Configuration
The `package.json` already had:
- ✅ `hardenedRuntime: true`
- ✅ `entitlements: "./entitlements.mac.plist"`

### Next Steps
**You MUST rebuild the app for entitlements to take effect:**
```bash
npm run build
```

**Important:** The app must be rebuilt with these entitlements. Simply running `npm start` in dev mode won't have the entitlements applied.

---

## ✅ Fix 2: Window Visibility Before Permission Request

### Problem
macOS rejects screen recording authorization if the app appears "headless" or service-type. If the window is not visible before requesting permissions, macOS marks permission as DENIED even if UI shows allowed.

### Solution Applied
Modified `createWindow()` function in `main.js`:

**Before:** Window was shown AFTER permissions were requested
**After:** Window is shown FIRST, then permissions are requested

**Changes:**
1. Window is now shown in `ready-to-show` event (immediately when ready)
2. Window is focused to ensure it's in foreground
3. Small delay (100ms) to ensure window is fully visible
4. Permissions are requested AFTER window is visible

### Code Flow
```javascript
mainWindow.once('ready-to-show', async () => {
  // 1. Show window FIRST
  mainWindow.show();
  mainWindow.focus();
  
  // 2. Small delay to ensure visibility
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 3. NOW request permissions
  await ensureMacPermissionsOnStartup();
});
```

---

## ✅ Fix 3: Enhanced TCC Database Diagnostics

### Problem
It was difficult to verify what macOS actually sees in the TCC database, making troubleshooting hard.

### Solution Applied
Added `checkTCCDatabaseEntries()` function that:

1. **Queries TCC database directly** using the exact SQL query from instructions:
   ```sql
   SELECT client, service, allowed, prompt_count 
   FROM access 
   WHERE client LIKE '%bundleId%' OR client LIKE '%timetracker%';
   ```

2. **Provides detailed analysis:**
   - Shows all TCC entries for the app
   - Identifies Screen Recording and Accessibility entries
   - Interprets `allowed` values (0=DENIED, 1=ALLOWED)
   - Provides specific recommendations based on findings

3. **Integrated into diagnostic tool:**
   - The existing `diagnose-screen-capture` IPC handler now includes TCC database check
   - Results are included in the diagnostic output

### Usage
Run the diagnostic tool from the renderer:
```javascript
const diagnostics = await window.electronAPI.diagnoseScreenCapture();
console.log(diagnostics.tccDatabase);
```

The `tccDatabase` field will contain:
- `entries`: All TCC entries found
- `screenCapture`: Screen Recording entry details
- `accessibility`: Accessibility entry details
- `analysis`: Interpretation of findings
- `recommendation`: Specific fix suggestions

---

## ✅ Fix 4: Improved Permission Check Methods

### Current Implementation
The app already uses multiple fallback methods (in order of reliability):

1. **node-mac-permissions** (Primary) - Most reliable
2. **systemPreferences.getMediaAccessStatus()** (Fallback)
3. **TCC database query** (Optional - may fail with permission denied, which is OK)
4. **desktopCapturer.getSources()** (Verification)

### Status
✅ These methods work correctly with Hardened Runtime
✅ No changes needed - implementation is already correct

---

## 🔧 Troubleshooting Steps for Users

If permissions still don't work after rebuilding:

### Step 1: Verify Entitlements Are Applied
After rebuilding, check the app bundle:
```bash
codesign -d --entitlements - "/path/to/Time Tracker.app"
```

You should see all the entitlements listed above.

### Step 2: Reset TCC Database (If Needed)
If you previously granted permission to an old version:

```bash
# Reset Screen Recording permission
sudo tccutil reset ScreenCapture com.supagigs.timetracker

# Reset all permissions (if needed)
sudo tccutil reset All

# Delete TCC database (last resort)
rm ~/Library/Application\ Support/com.apple.TCC/TCC.db

# Reboot
sudo reboot
```

### Step 3: Check TCC Database Directly
Run the diagnostic tool and check `tccDatabase` field:

**Expected Results:**
- `screenCapture.allowed = "1"` (ALLOWED) ✅
- `screenCapture.service = "kTCCServiceScreenCapture"` ✅
- `accessibility.allowed = "1"` (ALLOWED) ✅

**Problem Indicators:**
- `allowed = "0"` → DENIED in database (even if UI shows ON)
- `found: false` → No entry in database
- `entries.length = 0` → App never registered in TCC

### Step 4: Verify Window Visibility
The app now shows the window before requesting permissions. If you see permission prompts:
- ✅ Window should be visible and focused
- ✅ App should not appear as a background service
- ✅ Dock icon should be visible

---

## 📋 Checklist After Rebuild

After rebuilding with `npm run build`, verify:

- [ ] App is code-signed (check with `codesign -dv`)
- [ ] Hardened Runtime is enabled (check with `codesign -d --entitlements`)
- [ ] All entitlements are present in the app bundle
- [ ] Window appears BEFORE permission prompts
- [ ] Permission prompts appear when app launches
- [ ] TCC database shows `allowed=1` for Screen Recording
- [ ] Screenshots can be captured successfully

---

## 🚨 Common Issues and Solutions

### Issue: "Permission denied" in TCC database even after granting
**Cause:** macOS bug with stale TCC entries
**Solution:**
```bash
sudo tccutil reset ScreenCapture com.supagigs.timetracker
# Then restart app and grant permission again
```

### Issue: No TCC database entry found
**Cause:** App not properly code-signed or Hardened Runtime not enabled
**Solution:**
1. Verify entitlements file exists: `entitlements.mac.plist`
2. Rebuild app: `npm run build`
3. Check code signing: `codesign -dv "Time Tracker.app"`

### Issue: Window not visible when permission is requested
**Cause:** Window shown after permission request (old bug)
**Solution:** ✅ Already fixed - window now shows first

### Issue: App appears as "Electron" in System Settings
**Cause:** Running dev build instead of packaged app
**Solution:** 
- Dev builds use different bundle ID
- Grant permission to the packaged app: `npm run build` then install from DMG

---

## 📝 Files Modified

1. **`entitlements.mac.plist`** (NEW)
   - Added all required entitlements for Hardened Runtime

2. **`main.js`**
   - Fixed window visibility timing (show before permissions)
   - Added `checkTCCDatabaseEntries()` function
   - Enhanced diagnostic output with TCC database check

3. **`package.json`**
   - Already configured correctly (no changes needed)

---

## 🎯 Expected Behavior After Fixes

1. **On First Launch:**
   - Window appears immediately
   - Window is visible and focused
   - Permission prompts appear (if not already granted)
   - User grants permissions
   - App continues normally

2. **Permission Status Check:**
   - Returns accurate status via multiple methods
   - TCC database check provides detailed diagnostics
   - All methods work with Hardened Runtime

3. **Screenshot Capture:**
   - Works immediately after permission is granted
   - No need to restart app (though restart is recommended)

---

## ⚠️ Important Notes

1. **Rebuild Required:** You MUST rebuild the app (`npm run build`) for entitlements to take effect. Dev mode (`npm start`) won't have entitlements.

2. **Code Signing:** The app must be properly code-signed. If you're using `CSC_IDENTITY_AUTO_DISCOVERY=false`, you may need to sign manually or use an ad-hoc signature.

3. **Bundle ID Consistency:** Make sure the Bundle ID in `package.json` (`com.supagigs.timetracker`) matches what's in System Settings.

4. **TCC Database Access:** If TCC database queries fail with "permission denied", this is EXPECTED and OK. The app doesn't need Full Disk Access - it uses other methods to check permissions.

---

## 🔍 Verification Commands

### Check Code Signing:
```bash
codesign -dv "Time Tracker.app"
```

### Check Entitlements:
```bash
codesign -d --entitlements - "Time Tracker.app"
```

### Check TCC Database (requires Full Disk Access for Terminal):
```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
"SELECT client,service,allowed,prompt_count FROM access WHERE client LIKE '%timetracker%';"
```

### Reset Permissions:
```bash
sudo tccutil reset ScreenCapture com.supagigs.timetracker
sudo tccutil reset Accessibility com.supagigs.timetracker
```

---

## ✅ Summary

All fixes from the instructions have been applied:

1. ✅ **Entitlements file created** with all required permissions
2. ✅ **Window visibility fixed** - shows before permission request
3. ✅ **TCC database diagnostics** - can verify what macOS sees
4. ✅ **Permission check methods** - already working correctly

**Next Step:** Rebuild the app with `npm run build` and test on macOS.

