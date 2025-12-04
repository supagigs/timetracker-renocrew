# macOS Permissions Required for Time Tracker

This document outlines all the macOS permissions required for the Time Tracker application to function properly.

## Required Permissions

### 1. Screen Recording (Screen Capture) - REQUIRED ✅

**Purpose:** Capture screenshots of your screen for time tracking.

**Why it's needed:**
- The app takes periodic screenshots while you're working
- Screenshots are stored locally and uploaded to Supabase
- Used to track what applications you're working in

**How to Grant:**
1. Go to **System Settings** → **Privacy & Security** → **Screen Recording**
   - On older macOS: **System Preferences** → **Security & Privacy** → **Privacy** → **Screen Recording**
2. Find **"Time Tracker"** in the list
3. Toggle the switch **ON**
4. Enter your password if prompted
5. **QUIT the app completely** (Cmd+Q, not just close the window)
6. Restart the app

**Bundle ID:** `com.supagigs.timetracker`

**Troubleshooting:**
- If "Time Tracker" is not in the list, the app hasn't requested permission yet - try capturing a screenshot
- If you see "Electron" instead of "Time Tracker", you're running the dev build - permissions are separate for dev and packaged apps
- After granting permission, you MUST restart the app for it to take effect
- If permission is granted but screenshots still fail, check the console logs for diagnostic information

**Status Values:**
- `granted` - Permission is enabled ✅
- `denied` - Permission is disabled ❌
- `not-determined` - Permission hasn't been requested yet
- `restricted` - Permission is blocked by system policy (parental controls/MDM)
- `unknown` - Status cannot be determined

---

### 2. Accessibility - REQUIRED ✅

**Purpose:** Detect which application and window you're currently using.

**Why it's needed:**
- Identifies the active application (e.g., "Google Chrome", "VS Code")
- Gets the window title (e.g., "index.js - Visual Studio Code", "YouTube - Google Chrome")
- Used to accurately track what you're working on

**How to Grant:**
1. Go to **System Settings** → **Privacy & Security** → **Accessibility**
   - On older macOS: **System Preferences** → **Security & Privacy** → **Privacy** → **Accessibility**
2. Find **"Time Tracker"** in the list
3. Toggle the switch **ON**
4. Enter your password if prompted
5. Restart the app if needed

**Troubleshooting:**
- If "Time Tracker" is not in the list, try starting a tracking session - macOS may prompt you
- Similar to Screen Recording, dev and packaged apps have separate permissions
- Some features (like window title detection) won't work without this permission

---

## Optional Permissions

The following permissions may be requested but are not strictly required for basic functionality:

### 3. Camera Access (Optional)

**Purpose:** Listed in Info.plist but not actively used for screenshots.

**Status:** Declared in `NSCameraUsageDescription` but not required for screenshot functionality.

---

### 4. Microphone Access (Not Used)

**Purpose:** Listed in Info.plist but explicitly states the app does not use the microphone.

**Status:** Declared but not required.

---

## Permission Status Checking

The app uses `systemPreferences.getMediaAccessStatus('screen')` to check Screen Recording permission status. This method:
- Returns the current TCC (Transparency, Consent, and Control) database status
- Works immediately after permission is granted (no app restart needed for the check itself)
- Is more reliable than checking via `desktopCapturer.getSources()`

### Checking Permission Status

**From the app:**
1. Open Developer Tools (View → Toggle Developer Tools)
2. In the Console, run:
   ```javascript
   window.electronAPI.checkScreenPermission().then(console.log);
   ```

**Diagnostic Tool:**
```javascript
window.electronAPI.diagnoseScreenCapture().then(console.log);
```

This will show:
- Current permission status
- Bundle ID
- App name
- Whether app is packaged or in dev mode
- Display information
- Screenshot source availability
- Troubleshooting recommendations

---

## Common Issues and Solutions

### Issue 1: Permission Denied Even After Granting

**Symptoms:**
- System Settings shows permission is enabled
- App logs show "permission denied"
- Screenshots fail to capture

**Causes:**
1. **Bundle ID Mismatch**
   - You granted permission to the dev build, but you're running the packaged app (or vice versa)
   - Solution: Grant permission to the correct app instance

2. **App Not Restarted**
   - Permission was granted but app wasn't restarted
   - Solution: Quit app completely (Cmd+Q) and restart

