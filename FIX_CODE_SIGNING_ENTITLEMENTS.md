# Fix: Entitlements Not Showing - Code Signing Issue

## Problem

When running `codesign -d --entitlements - "/path/to/Time Tracker.app"`, no entitlements are shown. This happens because:

1. **Code signing is disabled**: Build script had `CSC_IDENTITY_AUTO_DISCOVERY=false`
2. **Without code signing, entitlements aren't embedded**: macOS only embeds entitlements during the signing process
3. **Hardened Runtime requires signing**: Even for development, the app needs to be signed (can use ad-hoc signature)

## ✅ Solution Applied: Ad-Hoc Signing (Recommended for Development)

This solution allows electron-builder to sign the app automatically with an ad-hoc signature (no Apple Developer account needed).

### Configuration in `package.json`

**Mac build configuration:**
```json
"mac": {
  "category": "public.app-category.productivity",
  "icon": "SupagigsIcon.png",
  "target": [
    {
      "target": "dmg",
      "arch": "universal"
    }
  ],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "identity": null  // ← Enables ad-hoc signing
}
```

**Build scripts:**
```json
"scripts": {
  "build": "electron-builder",
  "dist": "electron-builder --publish=never"
}
```

**Note:** The `CSC_IDENTITY_AUTO_DISCOVERY=false` flag has been removed to allow automatic code signing.

## How to Build and Verify

### Step 1: Clean Previous Builds (Optional but Recommended)

```bash
rm -rf dist/
```

### Step 2: Build the App

```bash
npm run build
```

Or for distribution build:

```bash
npm run dist
```

### Step 3: Verify Entitlements Are Embedded

After building, check that entitlements are now embedded:

```bash
codesign -d --entitlements - "dist/mac/Time Tracker.app"
```

**Expected output:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.screen-capture</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
    <!-- ... other entitlements ... -->
</dict>
</plist>
```

### Step 4: Verify Hardened Runtime

```bash
codesign -dv "dist/mac/Time Tracker.app"
```

**Expected output should include:**
```
runtime=Hardened Runtime
```

## Why This Works

- **Ad-hoc signing (`identity: null`)**: Creates a signature without requiring an Apple Developer account
- **Entitlements are embedded**: During the signing process, entitlements are automatically embedded in the app
- **Hardened Runtime enabled**: Works with ad-hoc signatures for development
- **No code signing errors**: electron-builder handles it automatically

## Alternative Solutions

### Option 2: Manual Signing After Build

If you need to manually sign after build (not recommended for regular use):

```bash
# Sign the app with entitlements
codesign --force --deep --sign - \
  --entitlements build/entitlements.mac.plist \
  --options runtime \
  "dist/mac/Time Tracker.app"
```

Or use the provided script:

```bash
chmod +x scripts/sign-mac-app.sh
./scripts/sign-mac-app.sh "dist/mac/Time Tracker.app"
```

### Option 3: Use Proper Code Signing (For Distribution)

If you have an Apple Developer account and want to distribute the app:

**Update `package.json`:**

```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "hardenedRuntime": true,
  "gatekeeperAssess": true,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

**Build scripts remain the same:**
```json
"build": "electron-builder",
"dist": "electron-builder --publish=never"
```

## Current Status

✅ **Configuration Complete:**
- ✅ `package.json` has `"identity": null` in mac config
- ✅ Build scripts have `CSC_IDENTITY_AUTO_DISCOVERY=false` removed
- ✅ Entitlements file configured: `build/entitlements.mac.plist`

**Next Steps:**
1. Clean and rebuild: `rm -rf dist/ && npm run build`
2. Verify entitlements: `codesign -d --entitlements - "dist/mac/Time Tracker.app"`
3. Test the app to ensure permissions work correctly

## Troubleshooting

### Entitlements Still Not Showing

1. **Verify the build completed successfully** - Check for any errors during build
2. **Check entitlements file exists** - Ensure `build/entitlements.mac.plist` is present
3. **Verify code signing occurred** - Run `codesign -dv "dist/mac/Time Tracker.app"` to see signing info
4. **Clean and rebuild** - Sometimes cached builds can cause issues

### Code Signing Errors

If you see code signing errors:
- Ensure you're on macOS (code signing only works on macOS)
- Check that the entitlements file is valid XML
- Verify all required files are included in the build

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

**Stick with electron-builder** - it's already configured correctly!
