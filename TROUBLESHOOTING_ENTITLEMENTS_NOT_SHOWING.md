# Troubleshooting: Entitlements Not Showing in codesign

## Problem
When running `codesign -d --entitlements - "/Applications/Time Tracker.app"`, the output only shows the executable path but no entitlements. This means the entitlements were not embedded during the code signing process.

## Root Causes

1. **App wasn't rebuilt after adding entitlements**
   - Entitlements are embedded during the build/signing process
   - Simply updating the file isn't enough - you must rebuild

2. **Code signing failed silently**
   - electron-builder may have failed to sign the app
   - Check build logs for signing errors

3. **Entitlements file path issue**
   - electron-builder might not be finding the entitlements file
   - Path must be relative to project root

4. **Hardened Runtime not enabled**
   - Entitlements require Hardened Runtime to be enabled

## Solutions

### Solution 1: Clean Rebuild

**CRITICAL:** You must do a clean rebuild:

```bash
# Remove old build artifacts (DIST only - keep build/ folder with entitlements!)
rm -rf dist/

# Rebuild the app
npm run build
```

**Important:** Do NOT remove the `build/` folder - it contains `entitlements.mac.plist` which is needed during the build process!

### Solution 2: Verify Entitlements File Location

The entitlements file must be at: `build/entitlements.mac.plist`

Verify it exists:
```bash
ls -la build/entitlements.mac.plist
cat build/entitlements.mac.plist
```

### Solution 3: Check package.json Configuration

Verify your `package.json` has:
```json
"mac": {
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

### Solution 4: Check Build Logs

When building, look for:
- ✅ "Signing app" messages
- ✅ No errors about entitlements file not found
- ✅ No code signing errors

If you see errors like:
- ❌ "entitlements file not found"
- ❌ "code signing failed"
- ❌ "Hardened Runtime not enabled"

Fix those issues first.

### Solution 5: Manual Code Signing (If Needed)

If electron-builder isn't signing correctly, you can manually sign after build:

```bash
# First, build without signing
npm run build

# Then manually sign with entitlements
codesign --force --deep --sign - \
  --entitlements build/entitlements.mac.plist \
  "/path/to/Time Tracker.app"
```

### Solution 6: Verify After Rebuild

After rebuilding, check again:

```bash
# Check entitlements
codesign -d --entitlements - "/Applications/Time Tracker.app"

# Should show all entitlements like:
# <?xml version="1.0" encoding="UTF-8"?>
# <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"...
# <plist version="1.0">
# <dict>
#     <key>com.apple.security.device.screen-capture</key>
#     <true/>
#     ...
# </dict>
# </plist>

# Also verify Hardened Runtime
codesign -dv "/Applications/Time Tracker.app"
# Should show: runtime=Hardened Runtime
```

## Step-by-Step Fix

1. **Verify entitlements file exists:**
   ```bash
   cat build/entitlements.mac.plist
   ```

2. **Clean build output (keep build/ folder!):**
   ```bash
   rm -rf dist/
   ```
   
   **Note:** Keep the `build/` folder - it contains `entitlements.mac.plist` which is required during build.

3. **Rebuild the app:**
   ```bash
   npm run build
   ```

4. **Install the built app:**
   - Copy `dist/mac/Time Tracker.app` to `/Applications/`
   - Or install from the DMG

5. **Verify entitlements:**
   ```bash
   codesign -d --entitlements - "/Applications/Time Tracker.app"
   ```

6. **If still not showing, check build logs:**
   - Look for signing errors
   - Check if entitlements file was found
   - Verify Hardened Runtime is enabled

## Expected Output

After a successful build with entitlements, `codesign -d --entitlements -` should show:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
    <key>com.apple.security.device.screen-capture</key>
    <true/>
    <key>com.apple.security.accessibility</key>
    <true/>
</dict>
</plist>
```

## Common Issues

### Issue: "entitlements file not found"
**Fix:** Ensure file is at `build/entitlements.mac.plist` relative to project root

### Issue: "Hardened Runtime not enabled"
**Fix:** Add `"hardenedRuntime": true` to `package.json` mac config

### Issue: Code signing fails
**Fix:** 
- Check if you have a valid signing identity
- For development, use ad-hoc signing: `"identity": null` in mac config
- Or set `CSC_IDENTITY_AUTO_DISCOVERY=false` and sign manually

### Issue: Entitlements show but permission still denied
**Fix:**
- Reset TCC: `sudo tccutil reset ScreenCapture`
- Restart Mac
- Launch app and grant permission again

## Verification Checklist

After rebuilding, verify:

- [ ] `build/entitlements.mac.plist` exists
- [ ] `package.json` has `hardenedRuntime: true`
- [ ] `package.json` points to `build/entitlements.mac.plist`
- [ ] Build completed without errors
- [ ] `codesign -d --entitlements -` shows entitlements
- [ ] `codesign -dv` shows `runtime=Hardened Runtime`
- [ ] App is installed from built `.app` (not dev mode)

## Next Steps

Once entitlements are showing correctly:

1. Reset TCC permissions: `sudo tccutil reset ScreenCapture`
2. Restart your Mac
3. Launch the app from `/Applications/Time Tracker.app`
4. Grant permissions when prompted
5. Verify screenshots work