3. **Wrong App in System Settings**
   - Permission granted to "Electron" instead of "Time Tracker"
   - Solution: Make sure "Time Tracker" is enabled, not "Electron"

**Solution Steps:**
1. Check the diagnostic output for bundle ID and app name
2. Verify in System Settings that the correct app is enabled
3. If wrong app is enabled, disable it and restart Time Tracker
4. Grant permission when prompted
5. Quit app completely (Cmd+Q)
6. Restart app
7. Check diagnostic again

---

### Issue 2: Permission Not Prompting

**Symptoms:**
- No permission prompt appears
- App shows "not-determined" status

**Solution:**
1. Try capturing a screenshot manually - this should trigger the prompt
2. If no prompt appears, go to System Settings manually and add the app
3. Click the "+" button in Screen Recording settings
4. Navigate to the app and add it

---

### Issue 3: Dev vs Packaged App Permissions

**Problem:**
- Permissions granted in dev mode don't apply to packaged app
- Permissions granted to packaged app don't apply to dev mode

**Explanation:**
- Dev builds use Electron's default identifier
- Packaged apps use the bundle ID from `package.json` (`com.supagigs.timetracker`)
- macOS treats these as separate apps

**Solution:**
- Grant permissions separately for dev and packaged versions
- When testing, use the version you'll be distributing (packaged)

---

### Issue 4: Resetting Permissions

If permissions are corrupted or you want to start fresh:

**Reset Screen Recording Permission:**
```bash
tccutil reset ScreenCapture com.supagigs.timetracker
```

**Reset Accessibility Permission:**
```bash
tccutil reset Accessibility com.supagigs.timetracker
```

**Note:** Requires Terminal access. After reset, restart the app and grant permissions again.

---

## Bundle ID Information

**Development Mode:**
- Bundle ID: Electron default (varies)
- App Name: Usually "Electron"

**Packaged App:**
- Bundle ID: `com.supagigs.timetracker`
- App Name: "Time Tracker"
- Defined in: `package.json` → `build.appId`

---

## Verification Checklist

After granting permissions, verify:

- [ ] Screen Recording permission shows as `granted` in diagnostic
- [ ] Accessibility permission is enabled in System Settings
- [ ] App name in System Settings is "Time Tracker" (not "Electron")
- [ ] Bundle ID matches `com.supagigs.timetracker` (for packaged app)
- [ ] Diagnostic shows displays are detected
- [ ] `desktopCapturer.getSources()` returns screen sources
- [ ] Screenshots can be captured successfully
- [ ] Active application is detected correctly

---

## Technical Details

### Permission Check Implementation

The app uses Electron's `systemPreferences.getMediaAccessStatus('screen')` which:
- Queries the TCC database directly
- Returns status immediately (no need to wait for `desktopCapturer`)
- Is the most reliable method for checking Screen Recording permission

### Cache Duration

Permission status is cached for 5 seconds to avoid excessive checks:
- Cache duration: `PERMISSION_CACHE_DURATION = 5000ms`
- Cache is cleared when running diagnostics
- Cache is cleared when permission check fails

### Info.plist Entries

The app declares required permissions in `package.json`:
```json
"extendInfo": {
  "NSScreenCaptureUsageDescription": "This app needs screen recording permission...",
  "NSAppleEventsUsageDescription": "This app needs to detect which application..."
}
```

These are embedded in the app's Info.plist when packaged.

---

## Support

If you continue to experience permission issues after following this guide:

1. Run the diagnostic tool: `window.electronAPI.diagnoseScreenCapture()`
2. Check the console logs for detailed error messages
3. Verify bundle ID and app name match expected values
4. Ensure you've granted permissions to the correct app (packaged vs dev)
5. Try resetting permissions using `tccutil reset` commands
6. Restart your Mac if issues persist

---

## Summary

**Minimum Required Permissions:**
1. ✅ **Screen Recording** - For capturing screenshots
2. ✅ **Accessibility** - For detecting active applications

**Bundle ID:** `com.supagigs.timetracker` (packaged app)

**Critical Steps:**
1. Grant permissions in System Settings
2. Enable the correct app ("Time Tracker", not "Electron")
3. Quit app completely after granting permission
4. Restart the app
5. Verify with diagnostic tool

