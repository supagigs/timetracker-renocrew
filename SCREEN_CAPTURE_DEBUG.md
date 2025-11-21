# Screen Capture Debugging Guide (macOS)

This guide helps you diagnose and fix screen capture issues on macOS, especially when multiple displays are not being captured.

## Quick Diagnostic

Open the browser console (Developer Tools) in your Electron app and run:

```javascript
window.electronAPI.diagnoseScreenCapture().then(result => {
  console.log('Screen Capture Diagnostics:', result);
});
```

This will show you:
- Number of displays detected
- Number of screen sources returned
- Permission status (on macOS)
- Detailed information about each display and source

## Checking macOS Screen Recording Permissions

### Method 1: System Settings

1. Open **System Settings** (or **System Preferences** on older macOS)
2. Go to **Privacy & Security** → **Screen Recording**
3. Look for your app (might be listed as "Electron" or "Time Tracker")
4. Ensure the toggle is **ON** (enabled)

### Method 2: Check via Terminal

```bash
# List all apps with screen recording permission
tccutil reset ScreenCapture

# Or check specific app (if you know the bundle ID)
tccutil list ScreenCapture
```

### Method 3: Request Permission Programmatically

On macOS, Electron will automatically request permission when `desktopCapturer.getSources()` is first called. If permission was denied:

1. Go to **System Settings** → **Privacy & Security** → **Screen Recording**
2. Find your app and enable it
3. **Restart the app** (permissions are checked at app launch)

## Understanding the Logs

When screenshots are captured, check the console logs for:

```
[BG-UPLOAD] Detected 2 display(s), requesting screenshots with size 3840x1080
[BG-UPLOAD] Display 1: 1920x1080 at (0, 0), scale: 2
[BG-UPLOAD] Display 2: 1920x1080 at (1920, 0), scale: 2
[BG-UPLOAD] Received 2 screen source(s) from desktopCapturer
[BG-UPLOAD] Source 1: id="screen:0:0", name="Screen 1"
[BG-UPLOAD] Source 2: id="screen:1:0", name="Screen 2"
```

### What to Look For:

✅ **Good Signs:**
- Number of displays matches number of sources
- Each source has a unique ID and name
- Sources are being captured and uploaded

❌ **Problem Signs:**
- `Received 0 screen source(s)` - Permission denied or no displays
- `Received 1 screen source(s)` when you have 2+ displays - Permission partial or platform limitation
- Error messages about permissions

## Common Issues

### Issue 1: Only One Screen Captured

**Symptoms:** App detects 2 displays but only captures 1 screenshot

**Possible Causes:**
1. **macOS Permission Issue**: Screen recording permission not granted for all displays
2. **Platform Limitation**: Some Electron versions on macOS may only return the primary display
3. **Display Configuration**: External displays might not be properly recognized

**Solutions:**
1. Check System Settings → Privacy & Security → Screen Recording
2. Restart the app after granting permissions
3. Try disconnecting and reconnecting external displays
4. Update Electron to the latest version

### Issue 2: No Screenshots Captured

**Symptoms:** `Received 0 screen source(s)` in logs

**Solutions:**
1. Grant screen recording permission in System Settings
2. Restart the app completely (quit and reopen)
3. Check if you're running in a virtual machine (may have limitations)
4. Verify displays are connected and recognized by macOS

### Issue 3: Permission Denied Error

**Symptoms:** Error messages about screen recording

**Solutions:**
1. Go to System Settings → Privacy & Security → Screen Recording
2. Remove the app from the list (if present)
3. Restart the app - it will request permission again
4. Grant permission when prompted
5. If no prompt appears, manually add the app in System Settings

## Testing Screen Capture

### Test 1: Check Display Detection

```javascript
// In browser console
const { screen } = require('electron').remote;
console.log('Displays:', screen.getAllDisplays().length);
```

### Test 2: Check Source Count

```javascript
// In browser console
window.electronAPI.diagnoseScreenCapture().then(diag => {
  console.log('Displays:', diag.displays.length);
  console.log('Sources:', diag.sources.length);
  console.log('Permission Status:', diag.permissions);
});
```

### Test 3: Manual Capture Test

```javascript
// In browser console
window.electronAPI.captureAllScreens().then(screenshots => {
  console.log(`Captured ${screenshots.length} screens`);
  screenshots.forEach((s, i) => {
    console.log(`Screen ${i + 1}: ${s.name}`);
  });
});
```

## Platform-Specific Notes

### macOS (darwin)
- Requires explicit screen recording permission
- Permission is per-app, not per-display
- Some versions may only return primary display initially
- External displays may require additional setup

### Windows
- Generally works without special permissions
- All displays should be captured automatically
- May need to run as administrator in some cases

### Linux
- Varies by distribution and desktop environment
- May require additional packages or permissions
- Wayland vs X11 can affect behavior

## Electron Version Considerations

Different Electron versions handle multi-display capture differently:

- **Electron 20+**: Better multi-display support
- **Electron 15-19**: May have limitations
- **Electron <15**: Limited multi-display support

Your current version: Check `package.json` for the Electron version.

## Getting Help

If issues persist:

1. Run the diagnostic function and share the output
2. Check the console logs for error messages
3. Verify macOS version and Electron version
4. Test with a minimal Electron app to isolate the issue
5. Check Electron GitHub issues for known bugs

## Additional Resources

- [Electron Desktop Capturer Docs](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [macOS Screen Recording Permission](https://support.apple.com/guide/mac-help/control-access-to-screen-recording-mh32387/mac)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)

