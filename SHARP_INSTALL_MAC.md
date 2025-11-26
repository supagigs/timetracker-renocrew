# Fix Sharp Module Error on macOS

## Quick Fix

Run this command in your project directory on macOS:

```bash
npm install --include=optional sharp
```

Then restart the Electron app.

## Platform-Specific Installation

If the quick fix doesn't work, install the specific binary for your Mac:

### For Intel Macs (x64):
```bash
npm install --os=darwin --cpu=x64 sharp
```

### For Apple Silicon Macs (M1/M2/M3 - arm64):
```bash
npm install --os=darwin --cpu=arm64 sharp
```

### For Universal Support (both architectures):
```bash
npm install --os=darwin --cpu=x64 sharp --os=darwin --cpu=arm64 sharp
```

## Complete Reinstall

If you're still having issues, try a complete reinstall:

```bash
# Remove sharp and its dependencies
rm -rf node_modules/sharp
rm -rf node_modules/@img

# Clear npm cache (optional)
npm cache clean --force

# Reinstall
npm install --include=optional sharp

# Rebuild
npm rebuild sharp
```

## Verify Installation

After installing, verify sharp works:

```bash
node -e "require('sharp'); console.log('Sharp loaded successfully!')"
```

If you see "Sharp loaded successfully!", the installation worked!

## Why This Happens

Sharp uses platform-specific native binaries. When running in Electron on macOS, these binaries need to be properly installed. The `--include=optional` flag ensures that optional platform-specific dependencies are installed.

## For Electron Builds

The `asarUnpack` configuration in `package.json` ensures sharp binaries are extracted from the asar archive when the app is packaged. This is already configured correctly.

