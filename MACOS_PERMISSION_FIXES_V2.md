# macOS Permission Fixes - Version 2 (Complete Implementation)

This document details all the fixes applied based on the latest instructions to resolve macOS screen recording permission issues.

## ✅ Fix 1: Created Entitlements File in Correct Location

### Problem
The entitlements file was in the root directory, but electron-builder expects it in the `build/` directory. Also, the critical `com.apple.security.device.screen-capture` entitlement was missing.

### Solution Applied

1. **Created `build/entitlements.mac.plist`** with all required entitlements:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>com.apple.security.app-sandbox</key><false/>
       <key>com.apple.security.cs.allow-jit</key><true/>
       <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
       <key>com.apple.security.device.camera</key><true/>
       <key>com.apple.security.device.screen-capture</key><true/>
   </dict>
   </plist>
   ```

2. **Updated `package.json`** to point to the correct location:
   ```json
   "mac": {
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "entitlements": "build/entitlements.mac.plist",
     "entitlementsInherit": "build/entitlements.mac.plist"
   }
   ```

### Key Entitlements
- ✅ `com.apple.security.device.screen-capture` - **CRITICAL** for screen recording
- ✅ `com.apple.security.device.camera` - Required for screen capture
- ✅ `com.apple.security.app-sandbox` = false - Allows screen capture
- ✅ `com.apple.security.cs.allow-jit` = true - Required for Electron
- ✅ `com.apple.security.cs.allow-unsigned-executable-memory` = true - Required for Electron

---

## ✅ Fix 2: Enhanced Permission Checking with node-mac-permissions

### Problem
The code wasn't using `node-mac-permissions` library methods properly as recommended in the instructions.

### Solution Applied

1. **Enhanced `checkMacOSScreenRecordingPermission()`**:
   - Uses `node-mac-permissions.getStatus('screenCapture')` as primary method
   - Added detailed logging with status indicators (✅, ❌, ⚠️, 🔒)
   - Better error handling and fallback methods

2. **Enhanced `triggerScreenRecordingPermissionPrompt()`**:
   - Checks current status using `node-mac-permissions` before prompting
   - Uses `desktopCapturer.getSources()` to trigger system prompt
   - Checks status again after prompt attempt
   - Returns detailed status information

3. **Enhanced `ensureMacPermissionsOnStartup()`**:
   - Added comprehensive logging with visual separators
   - Logs app name, bundle ID, and packaged status
   - Detailed status reporting for each permission
   - Clear warnings when permissions are missing

### Logging Output Example
```
═══════════════════════════════════════════════════════════
Running macOS startup permission preflight
═══════════════════════════════════════════════════════════
App Name: Time Tracker
Bundle ID: com.supagigs.timetracker
Is Packaged: true

Checking screen recording permission...
Screen recording permission check (via node-mac-permissions.getStatus): authorized
✅ Screen recording permission is AUTHORIZED
Screen recording permission status: granted

Checking accessibility permission...
Accessibility permission status: authorized

═══════════════════════════════════════════════════════════
Startup Permission Summary:
  Screen Recording: granted ✅
  Accessibility: authorized ✅
  Screen Prompted: No
  Accessibility Prompted: No
═══════════════════════════════════════════════════════════
```

---

## ✅ Fix 3: Window Visibility (Already Fixed)

The window is already configured to show BEFORE requesting permissions (from previous fix):
- Window shows in `ready-to-show` event
- Window is focused
- Small delay ensures visibility
- Permissions requested after window is visible

This prevents macOS from treating the app as "headless" or "service-type".

---

## 🔧 Next Steps for Users

### Step 1: Rebuild the App

**CRITICAL:** You MUST rebuild the app for entitlements to take effect:

```bash
npm run build
```

**Important Notes:**
- Dev mode (`npm start`) will NOT have entitlements applied
- You must test with the built `.app` from `dist/mac/Time Tracker.app`
- The app must be properly code-signed (even with ad-hoc signature)

### Step 2: Reset TCC Permissions (If Needed)

If you previously granted permission to an old version or are experiencing issues:

```bash
# Reset Screen Recording permission
sudo tccutil reset ScreenCapture

# Reset all permissions (if needed)
sudo tccutil reset All

# Manually remove TCC database cache (last resort)
rm ~/Library/Application\ Support/com.apple.TCC/TCC.db

