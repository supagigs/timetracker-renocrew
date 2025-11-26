# Fix Sharp Module Issue on macOS

If you're getting the error:
```
Could not load the "sharp" module using the darwin-x64 runtime
```

Follow these steps to fix it:

## Quick Fix (Recommended)

Run this command in your project directory on macOS:

```bash
npm install --include=optional sharp
```

Or use the provided script:

```bash
chmod +x fix-sharp-mac.sh
./fix-sharp-mac.sh
```

## Manual Fix Steps

1. **Remove existing sharp installation:**
   ```bash
   rm -rf node_modules/sharp
   rm -rf node_modules/@img
   ```

2. **Reinstall sharp with optional dependencies:**
   ```bash
   npm install --include=optional sharp
   ```

3. **If that doesn't work, install platform-specific binaries:**
   ```bash
   # For Intel Macs (x64)
   npm install --os=darwin --cpu=x64 sharp
   
   # For Apple Silicon Macs (arm64)
   npm install --os=darwin --cpu=arm64 sharp
   
   # Or install both
   npm install --os=darwin --cpu=x64 sharp --os=darwin --cpu=arm64 sharp
   ```

4. **Rebuild sharp:**
   ```bash
   npm rebuild sharp
   ```

## For Electron Apps

If you're building an Electron app, make sure your `package.json` has:

```json
{
  "build": {
    "asarUnpack": [
      "node_modules/sharp/**/*",
      "node_modules/@img/**/*"
    ]
  }
}
```

This is already configured in your `package.json`.

## Verify Installation

After fixing, verify sharp works:

```bash
node -e "require('sharp'); console.log('Sharp loaded successfully!')"
```

If you see "Sharp loaded successfully!", the fix worked!

## Additional Notes

- The `postinstall` script in `package.json` will automatically try to rebuild sharp after `npm install`
- If you're using a package manager that doesn't support `--include=optional`, you may need to use `npm` directly
- For Electron apps, sharp binaries need to be unpacked from the asar archive, which is configured in the build settings

