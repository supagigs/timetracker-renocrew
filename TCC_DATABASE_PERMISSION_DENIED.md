# TCC Database Permission Denied - Quick Reference

## What Does "TCC Database Permission Denied" Mean?

When you see "permission denied" errors related to the TCC (Transparency, Consent, and Control) database, this means:

- The app tried to directly read macOS's permission database file
- macOS denied access to that file (which requires Full Disk Access)
- **This is EXPECTED and NORMAL behavior**

## Important: You Do NOT Need to Do Anything

✅ **The app does NOT need Full Disk Access to function**

✅ **This error does NOT affect the app's ability to:**
- Check Screen Recording permission
- Check Accessibility permission
- Capture screenshots
- Track time

✅ **The app automatically uses alternative methods** when TCC database access is denied

## What Permissions Does the App Actually Need?

The app only requires these two permissions:

1. **Screen Recording** - For capturing screenshots
   - Grant in: System Settings → Privacy & Security → Screen Recording
   - Enable toggle for "Time Tracker"

2. **Accessibility** - For detecting active applications/windows
   - Grant in: System Settings → Privacy & Security → Accessibility
   - Enable toggle for "Time Tracker"

## Why Does This Happen?

macOS protects the TCC database file (`~/Library/Application Support/com.apple.TCC/TCC.db`) and requires **Full Disk Access** to read it directly. However:

- The app doesn't need Full Disk Access to function
- The app uses other methods to check permissions that don't require Full Disk Access
- This is a security feature of macOS, not a bug

## How the App Handles This

The app tries multiple methods to check permissions (in order):

1. **node-mac-permissions** (Primary)
   - Most reliable method
   - Doesn't require Full Disk Access
   - Directly queries macOS APIs

2. **systemPreferences.getMediaAccessStatus()** (Fallback)
   - Electron's native API
   - Doesn't require Full Disk Access
   - Built into Electron

3. **TCC Database Query** (Optional)
   - May fail with "permission denied" - **this is OK**
   - Only used if other methods don't work
   - Falls back gracefully

4. **desktopCapturer.getSources()** (Verification)
   - Actually tries to capture screens
   - Used to verify permission is working

## What You'll See in Logs

If TCC database access is denied, you'll see messages like:

```
TCC database is inaccessible (permission denied) - this is EXPECTED and OK
The app does NOT need Full Disk Access to function. Using alternative permission check methods.
```

**This is normal** - you can safely ignore these messages.

## When Should You Be Concerned?

You should only be concerned if:

- ❌ Screen Recording permission shows as "denied" in System Settings
- ❌ Screenshots fail to capture
- ❌ The app can't detect which application you're using

**If you see "TCC database permission denied" but screenshots work fine, everything is working correctly.**

## Troubleshooting

If you're having actual permission issues (not just TCC database access):

1. Check System Settings → Privacy & Security → Screen Recording
   - Make sure "Time Tracker" is enabled (toggle ON)

2. Check System Settings → Privacy & Security → Accessibility
   - Make sure "Time Tracker" is enabled (toggle ON)

3. Quit the app completely (Cmd+Q, not just close window)

4. Restart the app

5. Try capturing a screenshot

6. If still not working, see: `PERMISSION_STATUS_ALWAYS_DENIED_TROUBLESHOOTING.md`

## Summary

| Situation | Action Required |
|-----------|----------------|
| "TCC database permission denied" in logs | ✅ **Nothing** - This is normal |
| Screenshots work fine | ✅ **Nothing** - Everything is OK |
| Permission shows as "denied" in System Settings | ⚠️ Enable permission in System Settings |
| Screenshots fail to capture | ⚠️ Check Screen Recording permission |
| App can't detect active app | ⚠️ Check Accessibility permission |

**Remember:** TCC database access denial is a **normal, expected behavior** and does not indicate a problem with your app or permissions.