# Restart your Mac
sudo reboot
```

### Step 3: Verify TCC Database

After rebuilding and launching the app, verify the TCC database:

```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
"SELECT client, service, allowed, prompt_count FROM access WHERE client LIKE '%timetracker%';"
```

**Expected Results:**
- `allowed` should be `1` (not `0` or `null`)
- `service` should include `kTCCServiceScreenCapture`
- `client` should match your bundle ID: `com.supagigs.timetracker`

**If `allowed = 0`:**
- This is a macOS bug - TCC shows denied even if UI shows ON
- Solution: `sudo tccutil reset ScreenCapture` then restart app

**If no entries found:**
- App may not be properly code-signed
- Hardened Runtime may not be enabled
- Check entitlements are applied: `codesign -d --entitlements - "Time Tracker.app"`

### Step 4: Check Console Logs

Launch the app and check the console output. You should see:

```
✅ Screen recording permission is AUTHORIZED
✅ Screen recording permission already granted
```

If you see:
```
❌ Screen recording permission is DENIED
⚠️ Screen recording permission is NOT DETERMINED
```

Follow the troubleshooting steps below.

---

## 🚨 Troubleshooting

### Issue: Permission Still Shows as DENIED

**Check 1: Verify Entitlements Are Applied**
```bash
codesign -d --entitlements - "/path/to/Time Tracker.app"
```

You should see:
- `com.apple.security.device.screen-capture` = true
- `com.apple.security.device.camera` = true
- `com.apple.security.app-sandbox` = false

**Check 2: Verify Hardened Runtime**
```bash
codesign -dv "Time Tracker.app"
```

Should show: `runtime=Hardened Runtime`

**Check 3: Verify Bundle ID**
```bash
/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "Time Tracker.app/Contents/Info.plist"
```

Should match: `com.supagigs.timetracker`

**Solution:**
1. Rebuild: `npm run build`
2. Reset TCC: `sudo tccutil reset ScreenCapture`
3. Restart Mac
4. Launch app from built `.app` (not dev mode)

### Issue: No TCC Database Entry

**Cause:** App not registered in TCC database

**Solution:**
1. Verify code signing: `codesign -dv "Time Tracker.app"`
2. Check entitlements: `codesign -d --entitlements - "Time Tracker.app"`
3. Ensure Hardened Runtime is enabled in `package.json`
4. Rebuild and test with built app (not dev mode)

### Issue: Window Not Visible When Permission Requested

**Status:** ✅ Already fixed - window shows before permissions

If you still see this issue:
1. Check console logs for window visibility messages
2. Ensure app is not running as background service
3. Verify `ready-to-show` event is firing

### Issue: node-mac-permissions Not Available

**Solution:**
```bash
npm install node-mac-permissions
```

The app will fall back to other methods, but `node-mac-permissions` is the most reliable.

---

## 📋 Verification Checklist

After rebuilding, verify:

- [ ] `build/entitlements.mac.plist` exists with `screen-capture` entitlement
- [ ] `package.json` points to `build/entitlements.mac.plist`
- [ ] App is rebuilt: `npm run build`
- [ ] Testing with built `.app` (not dev mode)
- [ ] Console shows permission status logs
- [ ] TCC database shows `allowed=1` for Screen Recording
- [ ] Window appears before permission prompts
- [ ] Screenshots can be captured successfully

---

## 📝 Files Modified

1. **`build/entitlements.mac.plist`** (NEW)
   - Created in correct location (`build/` directory)
   - Added `com.apple.security.device.screen-capture` entitlement
   - All required entitlements for Hardened Runtime

2. **`package.json`**
   - Updated entitlements path to `build/entitlements.mac.plist`

3. **`main.js`**
   - Enhanced permission checking with `node-mac-permissions`
   - Added comprehensive logging
   - Better error handling and status reporting

---

## 🎯 Expected Behavior

### On First Launch (After Rebuild):

1. **Window appears** immediately and is visible
2. **Console logs show:**
   ```
   Running macOS startup permission preflight
   App Name: Time Tracker
   Bundle ID: com.supagigs.timetracker
   Is Packaged: true
   ```

3. **Permission check:**
   ```
   Checking screen recording permission...
   Screen recording permission check (via node-mac-permissions.getStatus): not-determined
   ⚠️ Screen recording permission is NOT DETERMINED
   ```

4. **Permission prompt appears** (if not granted)

5. **After granting:**
   ```
   ✅ Screen recording permission is AUTHORIZED
   Screen recording permission status: granted
   ```

6. **Final summary:**
   ```
   Startup Permission Summary:
     Screen Recording: granted ✅
     Accessibility: authorized ✅
   ```

### On Subsequent Launches:

- Permissions should show as already granted
- No prompts should appear
- Screenshots should work immediately

---

## ⚠️ Critical Notes

1. **Rebuild Required:** Entitlements only apply to built apps, not dev mode
2. **Code Signing:** App must be code-signed (even ad-hoc signature works)
3. **Bundle ID:** Must match `com.supagigs.timetracker` in System Settings
4. **TCC Reset:** May be needed if permissions were granted to old version
5. **Testing:** Always test with built `.app`, not `npm start`

---

## 🔍 Debug Commands

### Check Entitlements:
```bash
codesign -d --entitlements - "Time Tracker.app"
```

### Check Code Signing:
```bash
codesign -dv "Time Tracker.app"
```

### Check Bundle ID:
```bash
/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "Time Tracker.app/Contents/Info.plist"
```

### Check TCC Database:
```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
"SELECT client, service, allowed, prompt_count FROM access WHERE client LIKE '%timetracker%';"
```

### Reset Permissions:
```bash
sudo tccutil reset ScreenCapture com.supagigs.timetracker
sudo tccutil reset Accessibility com.supagigs.timetracker
```

---

## ✅ Summary

All fixes from the latest instructions have been applied:

1. ✅ **Entitlements file** created in `build/` with `screen-capture` entitlement
2. ✅ **package.json** updated to use `build/entitlements.mac.plist`
3. ✅ **Permission checking** enhanced with `node-mac-permissions`
4. ✅ **Comprehensive logging** added for debugging
5. ✅ **Window visibility** already fixed (from previous version)

**Next Step:** Rebuild the app with `npm run build` and test on macOS.

