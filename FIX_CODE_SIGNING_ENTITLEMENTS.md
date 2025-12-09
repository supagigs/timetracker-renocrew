# Fix: Entitlements Not Showing - Code Signing Issue

## Problem

When running `codesign -d --entitlements - "/path/to/Time Tracker.app"`, no entitlements are shown. This happens because:

1. **Code signing is disabled**: Your build script has `CSC_IDENTITY_AUTO_DISCOVERY=false`
2. **Without code signing, entitlements aren't embedded**: macOS only embeds entitlements during the signing process
3. **Hardened Runtime requires signing**: Even for development, the app needs to be signed (can use ad-hoc signature)

## Solution Options

### Option 1: Enable Ad-Hoc Signing (Recommended for Development)

This allows electron-builder to sign the app automatically with an ad-hoc signature (no Apple Developer account needed).

**Update `package.json`:**

```json
"mac": {
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "identity": null  // ← Add this for ad-hoc signing
}
```

**Update build script:**

```json
"build": "electron-builder",  // Remove CSC_IDENTITY_AUTO_DISCOVERY=false
```

**Or keep it explicit:**

```json
"build": "cross-env CSC_IDENTITY_AUTO_DISCOVERY=true electron-builder",
```

### Option 2: Manual Signing After Build (Current Setup)

If you want to keep `CSC_IDENTITY_AUTO_DISCOVERY=false`, you can manually sign after build:

**After building:**

```bash
# Sign the app with entitlements
codesign --force --deep --sign - \
  --entitlements build/entitlements.mac.plist \
  --options runtime \
  "dist/mac/Time Tracker.app"
```

**Or use the provided script:**

```bash
chmod +x scripts/sign-mac-app.sh
./scripts/sign-mac-app.sh "dist/mac/Time Tracker.app"
```

### Option 3: Use Proper Code Signing (For Distribution)

If you have an Apple Developer account:

```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "hardenedRuntime": true,
  "gatekeeperAssess": true,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

And remove `CSC_IDENTITY_AUTO_DISCOVERY=false` from build script.

## Recommended Solution: Option 1 (Ad-Hoc Signing)

For development and testing, use ad-hoc signing. I've already updated your `package.json` to include `"identity": null`.

**Next steps:**

1. **Update build script** (choose one):

   **Option A - Remove the flag entirely:**
   ```json
   "build": "electron-builder",
   ```

   **Option B - Explicitly enable:**
   ```json
   "build": "cross-env CSC_IDENTITY_AUTO_DISCOVERY=true electron-builder",
   ```

2. **Clean and rebuild:**
   ```bash
   rm -rf dist/
   npm run build
   ```

3. **Verify entitlements:**
   ```bash
   codesign -d --entitlements - "dist/mac/Time Tracker.app"
   ```

   Should now show all entitlements!

## Why This Works

- **Ad-hoc signing (`identity: null`)**: Creates a signature without requiring an Apple Developer account
- **Entitlements are embedded**: During the signing process, entitlements are embedded in the app
- **Hardened Runtime enabled**: Works with ad-hoc signatures for development
- **No code signing errors**: electron-builder handles it automatically

## Verification

After rebuilding with signing enabled:

```bash
# Check entitlements
codesign -d --entitlements - "dist/mac/Time Tracker.app"

# Should show:
# <?xml version="1.0" encoding="UTF-8"?>
# <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"...
# <plist version="1.0">
# <dict>
#     <key>com.apple.security.device.screen-capture</key>
#     <true/>
#     ...
# </dict>
# </plist>

# Check Hardened Runtime
codesign -dv "dist/mac/Time Tracker.app"
# Should show: runtime=Hardened Runtime
```

## Do You Need Electron Forge?

**No!** electron-builder can handle this perfectly. The issue was just that code signing was disabled. With `identity: null` (ad-hoc signing), electron-builder will:

1. ✅ Sign the app automatically
2. ✅ Embed entitlements during signing
3. ✅ Enable Hardened Runtime
4. ✅ Work without Apple Developer account

Electron Forge would require:
- ❌ Migrating entire build configuration
- ❌ Learning new tool
- ❌ More complex setup

**Stick with electron-builder** - it's already configured correctly, just needs signing enabled!

## Summary

**The fix:** Add `"identity": null` to mac config (already done) and enable code signing in build script.

**Current status:**
- ✅ `package.json` has `"identity": null` 
- ⚠️ Build script still has `CSC_IDENTITY_AUTO_DISCOVERY=false` (needs update)

**Action needed:**
- Update build script to enable signing (see Option 1 above)
- Rebuild the app
- Verify entitlements are now embedded


