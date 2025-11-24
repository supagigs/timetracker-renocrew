# macOS Screenshot Permissions Guide

## Problem: Screenshots Work in Dev but Not in DMG

When running `npm run dev`, screenshots work fine, but when running from the DMG (packaged app), screenshots are not captured. This is a common macOS permissions issue.

## Why This Happens

1. **Different App Identifiers**: Development mode uses Electron's default identifier, while packaged apps use the `appId` from `package.json`
2. **macOS Permission System**: macOS requires explicit permission grants for screen recording, and packaged apps are treated differently than development builds
3. **Permission Persistence**: Permissions granted to the dev version don't automatically apply to the packaged version

## Solution

### Automatic Fix (Implemented)

The app now automatically:
1. Checks for screen recording permission on startup
2. Shows a helpful dialog if permission is missing
3. Provides a button to open System Settings

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
     ...
   }
   ```

2. **Permission Check Function** (`main.js`):
   - `checkScreenRecordingPermission()` - Checks if permission is granted
   - `requestScreenRecordingPermission()` - Shows dialog if permission is missing

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

**Solution**:
1. Quit the app completely (Cmd+Q)
2. Reopen it
3. Start a new tracking session
4. Check console logs for error messages

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

