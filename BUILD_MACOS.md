# Building for macOS and Creating DMG Files

This guide explains how to build the Electron app for macOS and how the DMG (Disk Image) file is created.

## Prerequisites

1. **macOS machine** - You need a Mac to build for macOS (due to code signing requirements)
2. **Node.js 18+** and **npm 9+**
3. **Xcode Command Line Tools** (for native dependencies):
   ```bash
   xcode-select --install
   ```

## Building for macOS

### Option 1: Build DMG on macOS

From the project root directory:

```bash
# Install dependencies (if not already done)
npm install

# Build for macOS (creates DMG file)
npm run build -- --mac

# Or build only DMG (no other formats)
npm run dist -- --mac
```

### Option 2: Build for Specific Architecture

```bash
# Build for Intel (x64) only
npm run build -- --mac --x64

# Build for Apple Silicon (arm64) only
npm run build -- --mac --arm64

# Build for both architectures (universal)
npm run build -- --mac
```

## Output Files

After building, you'll find the output in the `dist/` directory:

- **`Time Tracker-<version>.dmg`** - The DMG installer file
- **`mac/Time Tracker.app`** - The application bundle (for testing)

## How DMG Files Are Created

The DMG file is automatically created by `electron-builder` based on the configuration in `package.json`:

### DMG Configuration Explained

```json
"dmg": {
  "title": "${productName} ${version}",           // DMG window title
  "icon": "SupagigsIcon.png",                     // DMG icon
  "background": null,                              // Custom background image (optional)
  "contents": [                                   // Items in DMG window
    {
      "x": 130,                                    // App icon position (left)
      "y": 220,
      "type": "file"                               // The .app file
    },
    {
      "x": 410,                                    // Applications link position (right)
      "y": 220,
      "type": "link",                              // Symlink to /Applications
      "path": "/Applications"
    }
  ],
  "window": {
    "width": 540,                                  // DMG window width
    "height": 380                                  // DMG window height
  },
  "format": "UDZO"                                 // Compressed format
}
```

### DMG Creation Process

1. **App Bundle Creation**: Electron Builder creates a `.app` bundle containing:
   - The Electron runtime
   - Your application code
   - Resources and assets
   - Native dependencies

2. **DMG Assembly**: 
   - Creates a disk image
   - Copies the `.app` bundle into it
   - Adds a symlink to `/Applications` folder
   - Sets up the window layout and icon positions
   - Compresses the image (UDZO format)

3. **Final DMG**: The resulting `.dmg` file can be:
   - Distributed to users
   - Opened by double-clicking
   - Users drag the app to Applications folder to install

## Customizing the DMG

### Add a Custom Background Image

1. Create a background image (540x380 pixels recommended)
2. Save it as `build/dmg-background.png`
3. Update `package.json`:
   ```json
   "dmg": {
     "background": "build/dmg-background.png",
     ...
   }
   ```

### Change DMG Window Size

Adjust the `window` dimensions in `package.json`:
```json
"window": {
  "width": 600,
  "height": 400
}
```

### Reposition Items

Adjust the `x` and `y` coordinates in the `contents` array:
```json
"contents": [
  {
    "x": 150,  // Move app icon
    "y": 200
  },
  {
    "x": 450,  // Move Applications link
    "y": 200
  }
]
```

## Icon Requirements

For best results on macOS:

1. **App Icon**: Use `.icns` file (recommended) or `.png`
   - Current config uses `SupagigsIcon.png` (works, but `.icns` is better)
   - To use `.icns`, update `package.json`:
     ```json
     "mac": {
       "icon": "SupagigsIcon.icns"
     }
     ```

2. **DMG Icon**: Currently uses `SupagigsIcon.png`
   - Should be at least 512x512 pixels
   - PNG format works fine

## Code Signing (Optional)

For distribution outside the Mac App Store, you may want to code sign:

1. Get an Apple Developer certificate
2. Update `package.json`:
   ```json
   "mac": {
     "identity": "Developer ID Application: Your Name",
     "hardenedRuntime": true,
     "gatekeeperAssess": true
   }
   ```

Without code signing, users will see a warning when opening the app (they can still open it via System Preferences → Security).

## Testing the DMG

1. Open the DMG file: `open dist/Time\ Tracker-*.dmg`
2. Verify the layout looks correct
3. Drag the app to Applications folder
4. Test launching the app from Applications

## Screen Recording Permissions

**Important**: On macOS, the packaged app requires screen recording permission to capture screenshots. This is different from the development version.

### First Launch Behavior

When users first launch the app from the DMG:
1. The app will automatically check for screen recording permission
2. If permission is not granted, a dialog will appear with instructions
3. Users need to grant permission in System Settings → Privacy & Security → Screen Recording
4. After granting permission, users must restart the app

### For Users

If screenshots don't work after installing from DMG:
1. Go to **System Settings** → **Privacy & Security** → **Screen Recording**
2. Find "Time Tracker" and enable it
3. Restart the app

See [MACOS_SCREENSHOT_PERMISSIONS.md](./MACOS_SCREENSHOT_PERMISSIONS.md) for detailed troubleshooting.

## Troubleshooting

### Build Fails with Native Module Errors
```bash
# Rebuild native modules
npm rebuild
npm run build -- --mac
```

### DMG Creation Fails
- Ensure you're on macOS
- Check that all required files exist (icon, etc.)
- Review build logs for specific errors

### App Doesn't Launch After Installation
- Check Console.app for error messages
- Verify `.env` file is included in the build
- Check that all dependencies are bundled correctly

## Quick Build Commands

```bash
# Full build (all platforms)
npm run build

# macOS only
npm run build -- --mac

# macOS universal (both architectures)
npm run build -- --mac --x64 --arm64

# Test build (unpacked directory, no DMG)
npm run pack -- --mac
```

## Distribution

Once you have the DMG file:
1. Test it on a clean macOS system
2. Upload to your distribution platform
3. Users download and open the DMG
4. Users drag the app to Applications to install

The DMG provides a familiar macOS installation experience!

