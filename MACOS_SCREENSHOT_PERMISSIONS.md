# macOS Screenshot Permissions Guide

## Problem: Screenshots Work in Dev but Not in DMG

When running `npm run dev`, screenshots work fine, but when running from the DMG (packaged app), screenshots are not captured. This is a common macOS permissions issue.

## Why This Happens

1. **Different App Identifiers**: Development mode uses Electron's default identifier, while packaged apps use the `appId` from `package.json`
2. **macOS Permission System**: macOS requires explicit permission grants for screen recording, and packaged apps are treated differently than development builds
3. **Permission Persistence**: Permissions granted to the dev version don't automatically apply to the packaged version

## Solution

### Automatic Fix (Implemented - Enhanced)

The app now automatically:
1. Checks for screen recording permission on startup with retry logic
2. Checks permissions before each screenshot capture attempt
3. Shows a helpful dialog if permission is missing with options to:
   - Open System Settings directly
   - Check permissions again
4. Provides detailed logging for debugging permission issues
5. Automatically re-checks permissions when screenshots fail

### Manual Steps for Users

If screenshots still don't work after installing from DMG:

1. **Open System Settings**:
   - Go to **System Settings** → **Privacy & Security** → **Screen Recording**
   - (On older macOS: **System Preferences** → **Security & Privacy** → **Privacy** → **Screen Recording**)

2. **Find Your App**:
   - Look for "Time Tracker" in the list
   - If it's not there, the app hasn't requested permission yet

3. **Enable Permission**:
   - Toggle the switch **ON** next to "Time Tracker"
   - You may be prompted to enter your password

4. **Restart the App**:
   - Quit the app completely (Cmd+Q)
   - Reopen it from Applications or the DMG

5. **Verify**:
   - Start a tracking session
   - Screenshots should now be captured

## Technical Details

### What Was Added

1. **Info.plist Entries** (`package.json`):
   ```json
   "extendInfo": {
     "NSCameraUsageDescription": "This app needs camera access for screenshot functionality.",
     "NSScreenCaptureUsageDescription": "This app needs screen recording permission to capture screenshots for time tracking. Please enable this permission in System Settings → Privacy & Security → Screen Recording.",
     "NSAppleEventsUsageDescription": "This app needs to capture screenshots of your screen for time tracking purposes.",
     ...
   }
   ```

2. **Permission Check Function** (`main.js`):
   - `checkScreenRecordingPermission(retryCount)` - Checks if permission is granted with automatic retry logic (up to 2 retries)
   - `requestScreenRecordingPermission(showDialog)` - Shows dialog if permission is missing with options to open System Settings or check again
   - Both functions now return detailed permission status including error messages
   - Permission checks are performed before every screenshot capture attempt

3. **Automatic Check on Startup**:
   - Runs after window loads
   - Shows helpful dialog if permission is denied

### How macOS Screen Recording Works

- **First Call**: When `desktopCapturer.getSources()` is first called, macOS shows a permission dialog
- **Permission Storage**: Permission is stored per app bundle identifier
- **Different Identifiers**: Dev and packaged apps have different identifiers, so permissions don't transfer

### Testing

To test if permissions are working:

1. **Check Console Logs**:
   ```
   [Permissions] Screen recording permission granted
   ```
   or
   ```
   [Permissions] Screen recording permission denied or not granted
   ```

2. **Use Diagnostic Tool**:
   - Open Developer Tools in the app
   - Run: `window.electronAPI.diagnoseScreenCapture()`
   - Check the `permissions` field in the result

3. **Check System Settings**:
   - System Settings → Privacy & Security → Screen Recording
   - "Time Tracker" should be listed and enabled

## Troubleshooting

### Issue: Permission Dialog Doesn't Appear

**Solution**:
1. Manually go to System Settings → Privacy & Security → Screen Recording
2. Look for "Time Tracker" - if it's there but disabled, enable it
3. If it's not there, the app needs to request permission first (start a tracking session)

### Issue: Permission Granted But Screenshots Still Don't Work

**Possible Causes**:
1. App needs to be restarted after granting permission
2. Multiple displays - check if all displays have permission
3. Virtual machine limitations
4. Permission check timing issues

**Solution**:
1. Quit the app completely (Cmd+Q)
2. Reopen it
3. Start a new tracking session
4. Check console logs for detailed error messages - the app now logs permission status before each capture attempt
5. Use the diagnostic tool: `window.electronAPI.diagnoseScreenCapture()` to see detailed permission information
6. The app now automatically checks permissions before each screenshot, so if permission was just granted, it should work on the next capture attempt

### Issue: "Received 0 screen source(s)" in Logs

This means permission is denied. Follow the manual steps above.

### Issue: Permission Works in Dev But Not in DMG

This is expected - they're different apps to macOS. You need to grant permission separately for the packaged app.

## For Developers

### Building with Permissions

The `package.json` now includes `extendInfo` which adds required Info.plist entries. When you build:

```bash
npm run build -- --mac
```

The DMG will include the proper permission declarations.

### Verifying Build Configuration

Check that `package.json` includes:
```json
"mac": {
  "extendInfo": {
    "NSCameraUsageDescription": "...",
    ...
  }
}
```

### Testing Permission Flow

1. Build the DMG: `npm run build -- --mac`
2. Install from DMG
3. First launch should show permission dialog
4. Grant permission in System Settings
5. Restart app
6. Screenshots should work

## Additional Resources

- [Electron Desktop Capturer Docs](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [macOS Screen Recording Permission](https://support.apple.com/guide/mac-help/control-access-to-screen-recording-mh32387/mac)
- [SCREEN_CAPTURE_DEBUG.md](./SCREEN_CAPTURE_DEBUG.md) - Detailed debugging guide

